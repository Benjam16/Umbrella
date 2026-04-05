import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { memory } from './memory.js';
import type { ScheduleEntry } from './schedule-types.js';

export type { ScheduleEntry } from './schedule-types.js';

const SCHEDULE_PATH = path.join(os.homedir(), '.umbrella', 'schedule.json');

function asEntry(raw: unknown): ScheduleEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const goal = typeof o.goal === 'string' ? o.goal.trim() : '';
  if (!goal) return null;

  const cronExpr =
    typeof o.cron === 'string'
      ? o.cron.trim()
      : typeof o.cronExpression === 'string'
        ? o.cronExpression.trim()
        : '';
  if (cronExpr) {
    const tz =
      typeof o.timezone === 'string' && o.timezone.trim()
        ? o.timezone.trim()
        : undefined;
    return { kind: 'cron', cron: cronExpr, goal, timezone: tz };
  }

  const intervalMs = Number(o.intervalMs);
  if (Number.isFinite(intervalMs) && intervalMs >= 10_000) {
    return { kind: 'interval', intervalMs, goal };
  }
  return null;
}

/** Read `schedule.json` only (no DB). */
export async function parseScheduleJsonFile(): Promise<ScheduleEntry[]> {
  try {
    if (!(await fs.pathExists(SCHEDULE_PATH))) return [];
    const j = (await fs.readJson(SCHEDULE_PATH)) as Record<string, unknown>;

    if (Array.isArray(j.schedules)) {
      const out: ScheduleEntry[] = [];
      for (const item of j.schedules) {
        const e = asEntry(item);
        if (e) out.push(e);
      }
      return out;
    }

    const single = asEntry(j);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

/**
 * Load schedules: sync `~/.umbrella/schedule.json` into SQLite (`umbrella_schedules`), then return DB rows.
 * If the JSON file is missing, the table is cleared (disables all schedules).
 */
export async function loadScheduleEntries(): Promise<ScheduleEntry[]> {
  const parsed = await parseScheduleJsonFile();
  await memory.syncUmbrellaSchedules(parsed);
  return memory.listUmbrellaSchedules();
}

/** @deprecated use loadScheduleEntries */
export async function loadSchedule(): Promise<{
  intervalMs: number;
  goal: string;
} | null> {
  const all = await loadScheduleEntries();
  const firstInterval = all.find((e) => e.kind === 'interval');
  if (!firstInterval || firstInterval.kind !== 'interval') return null;
  return {
    intervalMs: firstInterval.intervalMs,
    goal: firstInterval.goal,
  };
}
