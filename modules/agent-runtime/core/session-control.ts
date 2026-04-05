import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

const SESSION_PATH = path.join(os.homedir(), '.umbrella', 'session.json');

export type SessionState = {
  sessionId: string;
  startedAt: string;
  heartbeats: number;
  lastGoal?: string;
  lastSliceKey?: string;
  updatedAt: string;
};

async function persist(s: SessionState): Promise<void> {
  await fs.ensureDir(path.dirname(SESSION_PATH));
  s.updatedAt = new Date().toISOString();
  await fs.writeJson(SESSION_PATH, s, { spaces: 2 });
}

/** Read session from disk, or null if never started (no file). */
export async function getSession(): Promise<SessionState | null> {
  if (!(await fs.pathExists(SESSION_PATH))) {
    return null;
  }
  try {
    return (await fs.readJson(SESSION_PATH)) as SessionState;
  } catch {
    return null;
  }
}

/** Pi-style heartbeat tick — creates session file on first run. */
export async function touchHeartbeat(goalPreview?: string): Promise<SessionState> {
  let s = await getSession();
  if (!s) {
    const id = process.env.UMBRELLA_SESSION_ID?.trim() || randomUUID();
    s = {
      sessionId: id,
      startedAt: new Date().toISOString(),
      heartbeats: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  s.heartbeats += 1;
  if (goalPreview) s.lastGoal = goalPreview.slice(0, 500);
  await persist(s);
  return s;
}

export async function checkpointSlice(sliceKey: string): Promise<void> {
  let s = await getSession();
  if (!s) {
    s = {
      sessionId: process.env.UMBRELLA_SESSION_ID?.trim() || randomUUID(),
      startedAt: new Date().toISOString(),
      heartbeats: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  s.lastSliceKey = sliceKey;
  await persist(s);
}

export async function resetSession(): Promise<void> {
  await fs.remove(SESSION_PATH).catch(() => {});
}
