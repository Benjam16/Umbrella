import { existsSync, mkdirSync, statSync, copyFileSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { store } from "../store.js";

function backupsDir(): string {
  const root = process.env.UMBRELLA_DATA_DIR ?? join(process.cwd(), "data");
  return join(root, "backups");
}

type RestoreToken = {
  snapshotId: string;
  expiresAt: number;
  userId?: string;
};

const restoreTokens = new Map<string, RestoreToken>();

function sha256ForFile(path: string): string {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

function retentionCount(): number {
  return Math.max(3, Number(process.env.UMBRELLA_BACKUP_RETENTION_COUNT ?? 30));
}

export function createBackupSnapshot(options?: {
  reason?: string;
  createdByUserId?: string;
}): { ok: boolean; snapshotId?: string; path?: string; error?: string } {
  try {
    const src = store.path();
    if (!existsSync(src)) return { ok: false, error: "store_file_not_found" };
    const dir = backupsDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${basename(src)}.${ts}.bak`;
    const target = join(dir, filename);
    copyFileSync(src, target);
    const sizeBytes = statSync(target).size;
    const checksumSha256 = sha256ForFile(target);
    const snapshot = store.createBackupSnapshot({
      createdByUserId: options?.createdByUserId,
      path: target,
      sizeBytes,
      checksumSha256,
      encrypted: Boolean(process.env.UMBRELLA_STORE_ENCRYPTION_KEY?.trim()),
      reason: options?.reason,
    });
    trimOldBackups();
    return { ok: true, snapshotId: snapshot.id, path: target };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function trimOldBackups(): void {
  const dir = backupsDir();
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .map((name) => ({ name, path: join(dir, name), stat: statSync(join(dir, name)) }))
    .filter((v) => v.stat.isFile())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const keep = retentionCount();
  for (const old of files.slice(keep)) {
    try {
      rmSync(old.path, { force: true });
    } catch {
      // no-op
    }
  }
}

export function backupSummary(limit = 50): {
  snapshots: ReturnType<typeof store.listBackupSnapshots>;
  backupsDir: string;
  storePath: string;
} {
  return {
    snapshots: store.listBackupSnapshots(limit),
    backupsDir: backupsDir(),
    storePath: store.path(),
  };
}

export function verifyBackupSnapshot(snapshotId: string): {
  ok: boolean;
  error?: string;
  snapshotId?: string;
  path?: string;
  checksumSha256?: string;
  checksumMatches?: boolean;
  currentSizeBytes?: number;
} {
  const snapshot = store.findBackupSnapshotById(snapshotId);
  if (!snapshot) return { ok: false, error: "snapshot_not_found" };
  if (!existsSync(snapshot.path)) return { ok: false, error: "snapshot_file_not_found" };
  const dir = backupsDir();
  if (!snapshot.path.startsWith(dir)) return { ok: false, error: "snapshot_outside_backup_dir" };
  const currentSizeBytes = statSync(snapshot.path).size;
  const checksumSha256 = sha256ForFile(snapshot.path);
  const checksumMatches = snapshot.checksumSha256 ? snapshot.checksumSha256 === checksumSha256 : true;
  return {
    ok: true,
    snapshotId: snapshot.id,
    path: snapshot.path,
    checksumSha256,
    checksumMatches,
    currentSizeBytes,
  };
}

export function verifyRecentBackups(limit = 5): {
  ok: boolean;
  checked: number;
  failures: Array<{ snapshotId?: string; error: string }>;
} {
  const snapshots = store.listBackupSnapshots(limit);
  const failures: Array<{ snapshotId?: string; error: string }> = [];
  for (const snapshot of snapshots) {
    const res = verifyBackupSnapshot(snapshot.id);
    if (!res.ok) {
      failures.push({ snapshotId: snapshot.id, error: res.error ?? "backup_verify_failed" });
      continue;
    }
    if (res.checksumMatches === false) {
      failures.push({ snapshotId: snapshot.id, error: "backup_checksum_mismatch" });
    }
  }
  return {
    ok: failures.length === 0,
    checked: snapshots.length,
    failures,
  };
}

function restoreTokenTtlMs(): number {
  return Math.max(30_000, Number(process.env.UMBRELLA_BACKUP_RESTORE_PREVIEW_TTL_MS ?? 10 * 60_000));
}

export function previewRestoreSnapshot(options: {
  snapshotId: string;
  requestedByUserId?: string;
}): {
  ok: boolean;
  error?: string;
  previewToken?: string;
  snapshotPath?: string;
  storePath?: string;
  expiresInMs?: number;
} {
  const snapshot = store.findBackupSnapshotById(options.snapshotId);
  if (!snapshot) return { ok: false, error: "snapshot_not_found" };
  if (!existsSync(snapshot.path)) return { ok: false, error: "snapshot_file_not_found" };
  const dir = backupsDir();
  if (!snapshot.path.startsWith(dir)) return { ok: false, error: "snapshot_outside_backup_dir" };
  const token = randomBytes(16).toString("hex");
  const ttl = restoreTokenTtlMs();
  restoreTokens.set(token, {
    snapshotId: snapshot.id,
    expiresAt: Date.now() + ttl,
    userId: options.requestedByUserId,
  });
  return {
    ok: true,
    previewToken: token,
    snapshotPath: snapshot.path,
    storePath: store.path(),
    expiresInMs: ttl,
  };
}

export function executeRestoreSnapshot(options: {
  snapshotId: string;
  previewToken: string;
  requestedByUserId?: string;
}): { ok: boolean; error?: string; restoredPath?: string; previousSnapshotId?: string } {
  const token = restoreTokens.get(options.previewToken);
  if (!token) return { ok: false, error: "restore_preview_required" };
  if (token.snapshotId !== options.snapshotId) return { ok: false, error: "restore_preview_token_mismatch" };
  if (Date.now() > token.expiresAt) {
    restoreTokens.delete(options.previewToken);
    return { ok: false, error: "restore_preview_expired" };
  }
  if (token.userId && options.requestedByUserId && token.userId !== options.requestedByUserId) {
    return { ok: false, error: "restore_preview_user_mismatch" };
  }
  const snapshot = store.findBackupSnapshotById(options.snapshotId);
  if (!snapshot) return { ok: false, error: "snapshot_not_found" };
  if (!existsSync(snapshot.path)) return { ok: false, error: "snapshot_file_not_found" };
  const dir = backupsDir();
  if (!snapshot.path.startsWith(dir)) return { ok: false, error: "snapshot_outside_backup_dir" };
  const pre = createBackupSnapshot({
    reason: "pre_restore_auto_snapshot",
    createdByUserId: options.requestedByUserId,
  });
  if (!pre.ok) return { ok: false, error: `pre_restore_snapshot_failed:${pre.error ?? "unknown"}` };
  copyFileSync(snapshot.path, store.path());
  restoreTokens.delete(options.previewToken);
  return {
    ok: true,
    restoredPath: snapshot.path,
    previousSnapshotId: pre.snapshotId,
  };
}
