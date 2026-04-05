import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * GSD-style context budget hint for planner prompts (orchestrator stays "thin").
 */
const CONTEXT_PATH = path.join(os.homedir(), '.umbrella', 'orchestrator-context.json');

export type OrchestratorHints = {
  maxTaskTokensEstimate: number;
  maxTasksPerSlice: number;
  maxSlicesPerMilestone: number;
};

const DEFAULTS: OrchestratorHints = {
  maxTaskTokensEstimate: Number(process.env.UMBRELLA_MAX_TASK_TOKENS || '400'),
  maxTasksPerSlice: Number(process.env.UMBRELLA_MAX_TASKS_PER_SLICE || '3'),
  maxSlicesPerMilestone: Number(process.env.UMBRELLA_MAX_SLICES_PER_MILESTONE || '4'),
};

export async function loadOrchestratorHints(): Promise<OrchestratorHints> {
  if (!(await fs.pathExists(CONTEXT_PATH))) return DEFAULTS;
  try {
    const j = (await fs.readJson(CONTEXT_PATH)) as Partial<OrchestratorHints>;
    return { ...DEFAULTS, ...j };
  } catch {
    return DEFAULTS;
  }
}

export function orchestratorPreamble(h: OrchestratorHints): string {
  return (
    `Orchestrator budget (GSD-inspired): keep orchestration instructions lean; ` +
    `each <task> under ~${h.maxTaskTokensEstimate} tokens of text; ` +
    `at most ${h.maxTasksPerSlice} tasks per <slice>; ` +
    `at most ${h.maxSlicesPerMilestone} slices per <milestone>.`
  );
}
