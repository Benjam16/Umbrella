import { createPublicClient, createWalletClient, http, type Chain, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { Abi } from "viem";

import { getRelayerAccount } from "../relayer/signer.js";

function chainAndRpc(chainId: number): { chain: Chain; rpcUrl: string } {
  if (chainId === 84532) {
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
    if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL is required to deploy on Base Sepolia");
    return { chain: baseSepolia, rpcUrl };
  }
  if (chainId === 8453) {
    const rpcUrl = process.env.BASE_RPC_URL?.trim();
    if (!rpcUrl) throw new Error("BASE_RPC_URL is required to deploy on Base mainnet");
    return { chain: base, rpcUrl };
  }
  throw new Error(`Unsupported chainId ${chainId} for forge deploy (use 84532 or 8453)`);
}

export type DeployCompiledResult = {
  contractAddress: Hex;
  transactionHash: Hex;
  explorerUrl: string;
};

/**
 * Deploy compiled bytecode with the **relayer EOA** (`UMBRELLA_RELAYER_PRIVATE_KEY`).
 * Gas is paid from that account — fund it on the target network.
 */
export async function deployCompiledContract(opts: {
  chainId: number;
  abi: Abi;
  bytecode: Hex;
  constructorArgs?: readonly unknown[];
}): Promise<DeployCompiledResult> {
  const { chain, rpcUrl } = chainAndRpc(opts.chainId);
  const account = getRelayerAccount();

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.deployContract({
    abi: opts.abi,
    bytecode: opts.bytecode,
    args: (opts.constructorArgs ?? []) as never[],
    account,
    chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const addr = receipt.contractAddress;
  if (!addr) {
    throw new Error("deployment receipt missing contractAddress");
  }

  const explorerUrl =
    opts.chainId === 84532
      ? `https://sepolia.basescan.org/tx/${hash}`
      : `https://basescan.org/tx/${hash}`;

  return {
    contractAddress: addr,
    transactionHash: hash,
    explorerUrl,
  };
}
