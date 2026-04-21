import type { Address } from "viem";

/** Uniswap v4 PoolManager on Base Sepolia (canonical deployment). */
export const DEFAULT_V4_POOL_MANAGER_BASE_SEPOLIA: Address =
  (process.env.V4_POOL_MANAGER_BASE_SEPOLIA as Address) ||
  "0x7da1d65f8b249183667cde74c5cbd46dd38aa829";

/** Uniswap Universal Router on Base Sepolia. */
export const DEFAULT_UNIVERSAL_ROUTER_BASE_SEPOLIA: Address =
  (process.env.V4_UNIVERSAL_ROUTER_BASE_SEPOLIA as Address) ||
  "0x95273d871c8156636e114b63797d78D7E1720d81";

/** WETH on Base / Base Sepolia (OP Stack predeploy). */
export const DEFAULT_WETH_BASE: Address = "0x4200000000000000000000000000000000000006";

/** sqrt(1) * 2^96 — 1:1 initial price (tick 0). Matches v4-core `Constants.SQRT_PRICE_1_1`. */
export const SQRT_PRICE_X96_1_1 = 79228162514264337593543950336n;

/** 0.30% fee tier; pairs with tickSpacing 60 in canonical Uniswap configs. */
export const V4_LP_FEE_03_BPS = 3000;

export const V4_TICK_SPACING_FOR_3000 = 60;
