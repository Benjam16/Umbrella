import { type Address, encodeAbiParameters, keccak256 } from "viem";
import { base, baseSepolia } from "viem/chains";

/** WETH9 on Base / Base Sepolia (OP-Stack predeploy). */
export const WETH_ADDRESS: Address = "0x4200000000000000000000000000000000000006";
export const V4_LP_FEE_03 = 3000;
export const V4_TICK_SPACING_3000 = 60;

export type V4PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export function sortCurrencies(a: Address, b: Address): [Address, Address] {
  if (a.toLowerCase() === b.toLowerCase()) throw new Error("pool currencies must differ");
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

/**
 * Default Umbrella/relayer pool key: TOKEN / WETH, 0.3%, tickSpacing 60, optional IHooks.
 */
export function buildDefaultV4PoolKey(args: { token: Address; hooks: Address }): V4PoolKey {
  const [c0, c1] = sortCurrencies(args.token, WETH_ADDRESS);
  return {
    currency0: c0,
    currency1: c1,
    fee: V4_LP_FEE_03,
    tickSpacing: V4_TICK_SPACING_3000,
    hooks: args.hooks,
  };
}

export function wethIsCurrency0(key: V4PoolKey): boolean {
  return key.currency0.toLowerCase() === WETH_ADDRESS.toLowerCase();
}

export function tokenIsCurrency0(args: { token: Address; key: V4PoolKey }): boolean {
  return args.key.currency0.toLowerCase() === args.token.toLowerCase();
}

/**
 * Browser-exposed v4 single-hop swap router (UmbrellaV4SimpleSwap), per chain.
 * Empty env → graduated agents show explorer links but cannot swap in-app.
 */
export function v4SwapRouterForChain(chainId: number): Address | null {
  if (chainId === baseSepolia.id) {
    const v = process.env.NEXT_PUBLIC_UMBRELLA_V4_SWAP_ROUTER_SEPOLIA?.trim();
    return v && /^0x[a-fA-F0-9]{40}$/i.test(v) ? (v as Address) : null;
  }
  if (chainId === base.id) {
    const v =
      process.env.NEXT_PUBLIC_UMBRELLA_V4_SWAP_ROUTER_BASE?.trim() ??
      process.env.NEXT_PUBLIC_UMBRELLA_V4_SWAP_ROUTER?.trim();
    return v && /^0x[a-fA-F0-9]{40}$/i.test(v) ? (v as Address) : null;
  }
  return null;
}

export function poolIdFromKey(key: V4PoolKey): `0x${string}` {
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
