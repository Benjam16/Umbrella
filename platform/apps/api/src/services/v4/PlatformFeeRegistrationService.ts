import { createPublicClient, createWalletClient, http, type Address, type Chain, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";

import { getHookRegistrarAccount } from "../relayer/signer.js";
import type { V4PoolKeyParts } from "./poolKey.js";
import { umbrellaPlatformFeeHookAbi } from "./umbrellaPlatformFeeHookAbi.js";

function chainAndRpc(chainId: number): { chain: Chain; rpcUrl: string } {
  if (chainId === 84532) {
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim();
    if (!rpcUrl) throw new Error("BASE_SEPOLIA_RPC_URL required");
    return { chain: baseSepolia, rpcUrl };
  }
  if (chainId === 8453) {
    const rpcUrl = process.env.BASE_RPC_URL?.trim();
    if (!rpcUrl) throw new Error("BASE_RPC_URL required");
    return { chain: base, rpcUrl };
  }
  throw new Error(`Unsupported chainId ${chainId}`);
}

export type PlatformFeeRegistrationResult = {
  transactionHash: Hex;
  explorerUrl: string;
};

/**
 * "Fee handshake": register pool → creator mapping on UmbrellaPlatformFeeHook.
 *
 * This must be sent from an account authorized by the hook (owner or registrar).
 */
export async function registerCreatorForV4Pool(opts: {
  chainId: number;
  hook: Address;
  poolKey: V4PoolKeyParts;
  creator: Address;
}): Promise<PlatformFeeRegistrationResult> {
  const { chain, rpcUrl } = chainAndRpc(opts.chainId);
  const account = getHookRegistrarAccount();

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.writeContract({
    address: opts.hook,
    abi: umbrellaPlatformFeeHookAbi,
    functionName: "registerPool",
    args: [
      {
        currency0: opts.poolKey.currency0,
        currency1: opts.poolKey.currency1,
        fee: opts.poolKey.fee,
        tickSpacing: opts.poolKey.tickSpacing,
        hooks: opts.poolKey.hooks,
      },
      opts.creator,
    ],
  });

  await publicClient.waitForTransactionReceipt({ hash });

  const explorerUrl =
    opts.chainId === 84532 ? `https://sepolia.basescan.org/tx/${hash}` : `https://basescan.org/tx/${hash}`;

  return { transactionHash: hash, explorerUrl };
}

