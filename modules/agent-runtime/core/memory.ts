import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import type { ScheduleEntry } from './schedule-types.js';

const DB_PATH = path.join(os.homedir(), '.umbrella', 'memory.db');

export type MemoryRow = {
  id: number;
  timestamp: string;
  type: string;
  content: string;
  tags: string;
  embedding: string | null;
  summary: string | null;
};

export class UmbrellaMemory {
  private db!: Awaited<ReturnType<typeof open>>;

  async init(): Promise<void> {
    await fs.ensureDir(path.dirname(DB_PATH));
    this.db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });

    await this.db.exec(`
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  type TEXT,
  content TEXT,
  tags TEXT,
  embedding TEXT,
  summary TEXT
);
CREATE TABLE IF NOT EXISTS agent_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS umbrella_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('interval','cron')),
  interval_ms INTEGER,
  cron_expr TEXT,
  goal TEXT NOT NULL,
  timezone TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
`);
    console.log('☂️ Umbrella Memory initialized');
  }

  /** Replace all rows (typically from `schedule.json` on daemon start). */
  async syncUmbrellaSchedules(entries: ScheduleEntry[]): Promise<void> {
    await this.db.run('DELETE FROM umbrella_schedules');
    let order = 0;
    for (const e of entries) {
      if (e.kind === 'interval') {
        await this.db.run(
          `INSERT INTO umbrella_schedules (kind, interval_ms, cron_expr, goal, timezone, sort_order)
           VALUES ('interval', ?, NULL, ?, NULL, ?)`,
          e.intervalMs,
          e.goal,
          order,
        );
      } else {
        await this.db.run(
          `INSERT INTO umbrella_schedules (kind, interval_ms, cron_expr, goal, timezone, sort_order)
           VALUES ('cron', NULL, ?, ?, ?, ?)`,
          e.cron,
          e.goal,
          e.timezone ?? null,
          order,
        );
      }
      order += 1;
    }
  }

  async listUmbrellaSchedules(): Promise<ScheduleEntry[]> {
    type Row = {
      kind: string;
      interval_ms: number | null;
      cron_expr: string | null;
      goal: string;
      timezone: string | null;
    };
    const rows = (await this.db.all(
      'SELECT kind, interval_ms, cron_expr, goal, timezone FROM umbrella_schedules ORDER BY sort_order ASC',
    )) as Row[];
    const out: ScheduleEntry[] = [];
    for (const r of rows) {
      if (r.kind === 'interval' && r.interval_ms != null) {
        out.push({ kind: 'interval', intervalMs: r.interval_ms, goal: r.goal });
      } else if (r.kind === 'cron' && r.cron_expr) {
        out.push({
          kind: 'cron',
          cron: r.cron_expr,
          goal: r.goal,
          timezone: r.timezone ?? undefined,
        });
      }
    }
    return out;
  }

  async getAgentState(key: string): Promise<string | null> {
    const row = await this.db.get<{ value: string }>(
      'SELECT value FROM agent_state WHERE key = ?',
      key,
    );
    return row?.value ?? null;
  }

  async setAgentState(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO agent_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      key,
      value,
    );
  }

  async deleteAgentState(key: string): Promise<void> {
    await this.db.run('DELETE FROM agent_state WHERE key = ?', key);
  }

  async ingest(type: string, content: string, tags: string[] = []): Promise<number> {
    const res = await this.db.run(
      'INSERT INTO memories (type, content, tags) VALUES (?, ?, ?)',
      [type, content, tags.join(',')],
    );
    const id = Number(res.lastID);
    await this.autoSummarize();
    return id;
  }

  async recall(query: string, limit = 5): Promise<MemoryRow[]> {
    const q = query.trim() || '%';
    const like = q === '%' ? '%' : `%${q}%`;
    const rows = (await this.db.all(
      `SELECT * FROM memories
WHERE content LIKE ? OR tags LIKE ?
ORDER BY timestamp DESC LIMIT ?`,
      like,
      like,
      limit,
    )) as MemoryRow[];
    return rows;
  }

  async recallByType(type: string, limit = 20): Promise<MemoryRow[]> {
    return (await this.db.all(
      `SELECT * FROM memories WHERE type = ? ORDER BY timestamp DESC LIMIT ?`,
      type,
      limit,
    )) as MemoryRow[];
  }

  async autoSummarize(): Promise<void> {
    const count = await this.db.get<{ c: number }>('SELECT COUNT(*) as c FROM memories');
    const n = count?.c ?? 0;
    if (n === 0 || n % 10 !== 0) return;

    const recent = await this.db.all<{ content: string }[]>(
      'SELECT content FROM memories ORDER BY id DESC LIMIT 20',
    );
    const summary = `AUTO-SKILL ${new Date().toISOString()}:\n${recent.map((r) => r.content).join('\n')}`;
    const autoDir = path.join(os.homedir(), '.umbrella', 'skills', 'auto');
    await fs.ensureDir(autoDir);
    await fs.writeFile(path.join(autoDir, `skill-${Date.now()}.md`), summary, 'utf8');
  }
}

export const memory = new UmbrellaMemory();
