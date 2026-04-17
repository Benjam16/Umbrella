import { Hono } from "hono";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireUser } from "../services/auth.js";
import { startOutreachDispatch } from "../services/outreach.js";
import { store } from "../store.js";

function randomId(): string {
  return randomBytes(12).toString("hex");
}

const targetSchema = z.object({
  channel: z.enum(["email", "webhook", "linkedin"]),
  address: z.string().min(3).max(500),
  variables: z.record(z.string(), z.string()).optional(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(120),
  objective: z.string().min(8).max(5000),
  messageTemplate: z.string().min(3).max(5000),
  targets: z.array(targetSchema).min(1).max(200),
  active: z.boolean().optional().default(true),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  objective: z.string().min(8).max(5000).optional(),
  messageTemplate: z.string().min(3).max(5000).optional(),
  targets: z.array(targetSchema).min(1).max(200).optional(),
  active: z.boolean().optional(),
});

export const outreachRoutes = new Hono();

outreachRoutes.get("/campaigns", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({ campaigns: store.listOutreachCampaignsByUser(user.id) });
});

outreachRoutes.post("/campaigns", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const targets = parsed.data.targets.map((t) => ({
    id: randomId(),
    channel: t.channel,
    address: t.address,
    variables: t.variables,
  }));
  const campaign = store.createOutreachCampaign({
    userId: user.id,
    name: parsed.data.name,
    objective: parsed.data.objective,
    messageTemplate: parsed.data.messageTemplate,
    targets,
    active: parsed.data.active ?? true,
  });
  return c.json({ campaign }, 201);
});

outreachRoutes.patch("/campaigns/:id", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const campaign = store.findOutreachCampaignById(c.req.param("id"));
  if (!campaign || campaign.userId !== user.id) return c.json({ error: "not_found" }, 404);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = updateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const updated = store.updateOutreachCampaign(campaign.id, (d) => {
    if (parsed.data.name) d.name = parsed.data.name;
    if (parsed.data.objective) d.objective = parsed.data.objective;
    if (parsed.data.messageTemplate) d.messageTemplate = parsed.data.messageTemplate;
    if (typeof parsed.data.active === "boolean") d.active = parsed.data.active;
    if (parsed.data.targets) {
      d.targets = parsed.data.targets.map((t) => ({
        id: randomId(),
        channel: t.channel,
        address: t.address,
        variables: t.variables,
      }));
    }
  });
  return c.json({ campaign: updated });
});

outreachRoutes.get("/dispatches", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const campaignId = c.req.query("campaignId");
  const all = store.listOutreachDispatchesByUser(user.id);
  const dispatches = campaignId ? all.filter((d) => d.campaignId === campaignId) : all;
  return c.json({ dispatches: dispatches.slice(0, 100) });
});

outreachRoutes.post("/campaigns/:id/dispatch", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const campaign = store.findOutreachCampaignById(c.req.param("id"));
  if (!campaign || campaign.userId !== user.id) return c.json({ error: "not_found" }, 404);
  if (!campaign.active) return c.json({ error: "campaign_inactive" }, 409);
  const dispatch = store.createOutreachDispatch({
    userId: user.id,
    campaignId: campaign.id,
    status: "queued",
  });
  startOutreachDispatch(dispatch.id);
  return c.json({ dispatch }, 202);
});
