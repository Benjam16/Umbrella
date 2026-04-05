/**
 * Entry: node subagent-worker-cli.js <job.json>
 * Reads prompts + options, calls LLM (budget skipped — parent records usage).
 */
import fs from 'fs-extra';
import { callLLM } from '../core/llm.js';
import type { LlmCallOptions } from '../core/llm.js';

type Job = {
  systemPrompt: string;
  userPrompt: string;
  options?: LlmCallOptions;
};

async function main(): Promise<void> {
  const jobPath = process.argv[2];
  if (!jobPath) {
    process.stderr.write('subagent-worker-cli: missing job file path\n');
    process.exit(2);
  }
  const job = (await fs.readJson(jobPath)) as Job;
  if (typeof job.systemPrompt !== 'string' || typeof job.userPrompt !== 'string') {
    process.stderr.write('subagent-worker-cli: invalid job JSON\n');
    process.exit(2);
  }
  try {
    const text = await callLLM(job.systemPrompt, job.userPrompt, job.options);
    process.stdout.write(
      JSON.stringify({ ok: true as const, text }) + '\n',
      'utf8',
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(
      JSON.stringify({ ok: false as const, error: message }) + '\n',
      'utf8',
    );
    process.exit(1);
  }
}

void main().catch((e: unknown) => {
  process.stderr.write(
    `subagent-worker-cli: ${e instanceof Error ? e.message : String(e)}\n`,
  );
  process.exit(2);
});
