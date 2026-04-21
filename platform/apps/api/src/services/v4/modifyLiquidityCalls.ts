import { encodeFunctionData, type Address, type Hex } from "viem";

import type { SwarmCall } from "../swarm/types.js";
import type { V4PoolKeyParts } from "./poolKey.js";
import { umbrellaV4RouterAbi } from "./umbrellaV4RouterAbi.js";

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Max approve so the router can pull whatever the pool needs for this delta. */
export const MAX_UINT256 = 2n ** 256n - 1n;

export type ModifyLiquidityParams = {
  tickLower: number;
  tickUpper: number;
  liquidityDelta: bigint;
  salt: Hex;
  hookData?: Hex;
};

/**
 * Approve both legs (max) + `UmbrellaV4Router.modifyLiquidity` in one batch.
 * Liquidity accrues to the **router** position (see contract NatSpec).
 */
export function buildUmbrellaV4ModifyLiquidityCalls(opts: {
  poolKey: V4PoolKeyParts;
  router: Address;
  params: ModifyLiquidityParams;
}): SwarmCall[] {
  const { poolKey, router, params } = opts;
  const hookData = (params.hookData ?? "0x") as Hex;

  const modifyData = encodeFunctionData({
    abi: umbrellaV4RouterAbi,
    functionName: "modifyLiquidity",
    args: [
      {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
      },
      {
        tickLower: params.tickLower,
        tickUpper: params.tickUpper,
        liquidityDelta: params.liquidityDelta,
        salt: params.salt,
      },
      hookData,
    ],
  });

  const approve0 = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [router, MAX_UINT256],
  });
  const approve1 = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [router, MAX_UINT256],
  });

  return [
    { to: poolKey.currency0, data: approve0, value: 0n },
    { to: poolKey.currency1, data: approve1, value: 0n },
    { to: router, data: modifyData, value: 0n },
  ];
}
