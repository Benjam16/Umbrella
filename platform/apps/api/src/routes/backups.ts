import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../services/auth.js";
import { getBackupIntegrityDashboard } from "../services/backup-integrity-worker.js";
import {
  backupSummary,
  createBackupSnapshot,
  executeRestoreSnapshot,
  previewRestoreSnapshot,
  verifyBackupSnapshot,
} from "../services/backup.js";

const createSchema = z.object({
  reason: z.string().min(1).max(240).optional(),
});

const previewSchema = z.object({
  snapshotId: z.string().min(8).max(120),
});

const executeSchema = z.object({
  snapshotId: z.string().min(8).max(120),
  previewToken: z.string().min(8).max(200),
  confirm: z.literal("EXECUTE_RESTORE"),
});

const verifySchema = z.object({
  snapshotId: z.string().min(8).max(120),
});

export const backupsRoutes = new Hono();

backupsRoutes.get("/", (c) => {
  const user = requireRole(c, ["owner", "admin", "analyst"]);
  if (user instanceof Response) return user;
  const limitRaw = Number(c.req.query("limit") ?? 50);
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 50));
  return c.json(backupSummary(limit));
});

backupsRoutes.get("/integrity", (c) => {
  const user = requireRole(c, ["owner", "admin", "analyst"]);
  if (user instanceof Response) return user;
  return c.json(getBackupIntegrityDashboard());
});

backupsRoutes.post("/snapshot", async (c) => {
  const user = requireRole(c, ["owner", "admin"]);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const res = createBackupSnapshot({
    reason: parsed.data.reason ?? "manual_snapshot",
    createdByUserId: user.id,
  });
  if (!res.ok) {
    return c.json({ error: res.error ?? "backup_failed" }, 500);
  }
  return c.json({ ok: true, snapshotId: res.snapshotId, path: res.path }, 201);
});

backupsRoutes.post("/restore-preview", async (c) => {
  const user = requireRole(c, ["owner", "admin"]);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const res = previewRestoreSnapshot({
    snapshotId: parsed.data.snapshotId,
    requestedByUserId: user.id,
  });
  if (!res.ok) return c.json({ error: res.error ?? "restore_preview_failed" }, 400);
  return c.json({
    ok: true,
    previewToken: res.previewToken,
    snapshotPath: res.snapshotPath,
    storePath: res.storePath,
    expiresInMs: res.expiresInMs,
  });
});

backupsRoutes.post("/restore", async (c) => {
  const user = requireRole(c, ["owner", "admin"]);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = executeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const res = executeRestoreSnapshot({
    snapshotId: parsed.data.snapshotId,
    previewToken: parsed.data.previewToken,
    requestedByUserId: user.id,
  });
  if (!res.ok) return c.json({ error: res.error ?? "restore_failed" }, 409);
  return c.json({
    ok: true,
    restoredPath: res.restoredPath,
    previousSnapshotId: res.previousSnapshotId,
  });
});

backupsRoutes.post("/verify", async (c) => {
  const user = requireRole(c, ["owner", "admin", "analyst"]);
  if (user instanceof Response) return user;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
  }
  const res = verifyBackupSnapshot(parsed.data.snapshotId);
  if (!res.ok) return c.json({ error: res.error ?? "backup_verify_failed" }, 404);
  return c.json(res);
});
