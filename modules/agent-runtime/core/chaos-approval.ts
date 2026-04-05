import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';

function homedir(): string {
  return os.homedir();
}

export function pendingChaosDir(): string {
  return path.join(homedir(), '.umbrella', 'chaos-pending');
}

export function approvedChaosDir(): string {
  return path.join(homedir(), '.umbrella', 'chaos-approved');
}

export function chaosApprovalEnabled(): boolean {
  return (
    process.env.UMBRELLA_CHAOS_APPROVE === '1' ||
    process.env.UMBRELLA_CHAOS_APPROVE === 'true'
  );
}

export async function writePendingApproval(
  nonce: string,
  payload: { failedCommand: string; steps: string[]; description: string },
): Promise<void> {
  const dir = pendingChaosDir();
  await fs.ensureDir(dir);
  await fs.writeJson(
    path.join(dir, `${nonce}.json`),
    { ...payload, nonce, createdAt: new Date().toISOString() },
    { spaces: 2 },
  );
}

/** Create approval marker (used by dashboard POST or manual touch). */
export async function markChaosApproved(nonce: string): Promise<void> {
  const dir = approvedChaosDir();
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, nonce), `${new Date().toISOString()}\n`, 'utf8');
}

export async function waitForChaosApproval(
  nonce: string,
): Promise<boolean> {
  if (!chaosApprovalEnabled()) return true;

  const dir = approvedChaosDir();
  await fs.ensureDir(dir);
  const stamp = path.join(dir, nonce);
  const timeoutMs = Number(process.env.UMBRELLA_CHAOS_APPROVE_TIMEOUT_MS || '120000');
  const dash = process.env.UMBRELLA_DASHBOARD_PORT
    ? `http://127.0.0.1:${process.env.UMBRELLA_DASHBOARD_PORT}`
    : '(set UMBRELLA_DASHBOARD_PORT for HTTP approve)';

  console.log(
    `☂️ CHAOS APPROVAL REQUIRED (nonce=${nonce})\n` +
      `  HTTP: POST ${dash}/api/chaos-approve  body: {"nonce":"${nonce}"}\n` +
      `  Or:   mkdir -p ~/.umbrella/chaos-approved && touch ~/.umbrella/chaos-approved/${nonce}`,
  );

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fs.pathExists(stamp)) {
      await fs.remove(stamp).catch(() => {});
      return true;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log('☂️ Chaos approval timed out — skipping recovery shell steps.');
  return false;
}

export function createChaosNonce(): string {
  return randomUUID();
}
