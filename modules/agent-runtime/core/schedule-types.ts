/** Persisted / file-backed schedule rows (interval and cron). */
export type ScheduleEntry =
  | { kind: 'interval'; intervalMs: number; goal: string }
  | { kind: 'cron'; cron: string; goal: string; timezone?: string };
