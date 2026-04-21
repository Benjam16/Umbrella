import { Hono } from "hono";
import { z } from "zod";
import { isAddress, isHex } from "viem";
import type { Address, Hex } from "viem";
import { launchSwarm } from "../services/swarm/SwarmManager.js";
import { pollGemmaDecision, pollGemmaPlan } from "../services/gemma/GemmaOrchestrator.js";
import {
  dispatchToolPlanToSwarmCalls,
  filterSwarmSteps,
  isForgeStep,
  parseOrchestratorPlan,
} from "../services/swarm/ActionDispatcher.js";
import type { SwarmCall } from "../services/swarm/types.js";

export const swarmRoutes = new Hono();

const hexCallData = z.string().refine((x) => isHex(x), "must be hex");

const swarmCallJson = z.object({
  to: z.string().refine((x) => isAddress(x), "invalid to"),
  data: hexCallData,
  value: z.string().regex(/^\d+$/).optional(),
});

function toSwarmCalls(rows: z.infer<typeof swarmCallJson>[]): SwarmCall[] {
  return rows.map((r) => ({
    to: r.to as Address,
    data: r.data as Hex,
    value: r.value ? BigInt(r.value) : 0n,
  }));
}

const launchSchema = z
  .object({
    chainId: z.number().int().default(84532),
    agentCount: z.number().int().min(1).max(32).optional(),
    complexity: z.number().int().min(1).max(10).optional(),
    planStepCount: z.number().int().min(1).max(256).optional(),
    staggerMs: z.number().int().min(0).max(600_000).optional(),
    mnemonic: z.string().optional(),
    target: z.string().refine((x) => isAddress(x), "invalid target").optional(),
    callData: hexCallData.optional(),
    uniformCalls: z.array(swarmCallJson).optional(),
    callsPerAgent: z.array(z.array(swarmCallJson)).optional(),
  })
  .superRefine((data, ctx) => {
    const hasLegacy = data.target && data.callData;
    const hasUniform = data.uniformCalls && data.uniformCalls.length > 0;
    const hasPerAgent = data.callsPerAgent && data.callsPerAgent.length > 0;
    const modes = [hasLegacy, hasUniform, hasPerAgent].filter(Boolean).length;
    if (modes === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide target+callData, uniformCalls, or callsPerAgent",
      });
    }
    if (modes > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use only one of: target+callData, uniformCalls, callsPerAgent",
      });
    }
  });

/**
 * POST /v1/swarm/launch
 * Flexible execution: legacy target+callData, uniformCalls (repeated per agent), or callsPerAgent (split work).
 */
swarmRoutes.post("/launch", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = launchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  const d = parsed.data;
  try {
    const result = await launchSwarm({
      chainId: d.chainId,
      agentCount: d.agentCount,
      complexity: d.complexity,
      planStepCount: d.planStepCount,
      staggerMs: d.staggerMs,
      mnemonic: d.mnemonic,
      target: d.target as Address | undefined,
      callData: d.callData as Hex | undefined,
      uniformCalls: d.uniformCalls?.length ? toSwarmCalls(d.uniformCalls) : undefined,
      callsPerAgent: d.callsPerAgent?.length
        ? d.callsPerAgent.map((batch) => toSwarmCalls(batch))
        : undefined,
    });

    return c.json({
      ok: true,
      ...result,
      hint: "Poll userOpHashes for inclusion; each agent may include multiple calls in one UserOp.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

const planRequestSchema = z.object({
  userIntent: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});

/**
 * POST /v1/swarm/plan
 * Gemma returns a validated tool plan (no chain execution).
 */
swarmRoutes.post("/plan", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  const plan = await pollGemmaPlan(parsed.data.userIntent, parsed.data.context ?? {});
  if (!plan) {
    return c.json({ ok: false, error: "GEMMA_VPS_URL not configured" }, 503);
  }

  const validated = parseOrchestratorPlan({ steps: plan.steps });
  return c.json({
    ok: true,
    steps: plan.steps,
    validation: validated.ok ? { ok: true as const } : { ok: false as const, error: validated.error },
    raw: plan.raw,
  });
});

const dispatchSchema = z.object({
  chainId: z.number().int().default(84532),
  staggerMs: z.number().int().min(0).max(600_000).optional(),
  mnemonic: z.string().optional(),
  steps: z.array(z.unknown()),
});

/**
 * POST /v1/swarm/dispatch
 * Validate tool steps → encode → launch swarm (dynamic N from plan).
 */
swarmRoutes.post("/dispatch", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = dispatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }

  const stepsParsed = parseOrchestratorPlan({ steps: parsed.data.steps });
  if (!stepsParsed.ok) {
    return c.json({ error: "invalid_plan", details: stepsParsed.error }, 400);
  }
  if (stepsParsed.steps.some(isForgeStep)) {
    return c.json(
      {
        error: "forge_steps_not_allowed_here",
        hint: "Use POST /v1/forge/execute-plan for write_solidity / compile_solidity / deploy_contract",
      },
      400,
    );
  }

  const dispatched = dispatchToolPlanToSwarmCalls(filterSwarmSteps(stepsParsed.steps));
  if (!dispatched.ok) {
    return c.json({ error: "dispatch_failed", message: dispatched.error }, 400);
  }

  try {
    const result = await launchSwarm({
      chainId: parsed.data.chainId,
      callsPerAgent: dispatched.perAgentCalls,
      staggerMs: parsed.data.staggerMs,
      mnemonic: parsed.data.mnemonic,
    });

    return c.json({
      ok: true,
      spawnHint: dispatched.spawnHint,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

/**
 * POST /v1/swarm/gemma-ping
 * Legacy single decision JSON (market snapshot).
 */
swarmRoutes.post("/gemma-ping", async (c) => {
  let marketState: Record<string, unknown>;
  try {
    marketState = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const decision = await pollGemmaDecision(marketState);
  if (!decision) {
    return c.json({ ok: false, error: "GEMMA_VPS_URL not configured" }, 503);
  }
  return c.json({ ok: true, decision });
});
