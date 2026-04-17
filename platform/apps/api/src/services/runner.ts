import { adapterForModel } from "./adapters.js";
import { creditsForTokens, estimatePromptTokens, InferenceHttpError } from "./inference.js";
import { loadModelRegistry } from "./models.js";
import { selectModel } from "./router.js";
import { runShellCommand, verifyConfig } from "./command-executor.js";
import { createRunCheckpoint } from "./checkpoint.js";
import { planMission } from "./planner.js";
import { observeAndExtract, performWebExtraction } from "./scraper.js";
import { annotateToolActionsWithRisk, highestRisk } from "./security.js";
import { generateOutcomeSummary } from "./synthesis.js";
import { ingestRunMemory, retrieveContext } from "./memory.js";
import {
  evaluatePolicyForActions,
  recordPolicyDecision,
  resolvePolicyProfile,
} from "./policy.js";
import { preflightWritePatchesInSandbox } from "./sandbox.js";
import { createProposalFromOnChainAction, createTransactionProposal } from "./wallet.js";
import { workerQueue } from "./worker-queue.js";
import {
  executeToolActions,
  parseToolActions,
  protectedWriteActions,
} from "./tool-executor.js";
import { store, type PendingToolAction, type RunStep, type TaskRun } from "../store.js";
import type { PlannedTask } from "@umbrella/shared";

const activeRuns = new Set<string>();
const RISKY_STEP_PATTERN = /\b(delete|drop|reset|force push|deploy|prod|production)\b/i;

function runDefaults() {
  return {
    maxSteps: Math.max(1, Number(process.env.UMBRELLA_RUN_MAX_STEPS ?? 10)),
    maxMinutes: Math.max(1, Number(process.env.UMBRELLA_RUN_MAX_MINUTES ?? 30)),
    maxAutoFixes: Math.max(0, Number(process.env.UMBRELLA_RUN_MAX_AUTOFIXES ?? 5)),
    maxCredits: Math.max(1, Number(process.env.UMBRELLA_RUN_MAX_CREDITS ?? 500)),
  };
}

function appendLog(runId: string, level: "info" | "warn" | "error", message: string): void {
  store.updateRun(runId, (run) => {
    run.logs.push({ at: new Date().toISOString(), level, message });
    run.logs = run.logs.slice(-500);
  });
}

async function callModel(
  run: TaskRun,
  userId: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{
  content: string;
  charged: number;
  modelUsed: string;
  routeReason: string;
}> {
  const registry = loadModelRegistry();
  const route = selectModel(registry, { requestedModel: run.requestedModel });
  const adapter = adapterForModel(route.model);

  const estimated = creditsForTokens(
    estimatePromptTokens(messages),
    route.model.costPer1k,
  );
  const userBefore = store.findUserById(userId);
  if (!userBefore) throw new Error("user_not_found");
  if (userBefore.credits < estimated) throw new Error("payment_required");
  if (run.creditsCharged + estimated > run.maxCredits) throw new Error("run_budget_exceeded");

  let completion;
  try {
    completion = await adapter.complete({ model: route.model, messages });
  } catch (e) {
    if (e instanceof InferenceHttpError) {
      throw new Error(`inference_failed:${e.status}:${e.body.slice(0, 300)}`);
    }
    throw e;
  }

  const actual = creditsForTokens(
    completion.usage.total_tokens,
    route.model.costPer1k,
  );
  const userLatest = store.findUserById(userId);
  if (!userLatest) throw new Error("user_not_found");
  const charge = Math.min(
    actual,
    userLatest.credits,
    Math.max(0, run.maxCredits - run.creditsCharged),
  );
  if (charge <= 0) throw new Error("run_budget_exceeded");
  store.adjustCredits(userId, -charge);
  store.updateRun(run.id, (r) => {
    r.creditsCharged += charge;
    r.modelUsed = route.model.id;
    r.routeReason = route.reason;
  });

  return {
    content: completion.content,
    charged: charge,
    modelUsed: route.model.id,
    routeReason: route.reason,
  };
}

function shouldPauseForApproval(step: RunStep): string | null {
  if (RISKY_STEP_PATTERN.test(step.title)) {
    return `Step appears risky: "${step.title}"`;
  }
  return null;
}

function taskForStep(run: TaskRun, step: RunStep): PlannedTask | undefined {
  return run.tasks?.[step.index];
}

function taskIdToStep(run: TaskRun): Map<string, RunStep> {
  const out = new Map<string, RunStep>();
  if (!run.tasks) return out;
  run.tasks.forEach((task, idx) => {
    const step = run.steps.find((s) => s.index === idx);
    if (step) out.set(task.id, step);
  });
  return out;
}

function readySteps(run: TaskRun): RunStep[] {
  if (!run.tasks || run.tasks.length === 0) {
    const next = run.steps.find((s) => s.status === "pending");
    return next ? [next] : [];
  }
  const byTaskId = taskIdToStep(run);
  return run.steps.filter((step) => {
    if (step.status !== "pending") return false;
    const task = run.tasks?.[step.index];
    if (!task) return false;
    return task.dependsOn.every((depId) => {
      const depStep = byTaskId.get(depId);
      return depStep?.status === "completed";
    });
  });
}

function scraperParallelLimit(): number {
  return Math.max(1, Number(process.env.UMBRELLA_SCRAPER_PARALLELISM ?? 2));
}

function summarizeToolResults(
  results: Awaited<ReturnType<typeof executeToolActions>>,
): { ok: boolean; text: string } {
  if (results.length === 0) {
    return { ok: false, text: "No tool actions were provided by worker." };
  }
  const lines = results.map((r, idx) => {
    const outcome = r.ok ? "OK" : "FAIL";
    const output = r.output ? ` | output: ${r.output.slice(0, 200)}` : "";
    return `${idx + 1}. [${outcome}] ${r.action.type}: ${r.message}${output}`;
  });
  return { ok: results.every((r) => r.ok), text: lines.join("\n") };
}

async function verifyWithCommands(runId: string): Promise<{
  passed: boolean;
  summary: string;
}> {
  const cfg = verifyConfig();
  if (cfg.commands.length === 0) {
    return {
      passed: true,
      summary: "No verify commands configured; using model verifier fallback.",
    };
  }

  for (const command of cfg.commands) {
    const res = await runShellCommand(command, {
      cwd: cfg.cwd,
      timeoutMs: cfg.timeoutMs,
      maxOutputBytes: cfg.maxOutputBytes,
    });
    if (res.blocked) {
      return {
        passed: false,
        summary: `Blocked verify command "${command}": ${res.reason ?? "not_allowed"}`,
      };
    }
    if (res.timedOut) {
      return {
        passed: false,
        summary: `Verify command timed out: "${command}"`,
      };
    }
    if (res.exitCode !== 0) {
      const tail = (res.stderr || res.stdout).slice(-600).trim();
      return {
        passed: false,
        summary: `Verify failed (${command}): ${tail || `exit ${String(res.exitCode)}`}`,
      };
    }
    appendLog(runId, "info", `Verify command passed: ${command}`);
  }

  return {
    passed: true,
    summary: "All configured verify commands passed.",
  };
}

export function createRunInputDefaults() {
  return runDefaults();
}

export function startRunProcessing(runId: string): void {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);
  void processRunLoop(runId).finally(() => activeRuns.delete(runId));
}

async function processRunLoop(runId: string): Promise<void> {
  let run = store.findRunById(runId);
  if (!run) return;
  if (run.status === "cancelled" || run.status === "completed" || run.status === "failed") return;

  const deadline = Date.parse(run.startedAt) + run.maxMinutes * 60_000;

  if (run.status === "queued") {
    const checkpoint = await createRunCheckpoint(run.id);
    store.updateRun(runId, (r) => {
      r.checkpointStatus = checkpoint.status;
      r.checkpointBranch = checkpoint.checkpointBranch;
      r.checkpointBaseBranch = checkpoint.baseBranch;
      r.checkpointCreatedAt = new Date().toISOString();
      r.checkpointError = checkpoint.error;
    });
    appendLog(
      runId,
      checkpoint.status === "failed" ? "warn" : "info",
      checkpoint.status === "created"
        ? `Checkpoint created: ${checkpoint.checkpointBranch}`
        : checkpoint.status === "skipped"
          ? `Checkpoint skipped: ${checkpoint.error ?? "not_configured"}`
          : `Checkpoint failed: ${checkpoint.error ?? "unknown_error"}`,
    );

    store.updateRun(runId, (r) => {
      r.status = "planning";
      r.pendingDecision = undefined;
    });
    appendLog(runId, "info", "Planning started.");

    try {
      const planned = await planMission(run);
      const steps = planned.tasks.map((task, index) => ({
        index,
        title: `[${task.type}] ${task.title}`.slice(0, 160),
        status: "pending" as const,
        attempts: 0,
      }));
      store.updateRun(runId, (r) => {
        r.tasks = planned.tasks;
        r.steps = steps;
        r.status = "executing";
        r.modelUsed = planned.modelUsed;
        r.routeReason = planned.routeReason;
        r.reasoningTrace = planned.reasoningTrace;
      });
      appendLog(runId, "info", `Plan created with ${steps.length} steps.`);
      if (planned.supervisorSummary) {
        appendLog(runId, "info", `Supervisor: ${planned.supervisorSummary.slice(0, 240)}`);
        ingestRunMemory({
          userId: run.userId,
          runId,
          source: "summary",
          text: planned.supervisorSummary,
          tags: ["planner", "supervisor_summary"],
        });
      }
    } catch (e) {
      store.updateRun(runId, (r) => {
        r.status = "failed";
        r.completedAt = new Date().toISOString();
      });
      appendLog(runId, "error", `Planning failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }

  while (true) {
    run = store.findRunById(runId);
    if (!run) return;
    if (Date.now() > deadline) {
      store.updateRun(runId, (r) => {
        r.status = "blocked";
        r.pendingDecision = {
          type: "retry_or_cancel",
          stepIndex: Math.max(0, r.steps.findIndex((s) => s.status !== "completed")),
          reason: "Run timed out. Approve retry or cancel.",
        };
      });
      appendLog(runId, "warn", "Run timed out and is waiting for approval.");
      return;
    }
    if (
      run.status === "cancelled" ||
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "blocked" ||
      run.status === "blocked_for_human"
    ) {
      return;
    }

    const currentRun = run;
    const unfinished = currentRun.steps.filter((s) => s.status !== "completed");
    if (unfinished.length === 0) {
      store.updateRun(runId, (r) => {
        r.status = "completed";
        r.completedAt = new Date().toISOString();
      });
      const summary = await generateOutcomeSummary(runId);
      if (summary.length > 0) {
        store.updateRun(runId, (r) => {
          r.outcomeSummary = summary;
        });
      }
      appendLog(runId, "info", "Run completed.");
      return;
    }

    const ready = readySteps(currentRun);
    if (ready.length === 0) {
      store.updateRun(runId, (r) => {
        r.status = "blocked_for_human";
        r.pendingDecision = {
          type: "provide_hint",
          stepIndex: unfinished[0]?.index ?? 0,
          reason: "No ready DAG step found. Provide a hint or retry from this checkpoint.",
          suggestedHint: "Check dependency graph correctness or mark an upstream step for retry.",
        };
      });
      appendLog(runId, "warn", "Run paused: DAG has no ready pending steps.");
      return;
    }

    const autoFixLimit = run.maxAutoFixes;
    const queueEligible = ready.filter((step) => {
      const t = taskForStep(currentRun, step);
      if (!t) return false;
      if (t.type === "SCRAPE") return true;
      return t.worker === "AUDITOR_WORKER" && t.type === "VERIFY";
    });

    const overLimit = queueEligible.find((s) => s.attempts > autoFixLimit);
    if (overLimit) {
      store.updateRun(runId, (r) => {
        r.status = "blocked_for_human";
        r.pendingDecision = {
          type: "provide_hint",
          stepIndex: overLimit.index,
          reason: `Self-healing attempts exceeded (${autoFixLimit}) for "${overLimit.title}".`,
          suggestedHint: "Provide a concrete constraint or expected behavior for this failing step.",
        };
      });
      appendLog(
        runId,
        "warn",
        `Self-healing paused after ${autoFixLimit} attempts on step ${overLimit.index + 1}.`,
      );
      return;
    }

    if (queueEligible.length > 0) {
      const parallelBatch = queueEligible.slice(
        0,
        Math.max(scraperParallelLimit(), Number(process.env.UMBRELLA_AUDITOR_PARALLELISM ?? 1)),
      );
      if (parallelBatch.length > 1) {
        appendLog(runId, "info", `Parallel batch: executing ${parallelBatch.length} worker tasks.`);
      }
      store.updateRun(runId, (r) => {
        for (const step of parallelBatch) {
          const target = r.steps.find((s) => s.index === step.index);
          if (!target) continue;
          target.status = "in_progress";
          target.attempts += 1;
        }
        r.status = "executing";
      });

      const batchResults = await Promise.allSettled(
        parallelBatch.map(async (step) => {
          const latest = store.findRunById(runId);
          const stepTask = latest ? taskForStep(latest, step) : undefined;
          if (!stepTask) {
            throw new Error("missing_task_payload");
          }
          if (stepTask.type === "SCRAPE") {
            if (!stepTask.scrape) throw new Error("missing_scrape_payload");
            const scrapeTarget = stepTask.scrape;
            const result = await workerQueue.enqueue("SCRAPER_WORKER", async () =>
              observeAndExtract(scrapeTarget),
            );
            return { step, task: stepTask, kind: "scrape" as const, result };
          }
          const latestRun = store.findRunById(runId);
          if (!latestRun) throw new Error("run_not_found");
          const audit = await workerQueue.enqueue("AUDITOR_WORKER", async () =>
            callModel(latestRun, latestRun.userId, [
              {
                role: "system",
                content:
                  "You are an Auditor worker. Perform security + logic review only. " +
                  "Respond with one line starting with PASS: or FAIL: and a short reason.",
              },
              {
                role: "user",
                content:
                  `Objective: ${latestRun.objective}\n` +
                  `Audit task: ${step.title}\n` +
                  `Recent logs:\n${latestRun.logs
                    .slice(-12)
                    .map((l) => `[${l.level}] ${l.message}`)
                    .join("\n")}`,
              },
            ]),
          );
          return { step, task: stepTask, kind: "audit" as const, result: audit };
        }),
      );

      for (const [idx, entry] of batchResults.entries()) {
        if (entry.status === "fulfilled") {
          const { step, task, kind, result } = entry.value;
          store.updateRun(runId, (r) => {
            const target = r.steps.find((s) => s.index === step.index);
            if (!target) return;
            target.status = "completed";
            target.lastError = undefined;
            if (kind === "scrape") {
              target.lastOutput = JSON.stringify(
                {
                  summary: result.summary,
                  title: result.title,
                  itemCount: result.items.length,
                  sample: result.items.slice(0, 3),
                },
                null,
                2,
              ).slice(0, 2_000);
            } else {
              target.lastOutput = `${result.content}`.slice(0, 2_000);
              if (!/^PASS:/i.test(String(result.content).trim())) {
                target.status = "pending";
                target.lastError = String(result.content).slice(0, 400);
              }
            }
            r.status = "executing";
          });
          if (kind === "scrape") {
            appendLog(
              runId,
              "info",
              `SCRAPE task completed with ${result.items.length} extracted items (step ${step.index + 1}).`,
            );
          } else {
            appendLog(
              runId,
              /^PASS:/i.test(String(result.content).trim()) ? "info" : "warn",
              `AUDIT task result on step ${step.index + 1}: ${String(result.content).slice(0, 180)}`,
            );
          }
        } else {
          const message =
            entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
          const step = parallelBatch[idx];
          if (step) {
            store.updateRun(runId, (r) => {
              const target = r.steps.find((s) => s.index === step.index);
              if (target) {
                target.status = "pending";
                target.lastError = `scrape_error:${message.slice(0, 300)}`;
              }
              r.status = "executing";
            });
            appendLog(
              runId,
              "warn",
              `SCRAPE task failed on step ${step.index + 1}: ${message}`,
            );
          }
        }
      }
      continue;
    }

    const step = ready[0];
    if (step.attempts > autoFixLimit) {
      store.updateRun(runId, (r) => {
        r.status = "blocked_for_human";
        r.pendingDecision = {
          type: "provide_hint",
          stepIndex: step.index,
          reason: `Self-healing attempts exceeded (${autoFixLimit}) for "${step.title}".`,
          suggestedHint: "Provide a concrete constraint or expected behavior for this failing step.",
        };
      });
      appendLog(
        runId,
        "warn",
        `Self-healing paused after ${autoFixLimit} attempts on step ${step.index + 1}.`,
      );
      return;
    }

    const approvalReason = shouldPauseForApproval(step);
    if (approvalReason) {
      store.updateRun(runId, (r) => {
        r.status = "blocked";
        r.pendingDecision = {
          type: "approve_risky_step",
          stepIndex: step.index,
          reason: approvalReason,
        };
      });
      appendLog(runId, "warn", `Paused for approval on step ${step.index}.`);
      return;
    }

    const latestRunBeforeAction = store.findRunById(runId);
    if (!latestRunBeforeAction) return;
    const stepTask = taskForStep(latestRunBeforeAction, step);

    if (stepTask?.type === "TRANSACTION") {
      const tx = await createTransactionProposal({
        title: stepTask.title,
        proposal: stepTask.transaction,
        fallbackData: "0x",
        fallbackValue: "0x0",
      });
      store.updateRun(runId, (r) => {
        r.status = "blocked_for_signature";
        r.pendingDecision = {
          type: "approve_transaction",
          stepIndex: step.index,
          reason: `Transaction approval required for "${stepTask.title}"`,
          transaction: tx,
        };
      });
      appendLog(runId, "warn", `Paused for wallet signature on step ${step.index + 1}.`);
      return;
    }

    store.updateRun(runId, (r) => {
      const target = r.steps.find((s) => s.index === step.index);
      if (target) {
        target.status = "in_progress";
        target.attempts += 1;
      }
      r.status = "executing";
    });
    appendLog(runId, "info", `Executing step ${step.index + 1}: ${step.title}`);
    appendLog(runId, "info", `Self-healing attempt #${step.attempts} on step ${step.index + 1}.`);

    let workerOutput = "";
    let executionSummary = "";
    try {
      const latestRun = store.findRunById(runId);
      if (!latestRun) return;

      let actions: PendingToolAction[] = (latestRun.pendingToolActions ?? []).slice(0, 5);
      if (actions.length === 0) {
        const priorContext = retrieveContext({
          userId: latestRun.userId,
          query: `${latestRun.objective} ${step.title}`,
          limit: 3,
        });
        const priorContextText =
          priorContext.length > 0
            ? priorContext.map((m, idx) => `#${idx + 1} [${m.source}] ${m.text.slice(0, 260)}`).join("\n")
            : "none";
        const exec = await callModel(latestRun, latestRun.userId, [
          {
            role: "system",
            content:
              "You are a worker agent. Return ONLY JSON as {\"actions\":[...]} using actions of type run_command, write_file_patch, navigate_and_extract, retrieve_context, or propose_on_chain_tx. " +
              "run_command fields: {\"type\":\"run_command\",\"command\":\"npm run -s build\"}. " +
              "write_file_patch fields: {\"type\":\"write_file_patch\",\"path\":\"relative/path\",\"find\":\"exact text\",\"replace\":\"new text\"}. " +
              "navigate_and_extract fields: {\"type\":\"navigate_and_extract\",\"url\":\"https://example.com\",\"schema\":{\"price\":\"string\",\"plan\":\"string\"}}. " +
              "retrieve_context fields: {\"type\":\"retrieve_context\",\"query\":\"prior decision about auth middleware\",\"limit\":3}. " +
              "propose_on_chain_tx fields: {\"type\":\"propose_on_chain_tx\",\"network\":\"base\",\"to\":\"0x...\",\"data\":\"0x...\",\"value\":\"0\",\"description\":\"Swap rebalance\"}. " +
              "Do not include markdown unless you wrap one JSON block.",
          },
          {
            role: "user",
            content:
              `Objective: ${latestRun.objective}\nCurrent step: ${step.title}\n` +
              `retrieve_context:\n${priorContextText}`,
          },
        ]);
        workerOutput = exec.content.trim();
        actions = annotateToolActionsWithRisk(parseToolActions(workerOutput));

        const policy = resolvePolicyProfile(latestRun.userId);
        const policyEval = evaluatePolicyForActions(policy, actions);
        recordPolicyDecision({
          userId: latestRun.userId,
          runId,
          stepIndex: step.index,
          actions,
          evaluation: policyEval,
        });
        actions = policyEval.filteredActions;

        const risk = highestRisk(actions);
        if (policyEval.outcome === "blocked_for_signature") {
          store.updateRun(runId, (r) => {
            r.status = "blocked_for_signature";
            r.pendingDecision = {
              type: "approve_risky_step",
              stepIndex: step.index,
              reason: `${policyEval.reason}${risk ? ` Highest risk reason: ${risk.reason}` : ""}`,
            };
            r.pendingToolActions = actions;
          });
          appendLog(
            runId,
            "warn",
            `Policy blocked action batch: ${policyEval.reason}`,
          );
          return;
        }
        if (policyEval.outcome === "blocked") {
          store.updateRun(runId, (r) => {
            r.status = "blocked";
            r.pendingDecision = {
              type: "approve_risky_step",
              stepIndex: step.index,
              reason: policyEval.reason,
            };
            r.pendingToolActions = actions;
          });
          appendLog(runId, "warn", `Policy denied action batch: ${policyEval.reason}`);
          return;
        }

        const txAction = actions.find(
          (a): a is Extract<PendingToolAction, { type: "propose_on_chain_tx" }> =>
            a.type === "propose_on_chain_tx",
        );
        if (txAction) {
          const tx = await createProposalFromOnChainAction(txAction);
          store.updateRun(runId, (r) => {
            r.status = "blocked_for_signature";
            r.pendingDecision = {
              type: "approve_transaction",
              stepIndex: step.index,
              reason: txAction.description || "On-chain transaction proposal requires signature.",
              transaction: tx,
            };
            r.pendingToolActions = actions;
          });
          appendLog(runId, "warn", `Paused for wallet signature on proposed on-chain tx (${txAction.network}).`);
          return;
        }

        const protectedWrites = protectedWriteActions(actions);
        if (policy.requireApprovalForProtectedWrites && protectedWrites.length > 0) {
          const files = protectedWrites
            .filter((a): a is { type: "write_file_patch"; path: string; find: string; replace: string } => a.type === "write_file_patch")
            .map((a) => a.path)
            .slice(0, 5);
          store.updateRun(runId, (r) => {
            r.status = "blocked";
            r.pendingDecision = {
              type: "approve_risky_step",
              stepIndex: step.index,
              reason: `Approval required for protected writes: ${files.join(", ")}`,
            };
            r.pendingToolActions = actions;
          });
          appendLog(runId, "warn", `Paused for approval on protected write actions: ${files.join(", ")}`);
          return;
        }
      }

      const observerActions = actions.filter(
        (a): a is { type: "navigate_and_extract"; url: string; schema: Record<string, string> } =>
          a.type === "navigate_and_extract",
      );
      const memoryActions = actions.filter(
        (a): a is { type: "retrieve_context"; query: string; limit?: number } =>
          a.type === "retrieve_context",
      );
      const executorActions = actions
        .filter(
          (
            a,
          ): a is Exclude<
            PendingToolAction,
            { type: "navigate_and_extract" | "propose_on_chain_tx" | "retrieve_context" }
          > =>
            a.type !== "navigate_and_extract" &&
            a.type !== "propose_on_chain_tx" &&
            a.type !== "retrieve_context",
        )
        .map((action) => {
          if (action.type === "run_command") {
            return { type: "run_command" as const, command: action.command };
          }
          return {
            type: "write_file_patch" as const,
            path: action.path,
            find: action.find,
            replace: action.replace,
          };
        });

      const observerSummaries: string[] = [];
      for (const action of observerActions) {
        const schemaHint = Object.keys(action.schema || {}).filter(Boolean).join(", ");
        const goal = schemaHint
          ? `${step.title || "Extract page insights"} | requested fields: ${schemaHint}`
          : step.title || "Extract page insights";
        const scrape = await performWebExtraction(action.url, goal);
        observerSummaries.push(
          `navigate_and_extract: ${scrape.url}\n` +
            `title: ${scrape.title}\n` +
            `summary: ${scrape.summary}\n` +
            `web_research_json: ${JSON.stringify(
              {
                url: scrape.url,
                goal: scrape.goal,
                extractedAt: scrape.extractedAt,
                structured: scrape.structured,
              },
              null,
              2,
            )}\n` +
            `preview: ${scrape.contextPreview.slice(0, 400)}`,
        );
      }
      const memorySummaries: string[] = [];
      for (const action of memoryActions) {
        const records = retrieveContext({
          userId: latestRun.userId,
          query: action.query,
          limit: action.limit ?? 3,
        });
        memorySummaries.push(
          `retrieve_context: ${action.query}\n` +
            (records.length > 0
              ? records
                  .map((r, idx) => `- #${idx + 1} [${r.source}] ${r.text.slice(0, 220)}`)
                  .join("\n")
              : "- no relevant memory found"),
        );
      }

      let executionParts: string[] = [];
      if (executorActions.length > 0) {
        const sandboxEnabled = process.env.UMBRELLA_SANDBOX_ENABLED !== "false";
        const strictProtectedSandbox =
          process.env.UMBRELLA_SANDBOX_STRICT_PROTECTED !== "false";
        const writeActions = executorActions.filter(
          (a): a is { type: "write_file_patch"; path: string; find: string; replace: string } =>
            a.type === "write_file_patch",
        );
        const protectedWrites = protectedWriteActions(executorActions);
        if (sandboxEnabled && writeActions.length > 0) {
          const verifyCommands = verifyConfig().commands;
          if (
            strictProtectedSandbox &&
            protectedWrites.length > 0 &&
            verifyCommands.length === 0
          ) {
            store.updateRun(runId, (r) => {
              const target = r.steps.find((s) => s.index === step.index);
              if (target) {
                target.status = "pending";
                target.lastError =
                  "sandbox_strict_requires_verify_commands_for_protected_writes";
              }
              r.status = "blocked_for_human";
              r.pendingDecision = {
                type: "provide_hint",
                stepIndex: step.index,
                reason:
                  "Strict sandbox policy requires UMBRELLA_RUN_VERIFY_COMMANDS for protected writes.",
                suggestedHint:
                  "Set UMBRELLA_RUN_VERIFY_COMMANDS (e.g. npm run -s test,npm run -s build) before continuing.",
              };
            });
            appendLog(
              runId,
              "warn",
              "Sandbox strict policy blocked protected write: no verify commands configured.",
            );
            return;
          }
          appendLog(
            runId,
            "info",
            `Sandbox preflight started for ${writeActions.length} write action(s) on step ${step.index + 1}.`,
          );
          const sandbox = await preflightWritePatchesInSandbox(writeActions);
          if (!sandbox.ok) {
            store.updateRun(runId, (r) => {
              const target = r.steps.find((s) => s.index === step.index);
              if (target) {
                target.status = "pending";
                target.lastError = `sandbox_failed:${sandbox.message}`;
                target.lastOutput = sandbox.output?.slice(0, 2_000);
              }
              r.status = "blocked_for_human";
              r.pendingDecision = {
                type: "provide_hint",
                stepIndex: step.index,
                reason: `Sandbox preflight failed before applying workspace patch: ${sandbox.message}`,
                suggestedHint:
                  "Adjust patch intent or failing tests, then continue. Workspace files were not modified.",
              };
            });
            appendLog(
              runId,
              "warn",
              `Sandbox preflight blocked workspace write: ${sandbox.message}`,
            );
            if (sandbox.output) {
              appendLog(runId, "warn", `Sandbox transcript: ${sandbox.output.slice(0, 600)}`);
            }
            return;
          }
          appendLog(
            runId,
            "info",
            `Sandbox preflight passed: ${sandbox.message}. Promoting patch to workspace.`,
          );
          if (sandbox.output) {
            appendLog(runId, "info", `Sandbox transcript: ${sandbox.output.slice(0, 600)}`);
          }
        }
        const toolResults = await executeToolActions(executorActions);
        const summary = summarizeToolResults(toolResults);
        executionParts.push(summary.text);
        appendLog(
          runId,
          summary.ok ? "info" : "warn",
          `Tool execution ${summary.ok ? "succeeded" : "had failures"} for step ${step.index + 1}.`,
        );
      }
      if (observerSummaries.length > 0) {
        executionParts = executionParts.concat(observerSummaries);
        appendLog(
          runId,
          "info",
          `Observer extracted ${observerSummaries.length} web target(s) for step ${step.index + 1}.`,
        );
      }
      if (memorySummaries.length > 0) {
        executionParts = executionParts.concat(memorySummaries);
        appendLog(
          runId,
          "info",
          `Memory vault returned context for ${memorySummaries.length} retrieval action(s).`,
        );
      }
      executionSummary = executionParts.join("\n\n").trim();
      ingestRunMemory({
        userId: latestRun.userId,
        runId,
        source: executionSummary.includes("web_research_json:") ? "research" : "run_step",
        text: executionSummary || workerOutput,
        tags: [step.title, stepTask?.type ?? "step"],
      });
      store.updateRun(runId, (r) => {
        r.pendingToolActions = undefined;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.updateRun(runId, (r) => {
        const target = r.steps.find((s) => s.index === step.index);
        if (target) {
          target.status = "pending";
          target.lastError = message;
        }
        r.pendingToolActions = undefined;
      });
      appendLog(runId, "error", `Execution failed on step ${step.index}: ${message}`);
      continue;
    }

    store.updateRun(runId, (r) => {
      const target = r.steps.find((s) => s.index === step.index);
      if (target) target.lastOutput = executionSummary.slice(0, 2_000) || workerOutput.slice(0, 2_000);
      r.status = "verifying";
    });

    try {
      const commandVerification = await verifyWithCommands(runId);
      let isPass = commandVerification.passed;
      let result = commandVerification.summary;

      if (verifyConfig().commands.length === 0) {
        const latestRun = store.findRunById(runId);
        if (!latestRun) return;
        const verify = await callModel(latestRun, latestRun.userId, [
          {
            role: "system",
            content:
              "You are a verifier. Respond with exactly one line starting with PASS: or FAIL: and a short reason.",
          },
          {
            role: "user",
            content: `Objective: ${latestRun.objective}\nStep: ${step.title}\nTool execution summary:\n${executionSummary || workerOutput}`,
          },
        ]);
        result = verify.content.trim();
        isPass = /^PASS:/i.test(result);
      }

      store.updateRun(runId, (r) => {
        const target = r.steps.find((s) => s.index === step.index);
        if (!target) return;
        if (isPass) {
          target.status = "completed";
          target.lastError = undefined;
          r.status = "executing";
        } else {
          target.status = "pending";
          target.lastError = result.slice(0, 400);
          r.status = "executing";
        }
      });
      appendLog(
        runId,
        isPass ? "info" : "warn",
        `Verification ${isPass ? "passed" : "failed"} for step ${step.index + 1}: ${result.slice(0, 200)}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.updateRun(runId, (r) => {
        const target = r.steps.find((s) => s.index === step.index);
        if (target) target.lastError = `verify_error:${message}`;
        r.status = "executing";
      });
      appendLog(runId, "error", `Verification error on step ${step.index + 1}: ${message}`);
    }
  }
}
