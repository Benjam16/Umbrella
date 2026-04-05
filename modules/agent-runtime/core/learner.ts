import { memory } from './memory.js';

/**
 * Hook for promoting verified successes into structured skills (expand later).
 */
export async function learnFromVerification(
  passed: boolean,
  summary: string,
): Promise<void> {
  if (!passed) return;
  await memory.ingest('skill_candidate', summary);
}
