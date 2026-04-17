import { Hono } from "hono";
import { z } from "zod";
import { requireRole, requireUser } from "../services/auth.js";
import { resolvePolicyProfile, updatePolicyProfile } from "../services/policy.js";
import { store } from "../store.js";

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  riskBlockThreshold: z.number().int().min(1).max(10).optional(),
  requireApprovalForProtectedWrites: z.boolean().optional(),
  requireApprovalForTransactions: z.boolean().optional(),
  allowedActionTypes: z
    .array(
      z.enum([
        "run_command",
        "write_file_patch",
        "navigate_and_extract",
        "propose_on_chain_tx",
        "retrieve_context",
      ]),
    )
    .max(10)
    .optional(),
});

export const policyRoutes = new Hono();

policyRoutes.get("/profile", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({ profile: resolvePolicyProfile(user.id) });
});

policyRoutes.post("/profile", async (c) => {
  const user = requireRole(c, ["owner", "admin"]);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const profile = updatePolicyProfile(user.id, parsed.data);
  return c.json({ profile });
});

policyRoutes.get("/decisions", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const runId = c.req.query("runId");
  const limitRaw = Number(c.req.query("limit") ?? 50);
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));
  const all = store.listPolicyDecisionsByUser(user.id);
  const filtered = runId ? all.filter((d) => d.runId === runId) : all;
  return c.json({ decisions: filtered.slice(0, limit) });
});
