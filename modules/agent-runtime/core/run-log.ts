import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const LOG_PATH = path.join(os.homedir(), '.umbrella', 'run-log.jsonl');
const LAST_RUN_PATH = path.join(os.homedir(), '.umbrella', 'last-run.json');

export type RunLogEntry = {
  t: string;
  goal: string;
  goalSource?: string;
  skipped?: boolean;
  verifyOk: boolean | null;
  promotedSkills: number;
  pendingSkillsCreated: number;
  /** First ~2.5k chars of plan XML (Milestone 6 replay artifact). */
  planPreview?: string;
  /** Count of `<task>` blocks in the plan (best-effort). */
  taskCount?: number;
  /** Truncated last execution_result text. */
  executionPreview?: string;
};

export async function appendRunLog(entry: RunLogEntry): Promise<void> {
  try {
    await fs.ensureDir(path.dirname(LOG_PATH));
    await fs.appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
    await fs.writeJson(LAST_RUN_PATH, entry, { spaces: 2 });
  } catch {
    /* ignore */
  }
}

export async function readLastRun(): Promise<RunLogEntry | null> {
  try {
    if (!(await fs.pathExists(LAST_RUN_PATH))) return null;
    return (await fs.readJson(LAST_RUN_PATH)) as RunLogEntry;
  } catch {
    return null;
  }
}

/** Newest-last lines from `run-log.jsonl` (for dashboard / replay). */
export async function readRunLogTail(limit: number): Promise<RunLogEntry[]> {
  const n = Math.min(Math.max(1, limit), 200);
  try {
    if (!(await fs.pathExists(LOG_PATH))) return [];
    const raw = await fs.readFile(LOG_PATH, 'utf8');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const slice = lines.slice(-n);
    const out: RunLogEntry[] = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line) as RunLogEntry);
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}
