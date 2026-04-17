import { createBackupSnapshot } from "./backup.js";

export function startBackupWorker(): void {
  if (process.env.UMBRELLA_BACKUP_ENABLED === "false") return;
  const intervalMs = Math.max(
    60_000,
    Number(process.env.UMBRELLA_BACKUP_INTERVAL_MS ?? 15 * 60_000),
  );

  const tick = () => {
    const res = createBackupSnapshot({ reason: "scheduled_worker" });
    if (!res.ok) {
      console.warn(`Backup worker failed: ${res.error ?? "unknown_error"}`);
    }
  };

  tick();
  setInterval(tick, intervalMs);
}
