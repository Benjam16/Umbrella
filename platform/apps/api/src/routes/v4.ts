import { Hono } from "hono";
import { z } from "zod";
import { isAddress, type Address } from "viem";

import { executeSovereignMission } from "../services/v4/SovereignMission.js";

export const v4Routes = new Hono();

const missionSchema = z.object({
  chainId: z.number().int(),
  token: z.string().refine((x) => isAddress(x), "token"),
  creator: z.string().refine((x) => isAddress(x), "creator").optional(),
  hook: z.string().refine((x) => isAddress(x), "hook").optional(),
  quoteToken: z.string().refine((x) => isAddress(x), "quoteToken").optional(),
  liquidityRouter: z.string().refine((x) => isAddress(x), "liquidityRouter").optional(),
  seedDonatePerAgent: z
    .object({
      agentCount: z.number().int().min(1).max(32),
      amount0Wei: z.string().regex(/^\d+$/),
      amount1Wei: z.string().regex(/^\d+$/),
      staggerMs: z.number().int().min(0).max(600_000).optional(),
      mnemonic: z.string().optional(),
    })
    .optional(),
  seedModifyLiquidityPerAgent: z
    .object({
      agentCount: z.number().int().min(1).max(32),
      tickLower: z.number().int(),
      tickUpper: z.number().int(),
      liquidityDelta: z.string().regex(/^-?\d+$/),
      salt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      hookData: z
        .string()
        .refine(
          (x) => x === "0x" || (x.startsWith("0x") && x.length % 2 === 0),
          "hookData hex",
        )
        .optional(),
      staggerMs: z.number().int().min(0).max(600_000).optional(),
      mnemonic: z.string().optional(),
      thickLiquidity: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /v1/v4/mission
 * Initialize v4 pool for an existing token (+ optional swarm seed: donate or modify-liquidity).
 */
v4Routes.post("/mission", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = missionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  const d = parsed.data;
  try {
    const result = await executeSovereignMission({
      chainId: d.chainId,
      token: d.token as Address,
      creator: d.creator as Address | undefined,
      hook: d.hook as Address | undefined,
      quoteToken: d.quoteToken as Address | undefined,
      liquidityRouter: d.liquidityRouter as Address | undefined,
      seedDonatePerAgent: d.seedDonatePerAgent
        ? {
            agentCount: d.seedDonatePerAgent.agentCount,
            amount0Wei: BigInt(d.seedDonatePerAgent.amount0Wei),
            amount1Wei: BigInt(d.seedDonatePerAgent.amount1Wei),
            staggerMs: d.seedDonatePerAgent.staggerMs,
            mnemonic: d.seedDonatePerAgent.mnemonic,
          }
        : undefined,
      seedModifyLiquidityPerAgent: d.seedModifyLiquidityPerAgent
        ? {
            agentCount: d.seedModifyLiquidityPerAgent.agentCount,
            tickLower: d.seedModifyLiquidityPerAgent.tickLower,
            tickUpper: d.seedModifyLiquidityPerAgent.tickUpper,
            liquidityDelta: BigInt(d.seedModifyLiquidityPerAgent.liquidityDelta),
            salt: d.seedModifyLiquidityPerAgent.salt as `0x${string}`,
            hookData: d.seedModifyLiquidityPerAgent.hookData as `0x${string}` | undefined,
            staggerMs: d.seedModifyLiquidityPerAgent.staggerMs,
            mnemonic: d.seedModifyLiquidityPerAgent.mnemonic,
            thickLiquidity: d.seedModifyLiquidityPerAgent.thickLiquidity,
          }
        : undefined,
    });
    return c.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});
