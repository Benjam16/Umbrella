import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { memory } from './memory.js';

const STATE_PATH = path.join(os.homedir(), '.umbrella', 'stuck-state.json');
const THRESHOLD = Number(process.env.UMBRELLA_STUCK_THRESHOLD || '3');

type StuckState = {
  consecutiveFailures: number;
  lastFingerprint: string;
  lastUpdated: string;
};

function fingerprint(summary: string): string {
  const s = summary.slice(0, 400).toLowerCase().replace(/\s+/g, ' ').trim();
  return s;
}

async function readState(): Promise<StuckState> {
  if (!(await fs.pathExists(STATE_PATH))) {
    return { consecutiveFailures: 0, lastFingerprint: '', lastUpdated: '' };
  }
  try {
    return (await fs.readJson(STATE_PATH)) as StuckState;
  } catch {
    return { consecutiveFailures: 0, lastFingerprint: '', lastUpdated: '' };
  }
}

async function writeState(s: StuckState): Promise<void> {
  await fs.ensureDir(path.dirname(STATE_PATH));
  await fs.writeJson(STATE_PATH, s, { spaces: 2 });
}

export class StuckDetector {
  /** After verifier runs: update streak; return escalation hint for next planner goal if stuck. */
  async onVerification(ok: boolean, executionSummary: string): Promise<string | null> {
    const state = await readState();
    if (ok) {
      state.consecutiveFailures = 0;
      state.lastFingerprint = '';
      state.lastUpdated = new Date().toISOString();
      await writeState(state);
      return null;
    }

    const fp = fingerprint(executionSummary);
    if (fp === state.lastFingerprint) state.consecutiveFailures += 1;
    else {
      state.consecutiveFailures = 1;
      state.lastFingerprint = fp;
    }
    state.lastUpdated = new Date().toISOString();
    await writeState(state);

    if (state.consecutiveFailures >= THRESHOLD) {
      const msg = `Stuck loop: ${state.consecutiveFailures} similar failures in a row. Change approach or fix root cause before retrying.`;
      await memory.ingest('stuck_escalation', msg);
      console.log(`☂️ StuckDetector: escalation after ${state.consecutiveFailures} failures`);
      return (
        'ESCALATE: Previous automated attempts failed repeatedly. ' +
        'Produce a minimal diagnostic plan: read logs, run a single shell: diagnostic, ' +
        'or /umb:memory-recall with a new query. One milestone only; no repeated failed commands.'
      );
    }
    return null;
  }
}

export const stuckDetector = new StuckDetector();
