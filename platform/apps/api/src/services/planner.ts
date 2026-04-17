import {
  plannerOutputSchema,
  type PlannedTask,
  type ScrapeTarget,
  type TransactionProposal,
} from "@umbrella/shared";
import type { TaskRun } from "../store.js";
import { adapterForModel } from "./adapters.js";
import { InferenceHttpError } from "./inference.js";
import { retrieveContext } from "./memory.js";
import { loadModelRegistry } from "./models.js";
import { selectModel } from "./router.js";

function extractJson(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return raw;
}

function fallbackPlan(run: TaskRun): PlannedTask[] {
  const objective = run.objective.toLowerCase();
  const maybeScrape: ScrapeTarget | undefined =
    objective.includes("scrape") ||
    objective.includes("pricing") ||
    objective.includes("competitor") ||
    objective.includes("watch")
      ? {
          url: process.env.UMBRELLA_OBSERVER_DEFAULT_URL ?? "https://example.com",
          goal: "Extract competitor pricing and CRO-relevant copy signals.",
          fields: ["price", "plan", "cta", "conversion", "signup"],
          maxItems: 30,
        }
      : undefined;
  const maybeTx: TransactionProposal | undefined =
    objective.includes("wallet") ||
    objective.includes("swap") ||
    objective.includes("rebalance") ||
    objective.includes("send")
      ? {
          chainId: Number(process.env.UMBRELLA_BASE_CHAIN_ID ?? 8453),
          to: process.env.UMBRELLA_DEFAULT_TRANSACTION_TARGET ?? "0x0000000000000000000000000000000000000000",
          value: "0x0",
          data: "0x",
          description: "Review and sign proposed Base transaction from planner fallback.",
        }
      : undefined;

  const tasks: PlannedTask[] = [
    {
      id: "analyze-objective",
      title: "Analyze mission constraints",
      description: "Understand the mission intent, risk boundaries, and required outputs.",
      type: "ANALYSIS",
      worker: "SUPERVISOR",
      dependsOn: [],
    },
    {
      id: "execute-core",
      title: "Execute core implementation",
      description: "Perform the primary implementation actions for the mission.",
      type: "CODE_CHANGE",
      worker: "CODER_WORKER",
      dependsOn: ["analyze-objective"],
    },
  ];

  if (maybeTx) {
    tasks.push({
      id: "propose-transaction",
      title: "Propose Base transaction for approval",
      description: "Prepare transaction and pause for user signature in HITL gateway.",
      type: "TRANSACTION",
      worker: "CODER_WORKER",
      dependsOn: ["execute-core"],
      transaction: maybeTx,
    });
  }

  if (maybeScrape) {
    tasks.splice(1, 0, {
      id: "observe-market",
      title: "Observe target site and extract structured findings",
      description: "Use the observer skill to extract pricing/copy signals from live pages.",
      type: "SCRAPE",
      worker: "SCRAPER_WORKER",
      dependsOn: ["analyze-objective"],
      scrape: maybeScrape,
    });
  }

  tasks.push({
    id: "audit-output",
    title: "Audit code and logic",
    description: "Perform security and logic checks using reasoning-only auditing.",
    type: "VERIFY",
    worker: "AUDITOR_WORKER",
    dependsOn: ["execute-core"],
  });

  tasks.push({
    id: "verify-result",
    title: "Verify mission outcome",
    description: "Run checks and summarize mission status.",
    type: "VERIFY",
    worker: "SUPERVISOR",
    dependsOn: maybeTx ? ["propose-transaction", "audit-output"] : ["execute-core", "audit-output"],
  });

  return tasks.slice(0, run.maxSteps);
}

export async function planMission(run: TaskRun): Promise<{
  tasks: PlannedTask[];
  modelUsed: string;
  routeReason: string;
  supervisorSummary?: string;
  reasoningTrace?: string;
}> {
  const registry = loadModelRegistry();
  const route = selectModel(registry, { requestedModel: run.requestedModel });
  const adapter = adapterForModel(route.model);
  const memory = retrieveContext({
    userId: run.userId,
    query: run.objective,
    limit: 4,
  });
  const memoryContext =
    memory.length > 0
      ? memory
          .map((m, idx) => `#${idx + 1} [${m.source}] ${m.text.slice(0, 320)}`)
          .join("\n")
      : "none";

  try {
    const completion = await adapter.complete({
      model: route.model,
      messages: [
        {
          role: "system",
          content:
            "You are Umbrella Supervisor (Gemma). Return ONLY JSON with shape {\"reasoningTrace\":\"...\",\"supervisorSummary\":\"...\",\"tasks\":[...]}." +
            " Build a directed acyclic graph using fields: id, title, description, type, worker, dependsOn, optional scrape, optional transaction." +
            " Allowed type values: ANALYSIS, CODE_CHANGE, COMMAND, SCRAPE, TRANSACTION, VERIFY." +
            " Allowed worker values: SUPERVISOR, CODER_WORKER, SCRAPER_WORKER, AUDITOR_WORKER, CRO_WORKER." +
            " Prefer parallelizable DAG branches whenever safe (independent dependencies). " +
            " reasoningTrace must include: risks, missing tools, and chosen strategy." +
            " For SCRAPE include scrape {url,goal,fields,maxItems}. " +
            " For TRANSACTION include transaction {chainId,to,from?,data?,value?,gas?,description}.",
        },
        {
          role: "user",
          content:
            `Mission: ${run.objective}\n` +
            `Mission source: ${run.missionSource ?? "manual"}\n` +
            `Max tasks: ${run.maxSteps}\n` +
            `retrieve_context results:\n${memoryContext}\n` +
            "Prioritize Base-chain workflows and add SCRAPE tasks when observation/external data is needed. " +
            "Always include an AUDITOR_WORKER verification branch after CODE_CHANGE tasks. " +
            (run.missionSource === "blueprint"
              ? "Speed mode enabled: prioritize parallel DAG branches for independent tasks (especially multi-url scraping/file reads), allow speculative drafting while scraper workers run, and merge into batch validation."
              : "Use conservative parallelism and minimize unnecessary fan-out."),
        },
      ],
    });
    const candidate = extractJson(completion.content);
    const parsed = plannerOutputSchema.safeParse(JSON.parse(candidate));
    if (!parsed.success) {
      return {
        tasks: fallbackPlan(run),
        modelUsed: route.model.id,
        routeReason: "planner_fallback_parse",
        supervisorSummary: "Fallback supervisor DAG generated due to parse failure.",
        reasoningTrace:
          "Pre-flight fallback: planner output failed schema parse. Risks: under-specified mission and limited tool context. Strategy: use conservative default DAG with audit and verification.",
      };
    }
    return {
      tasks: parsed.data.tasks.slice(0, run.maxSteps),
      modelUsed: route.model.id,
      routeReason: route.reason,
      supervisorSummary: parsed.data.supervisorSummary,
      reasoningTrace: parsed.data.reasoningTrace,
    };
  } catch (e) {
    if (e instanceof InferenceHttpError) {
      return {
        tasks: fallbackPlan(run),
        modelUsed: route.model.id,
        routeReason: `planner_fallback_http_${e.status}`,
        supervisorSummary: "Fallback supervisor DAG generated due to inference HTTP failure.",
        reasoningTrace:
          "Pre-flight fallback: inference endpoint failed. Risks: stale context and unavailable model reasoning. Strategy: fallback DAG with explicit audit/verify phases.",
      };
    }
    return {
      tasks: fallbackPlan(run),
      modelUsed: route.model.id,
      routeReason: "planner_fallback_error",
      supervisorSummary: "Fallback supervisor DAG generated due to unexpected planner error.",
      reasoningTrace:
        "Pre-flight fallback: unexpected planner error. Risks: hidden runtime failure in supervisor planning path. Strategy: execute minimal safe DAG and escalate via HITL on uncertainty.",
    };
  }
}
