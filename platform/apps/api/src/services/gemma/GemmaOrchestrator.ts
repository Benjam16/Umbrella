/**
 * “Brain” layer: OpenAI-compatible chat to **your** Gemma (or any local LLM) on a VPS.
 *
 * Configure:
 *   GEMMA_VPS_URL          — base URL (or KIMI_BASE_URL / UMBRELLA_INFERENCE_URL)
 *   GEMMA_COMPLETION_PATH  — default /v1/chat/completions
 *   GEMMA_MODEL            — optional model id (or KIMI_MODEL)
 *   GEMMA_API_KEY          — optional bearer token (or KIMI_API_KEY)
 */

import {
  parseOrchestratorPlan,
  parseToolPlan,
  type OrchestratorStep,
  UMBRELLA_TOOL_MANIFEST,
} from "../swarm/ActionDispatcher.js";
import { V4_TICK_MATH_FOR_GEMMA } from "../v4/V4TickMath.js";

export type GemmaDecision = {
  action: string;
  notes?: string;
  raw?: string;
};

export type GemmaPlanResult = {
  steps: OrchestratorStep[];
  raw?: string;
};

const ORCHESTRATOR_SYSTEM = `You are a **V4 Market Architect** behind Umbrella’s Sovereign Forge on Base: you design contracts, Uniswap v4 hooks, and swarm execution plans.

When a user asks for a **token** or **tradable asset**, assume they want it **live and swappable immediately**. Every such mission must include a **Uniswap v4 pool initialization plan** (canonical PoolManager, token vs WETH or chosen quote, 0.3% fee tier / tickSpacing 60, sqrt price 1:1 unless they specify otherwise, and the hook address if you designed a custom hook). Pair that with forge steps (write_solidity → compile_solidity → deploy_contract) and swarm steps that use the deployed addresses returned in context.

Use **concentrated liquidity ranges** to express price floors, ceilings, and defense bands the user describes (e.g. “hold above $0.05”). **Always use the \`modify_liquidity\` tool for seeding** new pool depth—not ad-hoc donations or unrelated custom calls when liquidity placement is the goal.

Tick / price conversion (for planning \`tickLower\` / \`tickUpper\`):
${V4_TICK_MATH_FOR_GEMMA}

Your job is to break the user's request into **tool calls** our execution layer can run: tokenomics, LP, transfers, hook tuning, custom contract calls, and v4 pool birth.

${UMBRELLA_TOOL_MANIFEST}

Always respond with **only** a JSON object (no markdown fences): { "steps": [ ... ] }
You may include a "spawn" step first to set fleet size. Assign "agentIndex" (0-based) when different agents should do different things (e.g. split recipients).`;

function completionUrl(): string | null {
  const base = (
    process.env.GEMMA_VPS_URL ??
    process.env.KIMI_BASE_URL ??
    process.env.UMBRELLA_INFERENCE_URL ??
    "https://api.moonshot.cn/v1"
  ).replace(/\/$/, "");
  if (!base) return null;
  const path = process.env.GEMMA_COMPLETION_PATH ?? "/chat/completions";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function postChat(system: string, userContent: string): Promise<string | null> {
  const url = completionUrl();
  if (!url) return null;

  const body = {
    model: process.env.GEMMA_MODEL ?? process.env.KIMI_MODEL ?? "kimi-k2.5",
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    temperature: 0.15,
  };

  const apiKey = process.env.GEMMA_API_KEY?.trim() || process.env.KIMI_API_KEY?.trim() || "";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[gemma] HTTP ${res.status} from ${url}`);
    return null;
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Extract JSON object from model output (tolerates stray whitespace / fences). */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object in model output");
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

/**
 * Ask the brain for a **tool plan** from free-form user intent + optional chain context.
 */
export async function pollGemmaPlan(
  userIntent: string,
  context: Record<string, unknown> = {},
): Promise<GemmaPlanResult | null> {
  const text = await postChat(
    ORCHESTRATOR_SYSTEM,
    JSON.stringify({ userIntent, context }, null, 0),
  );
  if (text === null) return null;
  try {
    const obj = extractJsonObject(text);
    const parsed = parseOrchestratorPlan(obj);
    if (!parsed.ok) {
      const legacy = parseToolPlan(obj);
      if (legacy.ok) {
        return { steps: legacy.steps, raw: text };
      }
      return { steps: [], raw: `${text}\n[parse error: ${parsed.error}]` };
    }
    return { steps: parsed.steps, raw: text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { steps: [], raw: `${text}\n[parse error: ${msg}]` };
  }
}

/**
 * @deprecated Prefer {@link pollGemmaPlan} for multi-step tool output.
 * Single-shot market signal for legacy workers.
 */
export async function pollGemmaDecision(marketState: Record<string, unknown>): Promise<GemmaDecision | null> {
  const text = await postChat(
    "You are Umbrella's on-chain market orchestrator. Reply with a single JSON object: {\"action\":\"BUY|BURN|HOLD\",\"notes\":\"...\"} only.",
    JSON.stringify(marketState),
  );
  if (text === null) return null;

  try {
    const obj = extractJsonObject(text) as GemmaDecision;
    return { ...obj, raw: text };
  } catch {
    return { action: "HOLD", notes: "unparseable model output", raw: text };
  }
}

const SECURITY_REVIEW_SYSTEM = `You are a Solidity security triage reviewer for Umbrella's Sovereign Forge.
Scan for obvious issues: reentrancy (external call before state update), unprotected selfdestruct, tx.origin auth,
unchecked delegatecall to user input, unlimited mint to arbitrary address, missing access control on withdrawals,
integer overflow assumptions (pre-0.8.0 style), and obvious backdoors.

Reply with ONLY valid JSON (no markdown): {"pass":true|false,"notes":"one short paragraph"}`;

export type SoliditySecurityReview = {
  pass: boolean;
  notes: string;
  raw?: string;
};

/**
 * Second-pass Gemma call before `forge build` — not a substitute for a professional audit.
 */
export async function pollGemmaSoliditySecurityReview(
  source: string,
): Promise<SoliditySecurityReview | null> {
  const text = await postChat(
    SECURITY_REVIEW_SYSTEM,
    `Solidity source to review (truncated if huge):\n\n${source.slice(0, 120_000)}`,
  );
  if (text === null) return null;
  try {
    const obj = extractJsonObject(text) as { pass?: boolean; notes?: string };
    const pass = obj.pass === true;
    const notes = typeof obj.notes === "string" ? obj.notes : "no notes";
    return { pass, notes, raw: text };
  } catch {
    return { pass: false, notes: "unparseable security review output", raw: text };
  }
}

export { UMBRELLA_TOOL_MANIFEST };
export { V4_TICK_MATH_FOR_GEMMA } from "../v4/V4TickMath.js";
