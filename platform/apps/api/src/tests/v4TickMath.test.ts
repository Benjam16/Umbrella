import assert from "node:assert/strict";
import { test } from "node:test";

import {
  nearestUsableTick,
  rawToken1PerToken0FromUsd,
  tickFromPriceToken1PerToken0,
  ticksFromUsdBandOnToken1,
} from "../services/v4/V4TickMath.js";

test("tickFromPriceToken1PerToken0 is ~0 at 1:1 ratio", () => {
  const t = tickFromPriceToken1PerToken0(1);
  assert.ok(t >= -1 && t <= 1);
});

test("nearestUsableTick snaps to spacing", () => {
  assert.equal(nearestUsableTick(61, 60), 60);
  assert.equal(nearestUsableTick(-59, 60), -60);
});

test("rawToken1PerToken0FromUsd matches 1:1 USD with same decimals", () => {
  const r = rawToken1PerToken0FromUsd({
    usdPerWholeToken0: 3000,
    usdPerWholeToken1: 3000,
    decimals0: 18,
    decimals1: 18,
  });
  assert.equal(r, 1);
});

test("ticksFromUsdBandOnToken1 orders lower/upper", () => {
  const { tickLower, tickUpper } = ticksFromUsdBandOnToken1({
    usdPerWholeToken0: 3000,
    usdToken1Lower: 0.04,
    usdToken1Upper: 0.06,
    decimals0: 18,
    decimals1: 18,
    tickSpacing: 60,
  });
  assert.ok(tickLower < tickUpper);
});
