import {
  concatHex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  toHex,
  type Hex,
} from "viem";
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
  type SmartAccount,
} from "viem/account-abstraction";
import { base, baseSepolia } from "viem/chains";
import type { ProofOfSuccess } from "@umbrella/runner/types";
import { agentTokenAbi } from "./abi.js";
import { getRelayerAccount, type MissionProofStruct } from "./signer.js";
import {
  canSponsor,
  getPaymasterConfig,
  recordSponsorship,
} from "./paymaster.js";

export type ChainWriteResult = {
  txHash: Hex;
  attester: Hex;
  paymasterSponsored: boolean;
  /** Set when UserOp receipt includes a paymaster address (on-chain sponsor). */
  paymasterAddress?: Hex;
  /** True when we couldn't actually broadcast (dry-run / simulation). */
  simulated: boolean;
  /** One-line explanation of why, if simulated. */
  reason?: string;
  /** Human-readable explorer URL for the settlement tx. */
  explorerUrl?: string;
};

/** Cached Coinbase Smart Account (4337 sender), derived from the relayer EOA. */
let cachedSmartAccount: Promise<SmartAccount> | null = null;

function httpTransport(url: string) {
  return http(url, {
    fetchOptions: {
      headers: {
        ...(process.env.CDP_PROJECT_ID
          ? { "x-cdp-project-id": process.env.CDP_PROJECT_ID }
          : {}),
      },
    },
  });
}

function baseScanTxUrl(chainId: number, txHash: Hex): string {
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  return `https://basescan.org/tx/${txHash}`;
}

/**
 * Settle a signed MissionProof on-chain.
 *
 * When `CDP_PAYMASTER_URL` is set and policy allows sponsorship, we submit a
 * **UserOperation** from a Coinbase Smart Account (owner = relayer EOA) so gas
 * is paid by the CDP Paymaster — the hot wallet does not spend ETH for gas.
 * The EIP-712 `signature` still proves the mission to `UmbrellaAgentToken`; the
 * smart account is only the execution vehicle.
 *
 * If sponsorship is unavailable or the AA path throws, we fall back to a
 * legacy `walletClient.writeContract` via `BASE_SEPOLIA_RPC_URL` (relayer pays gas).
 */
export async function writeRecordSuccess(
  tokenAddress: `0x${string}`,
  chainId: number,
  proof: ProofOfSuccess,
  struct: MissionProofStruct,
  digest: Hex,
  signature: Hex,
): Promise<ChainWriteResult> {
  const ownerAccount = getRelayerAccount();
  const chain = chainId === 8453 ? base : baseSepolia;

  const publicRpcUrl =
    chainId === 8453
      ? process.env.BASE_RPC_URL
      : process.env.BASE_SEPOLIA_RPC_URL ?? process.env.BASE_RPC_URL;

  const paymaster = getPaymasterConfig();
  const sponsorshipCostCents = estimateGasCents(proof);
  const sponsorable = canSponsor(paymaster, sponsorshipCostCents);
  const paymasterConfigured = paymaster.enabled;

  if (!publicRpcUrl && !paymasterConfigured) {
    return {
      txHash: simulatedTxHash(digest, tokenAddress),
      attester: ownerAccount.address,
      paymasterSponsored: sponsorable.ok,
      simulated: true,
      reason: "no rpc configured — simulated tx hash",
    };
  }

  const cdpUrl = paymaster.enabled ? paymaster.url : undefined;

  // --- Path A: CDP Paymaster + Coinbase Smart Account (gasless) ------------
  if (cdpUrl && sponsorable.ok) {
    try {
      const publicClient = createPublicClient({
        chain,
        transport: httpTransport(cdpUrl),
      });

      if (!cachedSmartAccount) {
        cachedSmartAccount = toCoinbaseSmartAccount({
          client: publicClient,
          owners: [ownerAccount],
          version: "1.1",
        });
      }
      const smartAccount = await cachedSmartAccount;

      const bundlerClient = createBundlerClient({
        account: smartAccount,
        client: publicClient,
        chain,
        transport: httpTransport(cdpUrl),
        paymaster: true,
      });

      const data = encodeFunctionData({
        abi: agentTokenAbi,
        functionName: "recordSuccess",
        args: [struct, signature],
      });

      const userOpHash = await bundlerClient.sendUserOperation({
        account: smartAccount,
        calls: [{ to: tokenAddress, data, value: 0n }],
        paymaster: true,
      });

      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });

      const txHash = receipt.receipt.transactionHash;
      recordSponsorship(sponsorshipCostCents);

      const explorerUrl = baseScanTxUrl(chainId, txHash);
      const pm = receipt.paymaster;
      console.log(
        `[relayer] gasless anchor — userOp=${userOpHash} tx=${txHash}` +
          (pm ? ` paymaster=${pm}` : "") +
          ` explorer=${explorerUrl}`,
      );

      return {
        txHash,
        attester: ownerAccount.address,
        paymasterSponsored: true,
        paymasterAddress: pm,
        simulated: false,
        explorerUrl,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        "[relayer] CDP sponsored UserOperation failed, falling back to EOA:",
        message,
      );
      // Continue to Path B
    }
  }

  // --- Path B: EOA + standard RPC (relayer pays gas) ------------------------
  if (!publicRpcUrl) {
    return {
      txHash: simulatedTxHash(digest, tokenAddress),
      attester: ownerAccount.address,
      paymasterSponsored: false,
      simulated: true,
      reason: "no public rpc for EOA fallback — simulated tx hash",
    };
  }

  try {
    const publicClient = createPublicClient({
      chain,
      transport: http(publicRpcUrl),
    });
    const walletClient = createWalletClient({
      chain,
      transport: http(publicRpcUrl),
      account: ownerAccount,
    });

    const { request } = await publicClient.simulateContract({
      address: tokenAddress,
      abi: agentTokenAbi,
      functionName: "recordSuccess",
      args: [struct, signature],
      account: ownerAccount,
    });

    const txHash = await walletClient.writeContract(request);
    if (sponsorable.ok) recordSponsorship(sponsorshipCostCents);

    const explorerUrl = baseScanTxUrl(chainId, txHash);
    console.log(
      `[relayer] EOA anchor (gas not sponsored) — tx=${txHash} explorer=${explorerUrl}`,
    );

    return {
      txHash,
      attester: ownerAccount.address,
      paymasterSponsored: false,
      simulated: false,
      explorerUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[relayer] recordSuccess broadcast failed:", message);
    return {
      txHash: simulatedTxHash(digest, tokenAddress),
      attester: ownerAccount.address,
      paymasterSponsored: false,
      simulated: true,
      reason: message,
    };
  }
}

function simulatedTxHash(digest: Hex, tokenAddress: `0x${string}`): Hex {
  const addressHex = tokenAddress.toLowerCase() as Hex;
  const tagHex = toHex("UMBRELLA_SIMULATED");
  return keccak256(concatHex([digest, addressHex, tagHex]));
}

function estimateGasCents(_proof: ProofOfSuccess): number {
  return 1;
}
