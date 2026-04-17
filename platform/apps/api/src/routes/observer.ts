import { Hono } from "hono";
import { z } from "zod";
import { scrapeTargetSchema } from "@umbrella/shared";
import { observeAndExtract } from "../services/scraper.js";
import { requireUser } from "../services/auth.js";
import { store } from "../store.js";
import { evaluateSiteWatch } from "../services/site-watch-worker.js";

const extractSchema = z.object({
  target: scrapeTargetSchema,
});

const createWatchSchema = z.object({
  name: z.string().min(1).max(120),
  target: scrapeTargetSchema,
  triggerObjective: z.string().min(8).max(20_000),
  thresholds: z
    .object({
      minItems: z.number().int().min(1).max(1000).optional(),
      mustIncludeText: z.string().min(1).max(300).optional(),
      maxHoursBetweenTriggers: z.number().positive().max(24 * 30).optional(),
    })
    .optional()
    .default({}),
  active: z.boolean().optional().default(true),
  alerts: z
    .object({
      enabled: z.boolean().optional().default(false),
      webhookUrl: z.string().url().optional(),
      discordWebhookUrl: z.string().url().optional(),
      telegramBotToken: z.string().min(5).max(300).optional(),
      telegramChatId: z.string().min(1).max(100).optional(),
    })
    .optional()
    .default({ enabled: false }),
});

const updateWatchSchema = z.object({
  active: z.boolean().optional(),
  triggerObjective: z.string().min(8).max(20_000).optional(),
  thresholds: z
    .object({
      minItems: z.number().int().min(1).max(1000).optional(),
      mustIncludeText: z.string().min(1).max(300).optional(),
      maxHoursBetweenTriggers: z.number().positive().max(24 * 30).optional(),
    })
    .optional(),
  alerts: z
    .object({
      enabled: z.boolean().optional(),
      webhookUrl: z.string().url().optional(),
      discordWebhookUrl: z.string().url().optional(),
      telegramBotToken: z.string().min(5).max(300).optional(),
      telegramChatId: z.string().min(1).max(100).optional(),
    })
    .optional(),
});

export const observerRoutes = new Hono();

observerRoutes.post("/extract", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = extractSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  try {
    const result = await observeAndExtract(parsed.data.target);
    return c.json({ result }, 200);
  } catch (e) {
    return c.json(
      {
        error: "observer_extract_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      502,
    );
  }
});

observerRoutes.get("/watches", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({ watches: store.listSiteWatchesByUser(user.id) });
});

observerRoutes.post("/watches", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = createWatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const watch = store.createSiteWatch({
    userId: user.id,
    name: parsed.data.name,
    target: parsed.data.target,
    triggerObjective: parsed.data.triggerObjective,
    thresholds: parsed.data.thresholds ?? {},
    alerts: {
      enabled: parsed.data.alerts?.enabled ?? false,
      webhookUrl: parsed.data.alerts?.webhookUrl,
      discordWebhookUrl: parsed.data.alerts?.discordWebhookUrl,
      telegramBotToken: parsed.data.alerts?.telegramBotToken,
      telegramChatId: parsed.data.alerts?.telegramChatId,
    },
    active: parsed.data.active ?? true,
  });
  return c.json({ watch }, 201);
});

observerRoutes.patch("/watches/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const watch = store.findSiteWatchById(c.req.param("id"));
  if (!watch || watch.userId !== user.id) return c.json({ error: "not_found" }, 404);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = updateWatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const updated = store.updateSiteWatch(watch.id, (w) => {
    if (typeof parsed.data.active === "boolean") w.active = parsed.data.active;
    if (typeof parsed.data.triggerObjective === "string") {
      w.triggerObjective = parsed.data.triggerObjective;
    }
    if (parsed.data.thresholds) {
      w.thresholds = { ...w.thresholds, ...parsed.data.thresholds };
    }
    if (parsed.data.alerts) {
      w.alerts = { ...w.alerts, ...parsed.data.alerts };
    }
  });
  return c.json({ watch: updated });
});

observerRoutes.delete("/watches/:id", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const watch = store.findSiteWatchById(c.req.param("id"));
  if (!watch || watch.userId !== user.id) return c.json({ error: "not_found" }, 404);
  const ok = store.deleteSiteWatch(watch.id);
  return c.json({ ok });
});

observerRoutes.post("/watches/:id/evaluate", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const watch = store.findSiteWatchById(c.req.param("id"));
  if (!watch || watch.userId !== user.id) return c.json({ error: "not_found" }, 404);
  try {
    await evaluateSiteWatch(watch.id);
    const latest = store.findSiteWatchById(watch.id);
    return c.json({ watch: latest });
  } catch (e) {
    return c.json(
      { error: "watch_evaluate_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});
