import { V4_TICK_SPACING_FOR_3000 } from "./constants.js";

/** Uniswap v3/v4 tick bounds (fits uint24 tick spacing math). */
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

const LN_1_0001 = Math.log(1.0001);

/**
 * Convert pool price ratio to a tick index.
 *
 * `priceToken1PerToken0` is **token1 raw / token0 raw** (smallest units), matching
 * Uniswap’s “price” at tick `t`: approximately `1.0001^t` (within tick spacing).
 */
export function tickFromPriceToken1PerToken0(priceToken1PerToken0: number): number {
  if (!(priceToken1PerToken0 > 0) || !Number.isFinite(priceToken1PerToken0)) {
    throw new Error("priceToken1PerToken0 must be a finite positive number");
  }
  return Math.floor(Math.log(priceToken1PerToken0) / LN_1_0001);
}

/**
 * Snap a tick down to the nearest multiple of `tickSpacing` (Uniswap pools only
 * allow ticks where `tick % tickSpacing === 0`).
 */
export function nearestUsableTick(tick: number, tickSpacing: number): number {
  if (tickSpacing <= 0) throw new Error("tickSpacing must be positive");
  return Math.floor(tick / tickSpacing) * tickSpacing;
}

/**
 * Raw on-chain ratio **token1 per token0** (wei-scale) from USD prices of **one full token**
 * of each leg (e.g. WETH ≈ 3000, mission token ≈ 0.05).
 *
 * `raw = (usdToken0 / usdToken1) * 10^(decimals1 - decimals0)`.
 */
export function rawToken1PerToken0FromUsd(opts: {
  usdPerWholeToken0: number;
  usdPerWholeToken1: number;
  decimals0: number;
  decimals1: number;
}): number {
  const { usdPerWholeToken0, usdPerWholeToken1, decimals0, decimals1 } = opts;
  if (!(usdPerWholeToken0 > 0) || !(usdPerWholeToken1 > 0)) {
    throw new Error("USD prices must be positive");
  }
  return (usdPerWholeToken0 / usdPerWholeToken1) * 10 ** (decimals1 - decimals0);
}

/**
 * Turn a USD “band” on the mission token (token1) into `tickLower` / `tickUpper`
 * when token0 is the priced quote (e.g. WETH). Higher mission USD ⇒ fewer token1 per token0.
 */
export function ticksFromUsdBandOnToken1(opts: {
  usdPerWholeToken0: number;
  /** Lower / upper bound of token1’s USD price (e.g. floor $0.04, ceiling $0.06). */
  usdToken1Lower: number;
  usdToken1Upper: number;
  decimals0: number;
  decimals1: number;
  tickSpacing?: number;
}): { tickLower: number; tickUpper: number } {
  const spacing = opts.tickSpacing ?? V4_TICK_SPACING_FOR_3000;
  const lo = Math.min(opts.usdToken1Lower, opts.usdToken1Upper);
  const hi = Math.max(opts.usdToken1Lower, opts.usdToken1Upper);
  const rawAtLo = rawToken1PerToken0FromUsd({
    usdPerWholeToken0: opts.usdPerWholeToken0,
    usdPerWholeToken1: lo,
    decimals0: opts.decimals0,
    decimals1: opts.decimals1,
  });
  const rawAtHi = rawToken1PerToken0FromUsd({
    usdPerWholeToken0: opts.usdPerWholeToken0,
    usdPerWholeToken1: hi,
    decimals0: opts.decimals0,
    decimals1: opts.decimals1,
  });
  const tLo = tickFromPriceToken1PerToken0(rawAtLo);
  const tHi = tickFromPriceToken1PerToken0(rawAtHi);
  const lower = Math.min(tLo, tHi);
  const upper = Math.max(tLo, tHi);
  let tickLower = nearestUsableTick(lower, spacing);
  let tickUpper = nearestUsableTick(upper, spacing);
  if (tickLower < MIN_TICK) tickLower = MIN_TICK;
  if (tickUpper > MAX_TICK) tickUpper = MAX_TICK;
  if (tickLower >= tickUpper) {
    throw new Error("band collapsed to empty range after snapping — widen prices or spacing");
  }
  return { tickLower, tickUpper };
}

/**
 * Short reference for LLM system prompts (keep in sync with functions above).
 */
export const V4_TICK_MATH_FOR_GEMMA = `
V4 tick helpers (token0 & token1 are sorted by address in the pool; know which leg is your mission token):
- Raw ratio token1/token0 in wei: (usdToken0/usdToken1) * 10^(decimals1-decimals0) when you have USD prices per whole token.
- tick ≈ floor(ln(rawRatio) / ln(1.0001)); then snap to tickSpacing (60 for 0.3% tier).
- For a USD floor/ceiling on the mission token (token1) vs WETH (token0), use ticksFromUsdBandOnToken1 or mirror the math in code.
`.trim();
