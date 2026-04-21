import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";

import { getRelayerAccount } from "../relayer/signer.js";
import {
  DEFAULT_V4_POOL_MANAGER_BASE_SEPOLIA,
  SQRT_PRICE_X96_1_1,
} from "./constants.js";
import type { V4PoolKeyParts } from "./poolKey.js";
import { poolManagerInitializeAbi } from "./poolManagerAbi.js";

function chainRpc(chainId: number): { chain: Chain; rpcUrl: string } {
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

export type InitializePoolResult = {
  transactionHash: Hex;
  poolManager: Address;
  sqrtPriceX96: bigint;
  explorerUrl: string;
};

/**
 * Permissionless `PoolManager.initialize` — no unlock wrapper required.
 */
export async function sendInitializePool(opts: {
  chainId: number;
  poolKey: V4PoolKeyParts;
  sqrtPriceX96?: bigint;
  poolManager?: Address;
}): Promise<InitializePoolResult> {
  const { chain, rpcUrl } = chainRpc(opts.chainId);
  const account = getRelayerAccount();
  const poolManager = opts.poolManager ?? DEFAULT_V4_POOL_MANAGER_BASE_SEPOLIA;
  const sqrtPriceX96 = opts.sqrtPriceX96 ?? SQRT_PRICE_X96_1_1;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const data = encodeFunctionData({
    abi: poolManagerInitializeAbi,
    functionName: "initialize",
    args: [
      {
        currency0: opts.poolKey.currency0,
        currency1: opts.poolKey.currency1,
        fee: opts.poolKey.fee,
        tickSpacing: opts.poolKey.tickSpacing,
        hooks: opts.poolKey.hooks,
      },
      sqrtPriceX96,
    ],
  });

  const hash = await walletClient.sendTransaction({
    account,
    chain,
    to: poolManager,
    data,
  });

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  await publicClient.waitForTransactionReceipt({ hash });

  const explorerUrl =
    opts.chainId === 84532
      ? `https://sepolia.basescan.org/tx/${hash}`
      : `https://basescan.org/tx/${hash}`;

  return {
    transactionHash: hash,
    poolManager,
    sqrtPriceX96,
    explorerUrl,
  };
}
