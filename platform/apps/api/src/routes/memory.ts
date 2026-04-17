import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../services/auth.js";
import { retrieveContext } from "../services/memory.js";

const retrieveSchema = z.object({
  query: z.string().min(3).max(500),
  limit: z.number().int().min(1).max(10).optional(),
});

export const memoryRoutes = new Hono();

memoryRoutes.post("/retrieve", async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = retrieveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const results = retrieveContext({
    userId: user.id,
    query: parsed.data.query,
    limit: parsed.data.limit ?? 4,
  });
  return c.json({ results });
});
