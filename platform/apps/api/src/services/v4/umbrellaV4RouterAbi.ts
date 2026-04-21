/**
 * ABI for `UmbrellaV4Router` (platform/contracts/src/v4/UmbrellaV4Router.sol).
 * Use with `encodeFunctionData` for swarm / relayer batches.
 */
export const umbrellaV4RouterAbi = [
  {
    type: "function",
    name: "modifyLiquidity",
    stateMutability: "payable",
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
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "liquidityDelta", type: "int256" },
          { name: "salt", type: "bytes32" },
        ],
      },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [
      {
        name: "delta",
        type: "tuple",
        components: [
          { name: "amount0", type: "int128" },
          { name: "amount1", type: "int128" },
        ],
      },
    ],
  },
] as const;
