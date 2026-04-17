import { Hono } from "hono";
import { requireUser } from "../services/auth.js";
import { store } from "../store.js";

export const auditRoutes = new Hono();

auditRoutes.get("/events", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const limitRaw = Number(c.req.query("limit") ?? 200);
  const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 200));
  return c.json({ events: store.listAuditEventsByUser(user.id, limit) });
});
