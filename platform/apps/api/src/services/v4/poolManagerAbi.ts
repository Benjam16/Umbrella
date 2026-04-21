import { umbrellaV4RouterAbi } from "./umbrellaV4RouterAbi.js";

/**
 * Minimal IPoolManager ABI for `initialize` + frontend observers.
 * Full interface lives in `platform/contracts/lib/v4-core`.
 */
export const poolManagerInitializeAbi = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "sqrtPriceX96", type: "uint160" },
    ],
    outputs: [{ name: "tick", type: "int24" }],
  },
  {
    type: "function",
    name: "extsload",
    stateMutability: "view",
    inputs: [{ name: "slot", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

/** Bundle for dashboard / chart widgets + swarm encoding. */
export const poolObserverBundle = {
  poolManagerInitializeAbi,
  umbrellaV4RouterAbi,
  description:
    "Use poolKey + poolId + sqrtPriceX96 with Uniswap v4 StateLibrary or indexer for live price; initialize is permissionless on PoolManager. umbrellaV4RouterAbi is for UmbrellaV4Router.modifyLiquidity batches.",
};
