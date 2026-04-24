import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  encodeDeployData,
  http,
  keccak256,
  parseAbi,
  toBytes,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { loadMissionRecordArtifact } from "./artifacts";
import { curveFactoryAbi, agentTokenFactoryAbi } from "./abi";
import { getLaunchConfig, type LaunchConfig } from "./chain-config";

/**
 * Server-side launch pipeline primitives.
 *
 * This module is the one place we hold the hot deployer key. It exposes two
 * high-level operations:
 *   • {@link deployMissionRecord} — fires a CREATE deployment of the
 *     UmbrellaAgentMissionRecord contract for a specific launch.
 *   • {@link createCurveForToken} — relays an ERC-2612 permit into
 *     UmbrellaCurveFactory.createCurveWithPermit so the token supply is
 *     transferred into a new bonding curve in a single on-chain tx.
 *
 * Both operations require `UMBRELLA_DEPLOYER_PRIVATE_KEY` to be set.
 */

export class LaunchDeployerError extends Error {
  step: string;
  constructor(step: string, message: string, cause?: unknown) {
    super(message);
    this.step = step;
    this.cause = cause;
    this.name = "LaunchDeployerError";
  }
}

function requirePrivateKey(): Hex {
  const raw = process.env.UMBRELLA_DEPLOYER_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new LaunchDeployerError(
      "config",
      "UMBRELLA_DEPLOYER_PRIVATE_KEY is required for server-side deploys",
    );
  }
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new LaunchDeployerError("config", "UMBRELLA_DEPLOYER_PRIVATE_KEY must be a 32-byte hex string");
  }
  return normalized as Hex;
}

export function getDeployerAddress(): Address {
  const account = privateKeyToAccount(requirePrivateKey());
  return account.address;
}

type Clients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  config: LaunchConfig;
  deployer: Address;
};

function buildClients(chainId?: number): Clients {
  const config = getLaunchConfig(chainId);
  const account = privateKeyToAccount(requirePrivateKey());
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  }) as unknown as PublicClient;
  const walletClient = createWalletClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
    account,
  });
  return { publicClient, walletClient, config, deployer: account.address };
}

export type DeployMissionArgs = {
  chainId?: number;
  creator: Address;
  token: Address;
  missionCode: string;
  metadataURI: string;
  missionLabel: string;
};

export type MissionDeployResult = {
  address: Address;
  txHash: Hex;
  missionCodeHash: Hex;
  gasUsed: bigint;
};

/**
 * Deploys a fresh UmbrellaAgentMissionRecord for this launch and waits for
 * the receipt so callers can record the address and continue.
 */
export async function deployMissionRecord(args: DeployMissionArgs): Promise<MissionDeployResult> {
  const { publicClient, walletClient, deployer } = buildClients(args.chainId);
  const artifact = loadMissionRecordArtifact();
  const missionCodeHash = keccak256(toBytes(args.missionCode));

  let hash: Hex;
  try {
    hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      account: walletClient.account!,
      chain: walletClient.chain,
      args: [args.creator, args.token, missionCodeHash, args.metadataURI, args.missionLabel],
    });
  } catch (err) {
    throw new LaunchDeployerError(
      "deployHook",
      `mission record deploy failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new LaunchDeployerError(
      "deployHook",
      `mission record deploy tx reverted (from=${deployer}, tx=${hash})`,
    );
  }
  return {
    address: receipt.contractAddress,
    txHash: hash,
    missionCodeHash,
    gasUsed: receipt.gasUsed,
  };
}

export type CreateCurveArgs = {
  chainId?: number;
  tokenAddress: Address;
  creator: Address;
  hookAddress: Address;
  tokensSeed: bigint;
  permit: {
    deadline: bigint;
    v: number;
    r: Hex;
    s: Hex;
  };
};

export type CreateCurveResult = {
  curveAddress: Address;
  txHash: Hex;
  gasUsed: bigint;
};

/**
 * Calls UmbrellaCurveFactory.createCurveWithPermit. The factory consumes the
 * user's ERC-2612 signature and pulls the entire token supply into the
 * newly-deployed curve in one atomic step.
 */
export async function createCurveForToken(args: CreateCurveArgs): Promise<CreateCurveResult> {
  const { publicClient, walletClient, config } = buildClients(args.chainId);

  let hash: Hex;
  try {
    const { request } = await publicClient.simulateContract({
      account: walletClient.account!,
      address: config.curveFactory,
      abi: curveFactoryAbi,
      functionName: "createCurveWithPermit",
      args: [
        args.tokenAddress,
        args.creator,
        args.hookAddress,
        args.tokensSeed,
        args.permit.deadline,
        args.permit.v,
        args.permit.r,
        args.permit.s,
      ],
    });
    hash = await walletClient.writeContract(request);
  } catch (err) {
    throw new LaunchDeployerError(
      "deployCurve",
      `createCurveWithPermit failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new LaunchDeployerError(
      "deployCurve",
      `curve deploy tx reverted (tx=${hash})`,
    );
  }
  const curveAddress = decodeCurveAddressFromReceipt(receipt);
  if (!curveAddress) {
    throw new LaunchDeployerError(
      "deployCurve",
      `curve deploy succeeded but CurveCreated event not found in tx ${hash}`,
    );
  }
  return { curveAddress, txHash: hash, gasUsed: receipt.gasUsed };
}

function decodeCurveAddressFromReceipt(receipt: TransactionReceipt): Address | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: curveFactoryAbi,
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      if (decoded.eventName === "CurveCreated") {
        const args = decoded.args as { curve?: Address };
        if (args.curve) return args.curve;
      }
    } catch {
      // Log from another contract; skip.
    }
  }
  return null;
}

/**
 * Verify that a user-submitted factory tx:
 *   1. Confirmed on-chain
 *   2. Was sent to our configured UmbrellaAgentTokenFactory
 *   3. Emitted an AgentTokenCreated event the deployer field matches `wallet`
 *
 * Returns the token address + blueprintId + initial supply extracted from the log.
 */
export async function verifyFactoryTx(args: {
  chainId: number;
  txHash: Hex;
  expectedDeployer: Address;
}): Promise<{
  tokenAddress: Address;
  blueprintId: string;
  initialSupply: bigint;
  value: bigint;
}> {
  const { publicClient, config } = buildClients(args.chainId);
  const [tx, receipt] = await Promise.all([
    publicClient.getTransaction({ hash: args.txHash }),
    publicClient.getTransactionReceipt({ hash: args.txHash }),
  ]);
  if (receipt.status !== "success") {
    throw new LaunchDeployerError("verifyFactoryTx", "factory tx reverted");
  }
  if (!tx.to || tx.to.toLowerCase() !== config.agentTokenFactory.toLowerCase()) {
    throw new LaunchDeployerError(
      "verifyFactoryTx",
      `factory tx recipient ${tx.to} does not match configured factory ${config.agentTokenFactory}`,
    );
  }
  if (tx.from.toLowerCase() !== args.expectedDeployer.toLowerCase()) {
    throw new LaunchDeployerError(
      "verifyFactoryTx",
      `factory tx sender ${tx.from} does not match wallet ${args.expectedDeployer}`,
    );
  }

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.agentTokenFactory.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: agentTokenFactoryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "AgentTokenCreated") {
        const a = decoded.args as {
          token: Address;
          blueprintId: string;
          initialSupply: bigint;
        };
        return {
          tokenAddress: a.token,
          blueprintId: a.blueprintId,
          initialSupply: a.initialSupply,
          value: tx.value,
        };
      }
    } catch {
      // Not an AgentTokenCreated log; keep scanning.
    }
  }
  throw new LaunchDeployerError(
    "verifyFactoryTx",
    "AgentTokenCreated event not found in factory tx receipt",
  );
}

/**
 * Utility for Basescan verify submissions — produces the constructor arg blob
 * the API expects (hex without the 0x prefix).
 */
export function encodeMissionRecordConstructorArgs(args: {
  creator: Address;
  token: Address;
  missionCodeHash: Hex;
  metadataURI: string;
  missionLabel: string;
}): string {
  const encoded = encodeAbiParameters(
    parseAbi([
      "constructor(address creator_, address token_, bytes32 missionCodeHash_, string metadataURI_, string missionLabel_)",
    ])[0]?.inputs ??
      [
        { name: "creator_", type: "address" },
        { name: "token_", type: "address" },
        { name: "missionCodeHash_", type: "bytes32" },
        { name: "metadataURI_", type: "string" },
        { name: "missionLabel_", type: "string" },
      ],
    [args.creator, args.token, args.missionCodeHash, args.metadataURI, args.missionLabel],
  );
  return encoded.replace(/^0x/, "");
}

/**
 * Helper for `encodeDeployData` callers that want the raw init code of
 * UmbrellaAgentMissionRecord with constructor args baked in. Useful for
 * debugging Basescan payloads.
 */
export function buildMissionRecordInitCode(args: {
  creator: Address;
  token: Address;
  missionCodeHash: Hex;
  metadataURI: string;
  missionLabel: string;
}): Hex {
  const artifact = loadMissionRecordArtifact();
  return encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [args.creator, args.token, args.missionCodeHash, args.metadataURI, args.missionLabel],
  });
}
