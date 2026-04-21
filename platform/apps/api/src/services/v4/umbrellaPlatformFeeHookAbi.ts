import type { Abi } from "viem";

/**
 * UmbrellaPlatformFeeHook ABI (minimal) — used for the "fee handshake"
 * that enables creator revenue share.
 */
export const umbrellaPlatformFeeHookAbi = [
  {
    type: "function",
    name: "registerPool",
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
      { name: "creator", type: "address" },
    ],
    outputs: [],
  },
] as const satisfies Abi;

