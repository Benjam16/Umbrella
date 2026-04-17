import { Hono } from "hono";
import { requireUser } from "../services/auth.js";
import { workerQueue } from "../services/worker-queue.js";

export const workersRoutes = new Hono();

workersRoutes.get("/status", (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({
    workers: workerQueue.stats(),
  });
});
