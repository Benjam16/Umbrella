import { store } from "../store.js";
import { adapterForModel } from "./adapters.js";
import { loadModelRegistry } from "./models.js";
import { selectModel } from "./router.js";

function extractAssetHints(runId: string): string[] {
  const run = store.findRunById(runId);
  if (!run) return [];
  const out = new Set<string>();
  for (const step of run.steps) {
    const text = `${step.lastOutput || ""}\n${step.lastError || ""}`;
    const patchMatches = text.matchAll(/patched:([^\s,]+)/g);
    for (const m of patchMatches) {
      if (m[1]) out.add(m[1].slice(0, 140));
    }
    const researchMatch = text.match(/navigate_and_extract:\s*(\S+)/i);
    if (researchMatch?.[1]) out.add(`research:${researchMatch[1].slice(0, 140)}`);
    const txMatch = text.match(/transaction[:\s].*(0x[a-fA-F0-9]{10,})/i);
    if (txMatch?.[1]) out.add(`tx:${txMatch[1].slice(0, 42)}`);
  }
  return [...out].slice(0, 12);
}

function heuristicSummary(runId: string): string[] {
  const run = store.findRunById(runId);
  if (!run) return [];
  const completed = run.steps.filter((s) => s.status === "completed").length;
  const total = run.steps.length;
  const assets = extractAssetHints(runId);
  return [
    `Completed ${completed}/${total} mission steps for objective: "${run.objective.slice(0, 120)}".`,
    assets.length > 0
      ? `Created or touched key assets: ${assets.slice(0, 4).join(", ")}.`
      : "Executed workflow tasks with verification and governance checkpoints.",
    "Strategic takeaway: review Swarm outputs and prioritize the highest-leverage action in the next sprint.",
  ];
}

export async function generateOutcomeSummary(runId: string): Promise<string[]> {
  const run = store.findRunById(runId);
  if (!run) return [];

  const assets = extractAssetHints(runId);
  const recentLogs = run.logs.slice(-40).map((l) => `[${l.level}] ${l.message}`).join("\n");
  const stepDigest = run.steps
    .map((s) => `#${s.index + 1} [${s.status}] ${s.title}${s.lastOutput ? ` | ${s.lastOutput.slice(0, 180)}` : ""}`)
    .join("\n");

  try {
    const registry = loadModelRegistry();
    const route = selectModel(registry, { requestedModel: run.requestedModel });
    const adapter = adapterForModel(route.model);
    const completion = await adapter.complete({
      model: route.model,
      messages: [
        {
          role: "system",
          content:
            "You are Umbrella Outcome Synthesizer. Return ONLY JSON with shape {\"bullets\":[\"...\",\"...\",\"...\"]}. " +
            "Bullets must be concise, founder-oriented, and focused on outcomes, created assets, and strategic insights.",
        },
        {
          role: "user",
          content:
            `Objective: ${run.objective}\n` +
            `Mission source: ${run.missionSource ?? "manual"}\n` +
            `Known assets: ${assets.join(", ") || "none"}\n` +
            `Step digest:\n${stepDigest}\n\n` +
            `Recent logs:\n${recentLogs}`,
        },
      ],
    });
    const fenced = completion.content.match(/```json\s*([\s\S]*?)```/i)?.[1];
    const candidate = fenced ?? completion.content;
    const parsed = JSON.parse(candidate) as { bullets?: unknown };
    if (!Array.isArray(parsed.bullets)) return heuristicSummary(runId);
    const cleaned = parsed.bullets
      .map((b) => String(b).trim())
      .filter((b) => b.length > 0)
      .slice(0, 3);
    return cleaned.length > 0 ? cleaned : heuristicSummary(runId);
  } catch {
    return heuristicSummary(runId);
  }
}
