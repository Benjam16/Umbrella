import { memory } from './memory.js';
import { getAgentGoalSnapshot } from './agent-state.js';

export type GoalPickResult = {
  goal: string;
  source:
    | 'scheduled'
    | 'escalation'
    | 'foreground'
    | 'pending_memory'
    | 'core'
    | 'default'
    | 'paused_idle';
  skipPlannerExecutor: boolean;
};

const DEFAULT_GOAL = 'Check for new tasks or improvements';
const PAUSED_STANDBY =
  'Background paused — standing by (no planner/executor this cycle).';

/**
 * Choose what the next heartbeat should run: foreground interrupts core;
 * when background is paused, only foreground / escalation / (optional) scheduled run.
 */
export async function pickHeartbeatGoal(input: {
  scheduled: string | null;
  escalation: string | null;
}): Promise<GoalPickResult> {
  const snap = await getAgentGoalSnapshot();

  let scheduled = input.scheduled;
  if (
    scheduled &&
    snap.backgroundPaused &&
    !snap.foregroundGoal &&
    !input.escalation
  ) {
    scheduled = null;
  }

  if (scheduled) {
    return {
      goal: scheduled,
      source: 'scheduled',
      skipPlannerExecutor: false,
    };
  }

  if (input.escalation) {
    return {
      goal: input.escalation,
      source: 'escalation',
      skipPlannerExecutor: false,
    };
  }

  if (snap.foregroundGoal) {
    return {
      goal: snap.foregroundGoal,
      source: 'foreground',
      skipPlannerExecutor: false,
    };
  }

  const pending = await memory.recall('pending goal', 1);
  const pendingText = pending[0]?.content?.trim();
  if (pendingText) {
    return {
      goal: pendingText,
      source: 'pending_memory',
      skipPlannerExecutor: false,
    };
  }

  if (snap.backgroundPaused) {
    return {
      goal: PAUSED_STANDBY,
      source: 'paused_idle',
      skipPlannerExecutor: true,
    };
  }

  if (snap.coreGoal) {
    return {
      goal: snap.coreGoal,
      source: 'core',
      skipPlannerExecutor: false,
    };
  }

  return {
    goal: DEFAULT_GOAL,
    source: 'default',
    skipPlannerExecutor: false,
  };
}
