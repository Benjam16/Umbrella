import fs from 'fs-extra';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';

export const AGENT_PID_PATH = path.join(os.homedir(), '.umbrella', 'agent.pid');

export async function readDaemonPid(): Promise<number | null> {
  if (!(await fs.pathExists(AGENT_PID_PATH))) return null;
  const raw = (await fs.readFile(AGENT_PID_PATH, 'utf8')).trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Returns whether PID is alive in this OS session (Unix: signal 0; best-effort on Windows). */
export function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function ensureNoOtherDaemon(): Promise<void> {
  await fs.ensureDir(path.dirname(AGENT_PID_PATH));
  const existing = await readDaemonPid();
  if (existing !== null && isPidRunning(existing)) {
    throw new Error(
      `Umbrella agent already running (pid ${existing}). Run: umbrella agent stop`,
    );
  }
  if (existing !== null && !isPidRunning(existing)) {
    await removeDaemonPidFile();
  }
}

export async function writeDaemonPidFile(pid: number): Promise<void> {
  await fs.writeFile(AGENT_PID_PATH, `${pid}\n`, 'utf8');
}

export async function removeDaemonPidFile(): Promise<void> {
  try {
    await fs.remove(AGENT_PID_PATH);
  } catch {
    /* ignore */
  }
}

export function syncRemoveDaemonPidFile(): void {
  try {
    if (existsSync(AGENT_PID_PATH)) unlinkSync(AGENT_PID_PATH);
  } catch {
    /* ignore */
  }
}
