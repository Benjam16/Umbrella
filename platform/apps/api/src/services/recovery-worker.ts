import { store, type RunStatus } from "../store.js";
import { startRunProcessing } from "./runner.js";

const RECOVERABLE_STATUSES: RunStatus[] = [
  "queued",
  "planning",
  "executing",
  "verifying",
];

export function startRunRecoveryWorker(): void {
  const intervalMs = Math.max(
    5_000,
    Number(process.env.UMBRELLA_RUN_RECOVERY_INTERVAL_MS ?? 15_000),
  );

  const tick = () => {
    const recoverableRuns = store
      .listRunsByStatuses(RECOVERABLE_STATUSES)
      .slice(0, 50);
    for (const run of recoverableRuns) {
      startRunProcessing(run.id);
    }
  };

  tick();
  setInterval(tick, intervalMs);
}
