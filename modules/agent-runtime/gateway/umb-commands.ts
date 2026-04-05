import { memory } from '../core/memory.js';
import {
  clearForegroundGoal,
  getAgentGoalSnapshot,
  setBackgroundPaused,
  setCoreGoal,
  setForegroundGoal,
} from '../core/agent-state.js';
import { readLastRun } from '../core/run-log.js';

/** Shared Telegram `/umb` and Discord `!umb` command body (prefix already stripped). */
export async function handleUmbrellaChatCommand(rest: string): Promise<string> {
  const low = rest.toLowerCase();

  if (!rest || low === 'help') {
    return [
      'Commands:',
      '• core <text> — long-term background goal',
      '• task <text> / goal <text> — foreground until done or verify',
      '• done — clear foreground',
      '• pause / resume — background core on/off',
      '• brief — last heartbeat + goals',
      '• ingest <text> / recall <query> — memory',
      '• status — ping',
    ].join('\n');
  }

  if (low === 'status') {
    return '☂️ Umbrella agent is running.';
  }

  if (low.startsWith('ingest ')) {
    const content = rest.slice('ingest '.length).trim();
    if (!content) return 'Usage: ingest <text>';
    const id = await memory.ingest('user_message', content);
    return `✅ Memory ingested #${id}`;
  }

  if (low.startsWith('recall ')) {
    const query = rest.slice('recall '.length).trim();
    if (!query) return 'Usage: recall <query>';
    const results = await memory.recall(query, 8);
    if (!results.length) return 'No memories matched.';
    return `Recall:\n${results.map((r) => `- ${r.content}`).join('\n')}`;
  }

  if (low.startsWith('core ')) {
    const g = rest.slice('core '.length).trim();
    if (!g) return 'Usage: core <long-term goal>';
    await setCoreGoal(g);
    return `✅ Core goal set (${g.slice(0, 120)}${g.length > 120 ? '…' : ''})`;
  }

  if (low.startsWith('task ') || low.startsWith('goal ')) {
    const g = rest.replace(/^(task|goal)\s+/i, '').trim();
    if (!g) return 'Usage: task <foreground task>';
    await setForegroundGoal(g);
    await memory.ingest('foreground_queued', g);
    return '✅ Foreground task set — next heartbeat prioritizes it over core goal.';
  }

  if (low === 'done' || low === 'clear') {
    await clearForegroundGoal();
    return '✅ Foreground task cleared — resuming core / default loop.';
  }

  if (low === 'pause') {
    await setBackgroundPaused(true);
    return '⏸ Background paused (core goal idle). Foreground tasks & escalation still run.';
  }

  if (low === 'resume' || low === 'unpause') {
    await setBackgroundPaused(false);
    return '▶ Background resumed.';
  }

  if (low === 'brief') {
    return await formatUmbrellaBrief();
  }

  return `Unknown command. Try help. Got: ${rest || '(empty)'}`;
}

export async function formatUmbrellaBrief(): Promise<string> {
  const last = await readLastRun();
  const snap = await getAgentGoalSnapshot();
  const lines = [
    '☂️ Brief',
    '',
    snap.coreGoal ? `Core: ${snap.coreGoal}` : 'Core: (not set)',
    snap.foregroundGoal
      ? `Foreground: ${snap.foregroundGoal}`
      : 'Foreground: (none)',
    `Background: ${snap.backgroundPaused ? 'PAUSED' : 'active'}`,
    '',
    last
      ? [
          'Last heartbeat:',
          `  source: ${last.goalSource ?? '—'}`,
          `  goal: ${last.goal.slice(0, 400)}${last.goal.length > 400 ? '…' : ''}`,
          `  verify: ${String(last.verifyOk)}`,
          `  skipped: ${String(last.skipped ?? false)}`,
          `  at: ${last.t}`,
        ].join('\n')
      : 'Last heartbeat: (none yet)',
  ];
  return lines.join('\n').slice(0, 3900);
}
