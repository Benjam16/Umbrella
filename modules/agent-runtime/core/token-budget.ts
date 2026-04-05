import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const USAGE_PATH = path.join(os.homedir(), '.umbrella', 'token-usage.json');

export function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export type TokenUsageFile = {
  date: string;
  totalApproxTokens: number;
  byRole: Record<string, number>;
};

async function loadUsage(): Promise<TokenUsageFile> {
  if (!(await fs.pathExists(USAGE_PATH))) {
    return { date: todayUtc(), totalApproxTokens: 0, byRole: {} };
  }
  try {
    const j = (await fs.readJson(USAGE_PATH)) as TokenUsageFile;
    if (j.date !== todayUtc()) {
      return { date: todayUtc(), totalApproxTokens: 0, byRole: {} };
    }
    return j;
  } catch {
    return { date: todayUtc(), totalApproxTokens: 0, byRole: {} };
  }
}

/** Child LLM worker: parent asserts budget and records usage; worker skips both. */
export function isInternalLlmWorker(): boolean {
  return process.env.UMBRELLA_INTERNAL_WORKER === '1';
}

/** Soft cap in approximate tokens per UTC day. Unset = disabled. */
export function dailyBudgetLimit(): number | null {
  const raw = process.env.UMBRELLA_TOKEN_BUDGET_DAILY?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Throws if the rolling daily total is already at or over the limit. */
export async function assertAllowsNewLlmCall(): Promise<void> {
  if (isInternalLlmWorker()) return;
  const limit = dailyBudgetLimit();
  if (!limit) return;
  const u = await loadUsage();
  if (u.totalApproxTokens >= limit) {
    throw new Error(
      `UMBRELLA_TOKEN_BUDGET_EXCEEDED: approx ${u.totalApproxTokens} / ${limit} tokens used today (UTC). Raise UMBRELLA_TOKEN_BUDGET_DAILY or wait until tomorrow.`,
    );
  }
}

export async function recordApproxTokenUsage(
  deltaApprox: number,
  role: string,
): Promise<void> {
  if (isInternalLlmWorker()) return;
  if (deltaApprox <= 0) return;
  await fs.ensureDir(path.dirname(USAGE_PATH));
  let u = await loadUsage();
  if (u.date !== todayUtc()) {
    u = { date: todayUtc(), totalApproxTokens: 0, byRole: {} };
  }
  u.totalApproxTokens += deltaApprox;
  u.byRole[role] = (u.byRole[role] ?? 0) + deltaApprox;
  await fs.writeJson(USAGE_PATH, u, { spaces: 2 });

  const limit = dailyBudgetLimit();
  if (limit && u.totalApproxTokens > limit) {
    console.warn(
      `☂️ Token budget exceeded after this call (${u.totalApproxTokens} > ${limit}). Further LLM calls will fail until rollover.`,
    );
  }
}

export async function readTokenUsage(): Promise<TokenUsageFile> {
  return loadUsage();
}
