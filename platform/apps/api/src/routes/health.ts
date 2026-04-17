import { Hono } from "hono";
import { requireRole } from "../services/auth.js";
import { getBackupIntegrityDashboard } from "../services/backup-integrity-worker.js";

/** Public health checks live on `GET /health`. Authenticated DR status: `GET /v1/health/dr`. */
export const healthRoutes = new Hono();

healthRoutes.get("/dr", (c) => {
  const user = requireRole(c, ["owner", "admin", "analyst"]);
  if (user instanceof Response) return user;
  return c.json(getBackupIntegrityDashboard());
});
