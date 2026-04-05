import { ChaosSpecialist } from '../../orchestrate/specialists/chaos.js';
import { Toolset } from './tools.js';
import { memory } from './memory.js';
import { isLlmConfigured } from './llm.js';
import {
  chaosApprovalEnabled,
  createChaosNonce,
  waitForChaosApproval,
  writePendingApproval,
} from './chaos-approval.js';

const MAX_RETRIES = 3;

function isShellFailure(output: string): boolean {
  return output.startsWith('❌ Shell Error:');
}

function bareMessage(output: string): string {
  if (output.startsWith('❌ Shell Error:')) {
    return output.replace(/^❌ Shell Error:\s*/, '').trim();
  }
  return output;
}

export class ChaosMonitor {
  /**
   * Run a shell command; on failure, ask the Chaos Specialist for recovery steps, run them, retry (recursive).
   */
  static async runWithRecovery(command: string, retryCount = 0): Promise<string> {
    const out = await Toolset.shell(command);
    if (!isShellFailure(out)) {
      return out;
    }

    if (retryCount >= MAX_RETRIES) {
      const msg = `Chaos levels too high (${MAX_RETRIES} recovery rounds). Last output: ${out.slice(0, 1500)}`;
      await memory.ingest('chaos_event', msg);
      console.log(`☠️ ${msg}`);
      return `❌ ${msg}`;
    }

    const errorMessage = bareMessage(out);
    await memory.ingest(
      'chaos_event',
      JSON.stringify({
        phase: 'detected',
        retry: retryCount,
        command,
        error: errorMessage.slice(0, 2000),
      }),
    );
    console.log(`⚠️ Chaos detected for "${command}". Activating self-healing (attempt ${retryCount + 1}/${MAX_RETRIES})...`);

    if (!isLlmConfigured()) {
      console.log('☂️ No LLM — skipping Chaos Specialist recovery.');
      return out;
    }

    let recoveryPlan: { description: string; steps: string[] };
    try {
      recoveryPlan = await ChaosSpecialist.generateRecovery(command, errorMessage);
    } catch (e) {
      const er = e instanceof Error ? e.message : String(e);
      await memory.ingest('chaos_event', `recovery_plan_failed: ${er}`);
      console.log(`☂️ Chaos Specialist could not plan recovery: ${er}`);
      return out;
    }

    console.log(`🛠️ Recovery plan: ${recoveryPlan.description}`);
    await memory.ingest(
      'chaos_event',
      JSON.stringify({
        phase: 'plan',
        retry: retryCount,
        description: recoveryPlan.description,
        steps: recoveryPlan.steps,
      }),
    );

    if (chaosApprovalEnabled()) {
      const nonce = createChaosNonce();
      await writePendingApproval(nonce, {
        failedCommand: command,
        steps: recoveryPlan.steps,
        description: recoveryPlan.description,
      });
      const ok = await waitForChaosApproval(nonce);
      if (!ok) {
        await memory.ingest(
          'chaos_event',
          JSON.stringify({ phase: 'approval_denied', nonce }),
        );
        return out;
      }
    }

    for (const step of recoveryPlan.steps) {
      const stepOut = await Toolset.shell(step);
      await memory.ingest(
        'chaos_event',
        JSON.stringify({
          phase: 'recovery_step',
          cmd: step,
          resultPreview: stepOut.slice(0, 800),
        }),
      );
    }

    return this.runWithRecovery(command, retryCount + 1);
  }
}
