import { spawnSync } from 'child_process';
import fs from 'fs-extra';

/**
 * Runs `UMBRELLA_SECRETS_HELPER` (executable on PATH or absolute path).
 * Expects stdout to be a JSON object of string env values; merges into
 * `process.env` only for keys that are unset or empty (same rule as dotenv).
 */
export function applySecretsFromHelper(): {
  applied: number;
  helperPath?: string;
  error?: string;
} {
  const cmd = process.env.UMBRELLA_SECRETS_HELPER?.trim();
  if (!cmd) return { applied: 0 };

  const r = spawnSync(cmd, {
    encoding: 'utf8',
    timeout: 30_000,
    env: process.env,
    shell: false,
  });

  if (r.error) {
    return {
      applied: 0,
      helperPath: cmd,
      error: r.error.message,
    };
  }
  if (r.status !== 0) {
    return {
      applied: 0,
      helperPath: cmd,
      error: (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 500),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout?.trim() || '{}');
  } catch {
    return {
      applied: 0,
      helperPath: cmd,
      error: 'stdout is not valid JSON',
    };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      applied: 0,
      helperPath: cmd,
      error: 'JSON root must be an object',
    };
  }

  let applied = 0;
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') continue;
    const cur = process.env[k];
    if (cur !== undefined && cur !== '') continue;
    process.env[k] = v;
    applied += 1;
  }
  return { applied, helperPath: cmd };
}
