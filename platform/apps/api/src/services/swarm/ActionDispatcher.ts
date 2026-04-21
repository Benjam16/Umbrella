import { encodeFunctionData, type Address, type Hex, isAddress } from "viem";
import { z } from "zod";

import type { SwarmCall } from "./types.js";
import { buildDefaultPoolKey } from "../v4/poolKey.js";
import { buildUmbrellaV4ModifyLiquidityCalls } from "../v4/modifyLiquidityCalls.js";

/** Human-readable capability list injected into Gemma system prompts (keep in sync with encoder). */
export const UMBRELLA_TOOL_MANIFEST = `
Supported tools (JSON objects in the "steps" array):

Seeding / liquidity policy (read first):
- **Always prefer \`modify_liquidity\`** for initial depth, price floors/ceilings, and “walls” (concentrated liquidity). This is the primary Umbrella v4 seeding path.
- Do **not** substitute ad-hoc “donate” or one-off custom router calls for pool seeding when \`modify_liquidity\` can express the intent (use tick ranges + liquidityDelta).

- spawn: { "tool":"spawn", "count": <1-32> } — how many smart-account agents to use (fleet size).
- modify_liquidity: { "tool":"modify_liquidity", "token": "<address>", "quoteToken"?: "<address>", "hook"?: "<address>", "fee"?: 3000, "tickSpacing"?: 60, "tickLower": <int>, "tickUpper": <int>, "liquidityDelta": "<int256 string>", "salt": "0x<32 bytes>", "hookData"?: "0x", "router"?: "<UmbrellaV4Router address>", "agentIndex"?: <int> } — **preferred** seeding: approve both legs + UmbrellaV4Router.modifyLiquidity (set UMBRELLA_V4_LIQUIDITY_ROUTER or pass router).
- transfer: { "tool":"transfer", "to": "<address>", "valueWei": "<uint string>", "agentIndex"?: <0..N-1> } — native ETH from each chosen agent.
- erc20_transfer: { "tool":"erc20_transfer", "token": "<address>", "to": "<address>", "amount": "<uint string>", "agentIndex"?: <int> }.
- set_hook_burn: { "tool":"set_hook_burn", "hook": "<DeflationHook address>", "burnBps": <0-10000> } — tune v4 hook burn rate.
- custom: { "tool":"custom", "target": "<contract>", "callData": "0x...", "valueWei"?: "<uint string>", "agentIndex"?: <int> } — raw call (swap/router/etc. must be pre-encoded off-chain).

Sovereign Forge (on-chain deploy via API — order matters):
- write_solidity: { "tool":"write_solidity", "contractName": "MyToken", "source": "<full .sol source>" }
- compile_solidity: { "tool":"compile_solidity" } — runs forge build in a sandbox (after optional security review).
- deploy_contract: { "tool":"deploy_contract", "chainId": 84532, "constructorArgs": [] }

Uniswap v4 (Base): Every **tradable** ERC-20 mission should plan PoolManager.initialize for token/WETH (0.3% fee, tickSpacing 60, sqrtPrice 1:1) on the canonical PoolManager. If you deploy a custom Hook, pass its address in the pool key. The API can run this automatically after deploy (JSON field sovereignV4 on /v1/forge/pipeline) or via POST /v1/v4/mission.

Rules: Use "agentIndex" to split swarm work. For new contracts, emit write_solidity → compile_solidity → deploy_contract, then swarm steps that reference the deployed address (you will receive it back in context after deploy). Output ONLY valid JSON: { "steps": [ ... ] }.
`.trim();

const address = z.string().refine((x) => isAddress(x), "invalid address");

const toolSpawn = z.object({
  tool: z.literal("spawn"),
  count: z.number().int().min(1).max(32),
});

const toolTransfer = z.object({
  tool: z.literal("transfer"),
  to: address,
  valueWei: z.string().regex(/^\d+$/, "valueWei must be decimal uint string"),
  agentIndex: z.number().int().min(0).max(31).optional(),
});

const toolErc20Transfer = z.object({
  tool: z.literal("erc20_transfer"),
  token: address,
  to: address,
  amount: z.string().regex(/^\d+$/, "amount must be decimal uint string"),
  agentIndex: z.number().int().min(0).max(31).optional(),
});

const toolSetHookBurn = z.object({
  tool: z.literal("set_hook_burn"),
  hook: address,
  burnBps: z.number().int().min(0).max(10_000),
  agentIndex: z.number().int().min(0).max(31).optional(),
});

const toolCustom = z.object({
  tool: z.literal("custom"),
  target: address,
  callData: z.string().refine((x) => x.startsWith("0x") && x.length >= 10, "callData must be hex"),
  valueWei: z.string().regex(/^\d+$/).optional(),
  agentIndex: z.number().int().min(0).max(31).optional(),
});

const bytes32Hex = z.string().refine((x) => /^0x[0-9a-fA-F]{64}$/.test(x), "salt must be bytes32 hex");

const toolModifyLiquidity = z.object({
  tool: z.literal("modify_liquidity"),
  token: address,
  quoteToken: address.optional(),
  hook: address.optional(),
  fee: z.number().int().min(0).max(1_000_000).optional(),
  tickSpacing: z.number().int().optional(),
  tickLower: z.number().int(),
  tickUpper: z.number().int(),
  liquidityDelta: z.string().regex(/^-?\d+$/),
  salt: bytes32Hex,
  hookData: z
    .string()
    .refine((x) => x === "0x" || (x.startsWith("0x") && x.length % 2 === 0), "hookData hex")
    .optional(),
  router: address.optional(),
  agentIndex: z.number().int().min(0).max(31).optional(),
});

const toolWriteSolidity = z.object({
  tool: z.literal("write_solidity"),
  contractName: z.string().min(1).max(64),
  source: z.string().min(1).max(512_000),
});

const toolCompileSolidity = z.object({
  tool: z.literal("compile_solidity"),
});

const toolDeployContract = z.object({
  tool: z.literal("deploy_contract"),
  chainId: z.number().int(),
  constructorArgs: z.array(z.unknown()).optional(),
});

const toolCallSchema = z.discriminatedUnion("tool", [
  toolSpawn,
  toolTransfer,
  toolErc20Transfer,
  toolSetHookBurn,
  toolCustom,
  toolModifyLiquidity,
]);

export type ToolCall = z.infer<typeof toolCallSchema>;

const forgeToolSchema = z.discriminatedUnion("tool", [
  toolWriteSolidity,
  toolCompileSolidity,
  toolDeployContract,
]);

export type ForgeToolCall = z.infer<typeof forgeToolSchema>;

export const orchestratorStepSchema = z.union([toolCallSchema, forgeToolSchema]);

export type OrchestratorStep = z.infer<typeof orchestratorStepSchema>;

const planSchema = z.object({
  steps: z.array(toolCallSchema),
});

const orchestratorPlanSchema = z.object({
  steps: z.array(orchestratorStepSchema),
});

export type { SwarmCall };

const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const deflationHookAbi = [
  {
    type: "function",
    name: "setBurnBps",
    stateMutability: "nonpayable",
    inputs: [{ name: "newBps", type: "uint256" }],
    outputs: [],
  },
] as const;

/** Parse and validate an LLM JSON payload into tool steps. */
export function parseToolPlan(input: unknown): { ok: true; steps: ToolCall[] } | { ok: false; error: string } {
  if (input === null || typeof input !== "object") {
    return { ok: false, error: "plan must be an object" };
  }
  const raw = input as Record<string, unknown>;
  let stepsUnknown: unknown = raw.steps;
  if (!Array.isArray(stepsUnknown) && Array.isArray(raw)) {
    stepsUnknown = raw;
  }
  const candidate = Array.isArray(stepsUnknown) ? { steps: stepsUnknown } : raw;
  const parsed = planSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, steps: parsed.data.steps };
}

/** Swarm + Sovereign Forge steps (Gemma full plan). */
export function parseOrchestratorPlan(
  input: unknown,
): { ok: true; steps: OrchestratorStep[] } | { ok: false; error: string } {
  if (input === null || typeof input !== "object") {
    return { ok: false, error: "plan must be an object" };
  }
  const raw = input as Record<string, unknown>;
  let stepsUnknown: unknown = raw.steps;
  if (!Array.isArray(stepsUnknown) && Array.isArray(raw)) {
    stepsUnknown = raw;
  }
  const candidate = Array.isArray(stepsUnknown) ? { steps: stepsUnknown } : raw;
  const parsed = orchestratorPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, steps: parsed.data.steps };
}

const FORGE_TOOLS = new Set(["write_solidity", "compile_solidity", "deploy_contract"]);

export function isForgeStep(step: OrchestratorStep): step is ForgeToolCall {
  return FORGE_TOOLS.has((step as { tool: string }).tool);
}

/** Strips forge steps — use for `/v1/swarm/dispatch` (swarm-only). */
export function filterSwarmSteps(steps: OrchestratorStep[]): ToolCall[] {
  return steps.filter((s): s is ToolCall => !isForgeStep(s));
}

export type DispatchResult =
  | {
      ok: true;
      agentCount: number;
      /** One UserOp batch per agent (length === agentCount). */
      perAgentCalls: SwarmCall[][];
      /** First spawn step’s count, if any (for logging). */
      spawnHint: number | null;
    }
  | { ok: false; error: string };

function encodeSwarmCallsForStep(tc: ToolCall): SwarmCall[] {
  switch (tc.tool) {
    case "spawn":
      return [];
    case "transfer":
      return [
        {
          to: tc.to as Address,
          data: "0x",
          value: BigInt(tc.valueWei),
        },
      ];
    case "erc20_transfer":
      return [
        {
          to: tc.token as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [tc.to as Address, BigInt(tc.amount)],
          }),
          value: 0n,
        },
      ];
    case "set_hook_burn":
      return [
        {
          to: tc.hook as Address,
          data: encodeFunctionData({
            abi: deflationHookAbi,
            functionName: "setBurnBps",
            args: [BigInt(tc.burnBps)],
          }),
          value: 0n,
        },
      ];
    case "custom":
      return [
        {
          to: tc.target as Address,
          data: tc.callData as Hex,
          value: tc.valueWei ? BigInt(tc.valueWei) : 0n,
        },
      ];
    case "modify_liquidity": {
      const router = (tc.router?.trim() ||
        process.env.UMBRELLA_V4_LIQUIDITY_ROUTER?.trim()) as Address | undefined;
      if (!router) {
        throw new Error(
          "modify_liquidity requires tool.router or env UMBRELLA_V4_LIQUIDITY_ROUTER (deploy UmbrellaV4Router)",
        );
      }
      const poolKey = buildDefaultPoolKey({
        token: tc.token as Address,
        quoteToken: tc.quoteToken as Address | undefined,
        hook: tc.hook as Address | undefined,
        fee: tc.fee,
        tickSpacing: tc.tickSpacing,
      });
      return buildUmbrellaV4ModifyLiquidityCalls({
        poolKey,
        router,
        params: {
          tickLower: tc.tickLower,
          tickUpper: tc.tickUpper,
          liquidityDelta: BigInt(tc.liquidityDelta),
          salt: tc.salt as Hex,
          hookData: tc.hookData as Hex | undefined,
        },
      });
    }
    default: {
      const _exhaust: never = tc;
      return _exhaust;
    }
  }
}

/**
 * Turn a validated tool plan into per-agent call batches for `launchSwarm`.
 * - `spawn` steps set fleet size (max wins if multiple).
 * - Steps with `agentIndex` go only to that agent’s batch.
 * - Steps without `agentIndex` are appended to **every** agent’s batch (uniform repetition).
 */
export function dispatchToolPlanToSwarmCalls(steps: ToolCall[]): DispatchResult {
  if (steps.some(isForgeStep)) {
    return { ok: false, error: "Forge steps belong in POST /v1/forge/execute-plan, not swarm dispatch" };
  }
  const spawnSteps = steps.filter((s): s is z.infer<typeof toolSpawn> => s.tool === "spawn");
  const spawnHint = spawnSteps.length ? Math.max(...spawnSteps.map((s) => s.count)) : null;

  const indexed = steps.filter((s) => s.tool !== "spawn");
  const withIndex = indexed.filter((s) => "agentIndex" in s && s.agentIndex !== undefined);

  let agentCount = spawnHint ?? 1;
  if (withIndex.length) {
    const maxIdx = Math.max(...withIndex.map((s) => (s as { agentIndex: number }).agentIndex));
    agentCount = Math.max(agentCount, maxIdx + 1);
  }
  agentCount = Math.min(32, Math.max(1, agentCount));

  const perAgentCalls: SwarmCall[][] = Array.from({ length: agentCount }, () => []);

  for (const step of indexed) {
    let calls: SwarmCall[];
    try {
      calls = encodeSwarmCallsForStep(step);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
    if (!calls.length) continue;
    const idx =
      "agentIndex" in step && step.agentIndex !== undefined
        ? Math.min(agentCount - 1, Math.max(0, step.agentIndex))
        : null;
    for (const encoded of calls) {
      if (idx !== null) {
        perAgentCalls[idx]!.push(encoded);
      } else {
        for (let i = 0; i < agentCount; i++) {
          perAgentCalls[i]!.push(encoded);
        }
      }
    }
  }

  for (let i = 0; i < agentCount; i++) {
    if (!perAgentCalls[i]!.length) {
      return {
        ok: false,
        error: `Agent ${i} has no calls — add agentIndex on transfers or include uniform steps.`,
      };
    }
  }

  return { ok: true, agentCount, perAgentCalls, spawnHint };
}

export { executeSovereignMission } from "../v4/SovereignMission.js";
export type {
  SovereignMissionParams,
  SovereignMissionResult,
} from "../v4/SovereignMission.js";
