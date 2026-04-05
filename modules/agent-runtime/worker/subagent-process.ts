import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { buildWorkerProcessEnv } from './worker-env.js';
import {
  approxTokens,
  assertAllowsNewLlmCall,
  recordApproxTokenUsage,
} from '../core/token-budget.js';
import type { LlmCallOptions } from '../core/llm.js';

function truthyEnv(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function workerTimeoutMs(): number {
  const raw = process.env.UMBRELLA_WORKER_TIMEOUT_MS?.trim();
  if (!raw) return 300_000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 300_000;
}

function workerCwd(): string {
  const d = process.env.UMBRELLA_WORKER_CWD?.trim();
  return d && d.length > 0 ? d : process.cwd();
}

async function readStream(ch: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of ch) {
    chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

type WorkerResultLine =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Run one subagent LLM call in a child process (or custom UMBRELLA_WORKER_WRAPPER).
 * Parent enforces token budget once and records usage for this call.
 */
export async function runSubagentLlmInChild(payload: {
  systemPrompt: string;
  userPrompt: string;
  options?: LlmCallOptions;
}): Promise<string> {
  await assertAllowsNewLlmCall();

  const tmpDir = path.join(os.tmpdir(), 'umbrella-workers');
  await fs.ensureDir(tmpDir);
  const jobPath = path.join(
    tmpDir,
    `job-${Date.now()}-${randomBytes(8).toString('hex')}.json`,
  );
  await fs.writeJson(jobPath, payload, { spaces: 0 });
  const env = buildWorkerProcessEnv(process.env);
  const cwd = workerCwd();
  const timeoutMs = workerTimeoutMs();
  const wrapper = process.env.UMBRELLA_WORKER_WRAPPER?.trim();

  try {
    const child = wrapper
      ? spawn(wrapper, [jobPath], {
          cwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(process.execPath, [path.join(__dirname, 'subagent-worker-cli.js'), jobPath], {
          cwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

    const stdoutP = readStream(child.stdout!);
    const stderrP = readStream(child.stderr!);

    const exitCode: number = await new Promise((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        reject(
          new Error(
            `UMBRELLA_WORKER_TIMEOUT: child exceeded ${timeoutMs}ms (UMBRELLA_WORKER_TIMEOUT_MS)`,
          ),
        );
      }, timeoutMs);
      child.on('error', (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(e);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(code ?? 1);
      });
    });

    const stdout = await stdoutP;
    const stderr = await stderrP;

    let parsed: WorkerResultLine | null = null;
    for (const line of stdout.split('\n').reverse()) {
      const t = line.trim();
      if (!t) continue;
      try {
        const j = JSON.parse(t) as WorkerResultLine;
        if (j && typeof j === 'object' && 'ok' in j) {
          parsed = j;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!parsed) {
      throw new Error(
        `Subagent worker: no result JSON on stdout. exit=${exitCode} stderr=${stderr.slice(0, 500)}`,
      );
    }

    if (!parsed.ok) {
      throw new Error(
        parsed.error || `Subagent worker failed (exit ${exitCode})`,
      );
    }

    if (exitCode !== 0) {
      throw new Error(
        `Subagent worker: exit ${exitCode} ${stderr ? `stderr=${stderr.slice(0, 400)}` : ''}`,
      );
    }

    const used =
      approxTokens(payload.systemPrompt) +
      approxTokens(payload.userPrompt) +
      approxTokens(parsed.text);

    void recordApproxTokenUsage(used, 'subagent_slice_worker');

    return parsed.text;
  } finally {
    void fs.remove(jobPath).catch(() => {});
  }
}

export function useSubagentOutOfProcess(): boolean {
  return truthyEnv(process.env.UMBRELLA_SUBAGENT_USE_PROCESS);
}
