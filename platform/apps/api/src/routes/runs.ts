import { Hono } from "hono";
import { z } from "zod";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createRunInputDefaults, startRunProcessing } from "../services/runner.js";
import { executeRollback, previewRollback } from "../services/checkpoint.js";
import { requireUser } from "../services/auth.js";
import { resolvePolicyProfile } from "../services/policy.js";
import { store } from "../store.js";

const createRunSchema = z.object({
  objective: z.string().min(8).max(20_000),
  missionSource: z.enum(["manual", "blueprint"]).optional(),
  requestedModel: z.string().min(1).max(64).optional(),
  maxCredits: z.number().int().positive().max(100_000).optional(),
  maxSteps: z.number().int().min(1).max(50).optional(),
  maxMinutes: z.number().int().min(1).max(240).optional(),
  maxAutoFixes: z.number().int().min(0).max(10).optional(),
});

const approveSchema = z.object({
  action: z.enum(["continue", "cancel", "retry"]),
  txHash: z.string().min(3).max(120).optional(),
  hint: z.string().min(1).max(2_000).optional(),
});

const exportResearchSchema = z.object({
  stepIndex: z.number().int().min(0),
  filename: z.string().min(1).max(120).optional(),
});

const rollbackExecuteSchema = z.object({
  confirm: z.literal("EXECUTE_ROLLBACK"),
  previewToken: z.string().min(8).max(200),
});
const ROLLBACK_PREVIEW_TTL_MS = 10 * 60 * 1000;

export const runsRoutes = new Hono();

function researchDir(): string {
  const root = process.env.UMBRELLA_RUN_PROJECT_ROOT || process.cwd();
  return join(root, "research", "competitors");
}

function extractResearchPayload(lastOutput?: string): string | null {
  if (!lastOutput) return null;
  const marker = "web_research_json:";
  const idx = lastOutput.indexOf(marker);
  if (idx < 0) return null;
  const raw = lastOutput.slice(idx + marker.length).trim();
  const previewIdx = raw.indexOf("\npreview:");
  const payload = (previewIdx >= 0 ? raw.slice(0, previewIdx) : raw).trim();
  if (!payload) return null;
  return payload;
}

runsRoutes.get("/", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const runs = store.listRunsByUser(user.id);
  return c.json({
    runs: runs.map((r) => ({
      id: r.id,
      objective: r.objective,
      missionSource: r.missionSource,
      status: r.status,
      requestedModel: r.requestedModel,
      modelUsed: r.modelUsed,
      routeReason: r.routeReason,
      policyProfileName: r.policyProfileName,
      policyProfileVersion: r.policyProfileVersion,
      reasoningTrace: r.reasoningTrace,
      outcomeSummary: r.outcomeSummary,
      creditsCharged: r.creditsCharged,
      startedAt: r.startedAt,
      updatedAt: r.updatedAt,
      completedAt: r.completedAt,
      checkpointStatus: r.checkpointStatus,
      checkpointBranch: r.checkpointBranch,
      checkpointBaseBranch: r.checkpointBaseBranch,
      checkpointCreatedAt: r.checkpointCreatedAt,
      checkpointError: r.checkpointError,
      pendingDecision: r.pendingDecision,
      pendingActionCount: r.pendingToolActions?.length ?? 0,
    })),
  });
});

runsRoutes.post("/", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const defaults = createRunInputDefaults();
  const policy = resolvePolicyProfile(user.id);
  const run = store.createRun({
    userId: user.id,
    objective: parsed.data.objective,
    missionSource: parsed.data.missionSource ?? "manual",
    status: "queued",
    requestedModel: parsed.data.requestedModel,
    policyProfileName: policy.name,
    policyProfileVersion: policy.version,
    maxCredits: parsed.data.maxCredits ?? defaults.maxCredits,
    maxSteps: parsed.data.maxSteps ?? defaults.maxSteps,
    maxMinutes: parsed.data.maxMinutes ?? defaults.maxMinutes,
    maxAutoFixes: parsed.data.maxAutoFixes ?? defaults.maxAutoFixes,
  });
  startRunProcessing(run.id);
  return c.json({ run }, 201);
});

runsRoutes.get("/:id", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const run = store.findRunById(c.req.param("id"));
  if (!run || run.userId !== user.id) return c.json({ error: "not_found" }, 404);
  return c.json({ run });
});

runsRoutes.post("/:id/approve", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const runId = c.req.param("id");
  const run = store.findRunById(runId);
  if (!run || run.userId !== user.id) return c.json({ error: "not_found" }, 404);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const action = parsed.data.action;
  const txHash = parsed.data.txHash;
  const hint = parsed.data.hint?.trim();

  const updated = store.updateRun(runId, (r) => {
    if (action === "cancel") {
      r.status = "cancelled";
      r.completedAt = new Date().toISOString();
      r.pendingDecision = undefined;
      r.pendingToolActions = undefined;
      return;
    }
    if (action === "retry" && r.pendingDecision?.type === "retry_or_cancel") {
      const idx = r.pendingDecision.stepIndex;
      const target = r.steps.find((s) => s.index === idx);
      if (target) {
        target.status = "pending";
      }
      r.pendingToolActions = undefined;
    }
    if (action === "continue" && r.pendingDecision?.type === "provide_hint") {
      const idx = r.pendingDecision.stepIndex;
      const target = r.steps.find((s) => s.index === idx);
      if (target) {
        target.status = "pending";
        if (hint) {
          target.lastOutput = `HITL hint: ${hint}`.slice(0, 2_000);
          target.lastError = undefined;
        }
      }
      r.logs.push({
        at: new Date().toISOString(),
        level: "info",
        message: hint
          ? `Human hint accepted for step ${idx + 1}: ${hint.slice(0, 120)}`
          : `Human resumed run for step ${idx + 1} without hint.`,
      });
      r.logs = r.logs.slice(-500);
    }
    if (action === "continue" && r.pendingDecision?.type === "approve_transaction") {
      const idx = r.pendingDecision.stepIndex;
      const target = r.steps.find((s) => s.index === idx);
      if (target) {
        target.status = "completed";
        target.lastError = undefined;
        target.lastOutput = txHash
          ? `Signed and submitted transaction: ${txHash}`
          : "Transaction approved by user.";
      }
      r.logs.push({
        at: new Date().toISOString(),
        level: "info",
        message: txHash
          ? `Transaction confirmed by user: ${txHash}`
          : "Transaction confirmed by user.",
      });
      r.logs = r.logs.slice(-500);
    }
    r.pendingDecision = undefined;
    r.status = "executing";
  });
  if (!updated) return c.json({ error: "not_found" }, 404);
  if (updated.status !== "cancelled") startRunProcessing(runId);
  return c.json({ run: updated });
});

runsRoutes.post("/:id/cancel", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const runId = c.req.param("id");
  const run = store.findRunById(runId);
  if (!run || run.userId !== user.id) return c.json({ error: "not_found" }, 404);
  const updated = store.updateRun(runId, (r) => {
    r.status = "cancelled";
    r.completedAt = new Date().toISOString();
    r.pendingDecision = undefined;
    r.pendingToolActions = undefined;
  });
  return c.json({ run: updated });
});

runsRoutes.post("/:id/export-research", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const run = store.findRunById(c.req.param("id"));
  if (!run || run.userId !== user.id) return c.json({ error: "not_found" }, 404);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = exportResearchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const step = run.steps.find((s) => s.index === parsed.data.stepIndex);
  if (!step) return c.json({ error: "step_not_found" }, 404);
  const payload = extractResearchPayload(step.lastOutput);
  if (!payload) return c.json({ error: "research_payload_not_found" }, 404);

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payload);
  } catch {
    return c.json({ error: "invalid_research_payload" }, 500);
  }

  const dir = researchDir();
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName =
    parsed.data.filename?.replace(/[^a-zA-Z0-9._-]/g, "_") ||
    `run-${run.id}-step-${step.index + 1}-${ts}.json`;
  const fullPath = join(dir, baseName.endsWith(".json") ? baseName : `${baseName}.json`);
  writeFileSync(fullPath, `${JSON.stringify(parsedPayload, null, 2)}\n`, "utf-8");
  return c.json({ exported: true, path: fullPath });
});

runsRoutes.get("/:id/rollback-preview", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const run = store.findRunById(c.req.param("id"));
  if (!run || run.userId !== user.id) return c.json({ error: "not_found" }, 404);
  const preview = await previewRollback(run.checkpointBranch);
  if (!preview.ok) return c.json({ error: preview.reason ?? "rollback_preview_failed" }, 400);
  const previewToken = randomBytes(16).toString("hex");
  const previewAt = new Date().toISOString();
  store.updateRun(run.id, (r) => {
    r.rollbackPreviewToken = previewToken;
    r.rollbackPreviewAt = previewAt;
  });
  return c.json({
    checkpointBranch: run.checkpointBranch,
    checkpointBaseBranch: run.checkpointBaseBranch,
    previewToken,
    previewExpiresInMs: ROLLBACK_PREVIEW_TTL_MS,
    commands: preview.commands,
  });
});

runsRoutes.post("/:id/rollback", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const run = store.findRunById(c.req.param("id"));
  if (!run || run.userId !== user.id) return c.json({ error: "not_found" }, 404);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = rollbackExecuteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "confirmation_required", details: parsed.error.flatten() }, 400);
  }
  const previewAtMs = run.rollbackPreviewAt ? Date.parse(run.rollbackPreviewAt) : NaN;
  const previewFresh =
    Number.isFinite(previewAtMs) && Date.now() - previewAtMs <= ROLLBACK_PREVIEW_TTL_MS;
  if (!run.rollbackPreviewToken || !previewFresh) {
    return c.json({ error: "rollback_preview_required" }, 409);
  }
  if (parsed.data.previewToken !== run.rollbackPreviewToken) {
    return c.json({ error: "rollback_preview_token_mismatch" }, 409);
  }
  const result = await executeRollback(run.checkpointBranch);
  if (!result.ok) {
    return c.json(
      {
        error: result.reason ?? "rollback_failed",
        commands: result.commands,
        stderr: result.stderr,
      },
      500,
    );
  }
  store.updateRun(run.id, (r) => {
    r.rollbackPreviewToken = undefined;
    r.rollbackPreviewAt = undefined;
  });
  return c.json({
    ok: true,
    commands: result.commands,
    stdout: result.stdout,
  });
});
