import { encodeAbiParameters, keccak256, type Address } from "viem";

import { DEFAULT_WETH_BASE, V4_LP_FEE_03_BPS, V4_TICK_SPACING_FOR_3000 } from "./constants.js";

export type V4PoolKeyParts = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** v4 requires address(currency0) < address(currency1). */
export function sortCurrencies(a: Address, b: Address): [Address, Address] {
  const bigA = BigInt(a);
  const bigB = BigInt(b);
  if (bigA === bigB) throw new Error("pool currencies must differ");
  return bigA < bigB ? [a, b] : [b, a];
}

/**
 * Build PoolKey for token / WETH (or two arbitrary ERC20s) with default 0.3% tier.
 */
export function buildDefaultPoolKey(opts: {
  token: Address;
  quoteToken?: Address;
  hook?: Address;
  fee?: number;
  tickSpacing?: number;
}): V4PoolKeyParts {
  const quote = opts.quoteToken ?? DEFAULT_WETH_BASE;
  const [c0, c1] = sortCurrencies(opts.token, quote);
  return {
    currency0: c0,
    currency1: c1,
    fee: opts.fee ?? V4_LP_FEE_03_BPS,
    tickSpacing: opts.tickSpacing ?? V4_TICK_SPACING_FOR_3000,
    hooks: opts.hook ?? "0x0000000000000000000000000000000000000000",
  };
}

/** PoolId = keccak256(abi.encode(PoolKey)) — matches `PoolKey.toId()`. */
export function computePoolId(key: V4PoolKeyParts): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "currency0", type: "address" },
            { name: "currency1", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "tickSpacing", type: "int24" },
            { name: "hooks", type: "address" },
          ],
        },
      ],
      [
        {
          currency0: key.currency0,
          currency1: key.currency1,
          fee: key.fee,
          tickSpacing: key.tickSpacing,
          hooks: key.hooks,
        },
      ],
    ),
  );
}
