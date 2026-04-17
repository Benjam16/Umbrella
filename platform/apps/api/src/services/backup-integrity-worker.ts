import { store } from "../store.js";
import { verifyRecentBackups } from "./backup.js";

export type LastBackupIntegritySweep = {
  sweptAt: string;
  ok: boolean;
  reason: string;
  checked: number;
  failures: Array<{ snapshotId?: string; error: string }>;
};

let lastSweep: LastBackupIntegritySweep | null = null;

function startupSweepEnabled(): boolean {
  return process.env.UMBRELLA_BACKUP_INTEGRITY_SWEEP_ENABLED !== "false";
}

function sweepCount(): number {
  return Math.max(1, Number(process.env.UMBRELLA_BACKUP_INTEGRITY_SWEEP_COUNT ?? 5));
}

function intervalMs(): number {
  const raw = Number(process.env.UMBRELLA_BACKUP_INTEGRITY_INTERVAL_MS ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(60_000, raw);
}

function runSweep(reason: string): void {
  const result = verifyRecentBackups(sweepCount());
  lastSweep = {
    sweptAt: new Date().toISOString(),
    ok: result.ok,
    reason,
    checked: result.checked,
    failures: result.failures,
  };
  const status = result.ok ? 200 : 424;
  const preview =
    result.failures.length > 0
      ? JSON.stringify({
          reason,
          checked: result.checked,
          failures: result.failures.slice(0, 5),
        })
      : JSON.stringify({ reason, checked: result.checked, ok: true });
  store.createAuditEvent({
    method: "SYSTEM",
    path: "/v1/system/backup-integrity",
    requestPreview: preview.slice(0, 800),
    status,
    latencyMs: 0,
  });
  if (!result.ok) {
    console.warn(`Backup integrity sweep failed (${reason}): ${preview}`);
  }
}

/** For GET /v1/backups/integrity — process-local status for DR health UI. */
export function getBackupIntegrityDashboard(): {
  sweepEnabled: boolean;
  lastSweep: LastBackupIntegritySweep | null;
} {
  return {
    sweepEnabled: startupSweepEnabled(),
    lastSweep,
  };
}

export function startBackupIntegrityWorker(): void {
  if (!startupSweepEnabled()) return;
  runSweep("startup");
  const every = intervalMs();
  if (every > 0) {
    setInterval(() => runSweep("interval"), every);
  }
}
