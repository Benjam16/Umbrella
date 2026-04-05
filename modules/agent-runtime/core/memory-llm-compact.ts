import { memory } from './memory.js';
import { callLLM, isLlmConfigured } from './llm.js';

/**
 * Periodic LLM summary of recent memories (bounded). Ingests type `memory_llm_compact`.
 * Enable: UMBRELLA_MEMORY_LLM_COMPACT=1, optional UMBRELLA_MEMORY_LLM_COMPACT_EVERY (default 12 heartbeats).
 */
export async function maybeMemoryLlmCompact(heartbeatCount: number): Promise<void> {
  const on =
    process.env.UMBRELLA_MEMORY_LLM_COMPACT === '1' ||
    process.env.UMBRELLA_MEMORY_LLM_COMPACT === 'true';
  if (!on || !isLlmConfigured()) return;

  const every = parseInt(
    process.env.UMBRELLA_MEMORY_LLM_COMPACT_EVERY?.trim() || '12',
    10,
  );
  if (!Number.isFinite(every) || every < 1) return;
  if (heartbeatCount === 0 || heartbeatCount % every !== 0) return;

  const rows = await memory.recall('', 40);
  if (rows.length < 8) return;

  const body = rows
    .map((r) => `${r.type}: ${r.content}`)
    .join('\n')
    .slice(0, 12_000);

  const summary = await callLLM(
    'You compress Umbrella memory lines into a concise bullet summary (max 900 characters). No preamble or markdown fences.',
    body,
    { memoryRows: 0, callRole: 'memory_llm_compact' },
  );

  await memory.ingest('memory_llm_compact', summary.slice(0, 2000));
}
