import { Hono } from "hono";
import { createRunInputDefaults, startRunProcessing } from "../services/runner.js";
import { normalizeBlockchainWebhook } from "../services/webhook-normalizer.js";
import { store } from "../store.js";

function hasValidWebhookSecret(c: { req: { header: (n: string) => string | undefined } }): boolean {
  const expected = process.env.UMBRELLA_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const got = c.req.header("x-umbrella-webhook-secret")?.trim();
  return !!got && got === expected;
}

const ACTIVE_RUN_STATUSES = ["queued", "planning", "executing", "verifying"] as const;

export const webhooksRoutes = new Hono();

webhooksRoutes.post("/blockchain", async (c) => {
  if (!hasValidWebhookSecret(c)) return c.json({ error: "unauthorized_webhook" }, 401);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const evt = normalizeBlockchainWebhook(body);
  if (!evt) return c.json({ error: "validation_error", message: "unsupported_webhook_payload" }, 400);
  const user =
    (evt.userId ? store.findUserById(evt.userId) : undefined) ||
    (evt.userEmail ? store.findUserByEmail(evt.userEmail) : undefined);
  if (!user) {
    return c.json({ error: "user_not_found", message: "Provide userId or userEmail for routing." }, 404);
  }

  const runs = store
    .listRunsByUser(user.id)
    .filter((r) => ACTIVE_RUN_STATUSES.includes(r.status as (typeof ACTIVE_RUN_STATUSES)[number]))
    .slice(0, 5);

  for (const run of runs) {
    store.updateRun(run.id, (r) => {
      r.logs.push({
        at: new Date().toISOString(),
        level: "info",
        message:
          `Blockchain webhook received (${evt.eventType})` +
          `${evt.txHash ? ` tx=${evt.txHash}` : ""}` +
          `${evt.walletAddress ? ` wallet=${evt.walletAddress}` : ""}`,
      });
      r.logs = r.logs.slice(-500);
      if (r.status === "queued" || r.status === "planning" || r.status === "verifying") {
        r.status = "executing";
      }
    });
    startRunProcessing(run.id);
  }

  let createdRunId: string | null = null;
  if (runs.length === 0 && evt.objective) {
    const defaults = createRunInputDefaults();
    const run = store.createRun({
      userId: user.id,
      objective: evt.objective,
      missionSource: "manual",
      status: "queued",
      maxCredits: evt.maxCredits ?? defaults.maxCredits,
      maxSteps: defaults.maxSteps,
      maxMinutes: defaults.maxMinutes,
      maxAutoFixes: defaults.maxAutoFixes,
    });
    createdRunId = run.id;
    startRunProcessing(run.id);
  }

  return c.json({
    ok: true,
    provider: evt.provider,
    routedUserId: user.id,
    resumedRunIds: runs.map((r) => r.id),
    createdRunId,
  });
});
