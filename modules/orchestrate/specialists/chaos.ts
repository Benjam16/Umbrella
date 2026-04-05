import { callLLM, isLlmConfigured } from '../../agent-runtime/core/llm.js';
import {
  fetchBrowserHint,
  fetchUrlTextPreview,
} from '../../agent-runtime/core/browser-hint.js';
import { errorLooksLikePaymentWall, tryX402Payment } from '../../agent-runtime/core/x402.js';

export type RecoveryPlan = {
  description: string;
  steps: string[];
};

function extractJsonObject(text: string): RecoveryPlan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('No JSON object in LLM response');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    description?: string;
    steps?: unknown;
  };
  const description =
    typeof parsed.description === 'string' ? parsed.description : 'Recovery (no description)';
  const steps = Array.isArray(parsed.steps)
    ? parsed.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  if (steps.length === 0) {
    throw new Error('Recovery plan had no steps');
  }
  return { description, steps };
}

export const ChaosSpecialist = {
  generateRecovery: async (
    failedCommand: string,
    errorMessage: string,
  ): Promise<RecoveryPlan> => {
    if (!isLlmConfigured()) {
      throw new Error('Chaos Specialist needs an LLM API key');
    }

    let payNote = '';
    if (errorLooksLikePaymentWall(errorMessage)) {
      payNote = (await tryX402Payment(`${failedCommand}\n${errorMessage}`)) ?? '';
    }

    const searchQuery = `${failedCommand} ${errorMessage}`.slice(0, 240);
    const browserHint = (await fetchBrowserHint(searchQuery)) ?? '';

    const urlInError = `${failedCommand} ${errorMessage}`.match(
      /https?:\/\/[^\s\)\]"'<>]+/,
    );
    let pageExcerpt = '';
    if (urlInError?.[0]) {
      const page = await fetchUrlTextPreview(urlInError[0]);
      if (page) pageExcerpt = `PAGE EXCERPT (${urlInError[0]}):\n${page}\n`;
    }

    const prompt = `COMMAND FAILED: ${failedCommand}
ERROR MESSAGE (stderr/out summary): ${errorMessage}
${payNote ? `PAYMENT / QUOTA NOTE: ${payNote}\n` : ''}${browserHint ? `WEB HINT (verify; may be irrelevant):\n${browserHint}\n` : ''}${pageExcerpt}

TASK:
1. Diagnose the root cause (port in use, missing binary/package, permissions, path, etc.).
2. Propose shell commands to fix it on the SAME machine (no interactive prompts). Prefer package managers appropriate to the OS if inferable from the error; otherwise suggest generic fixes.
3. Do NOT suggest destructive commands (no rm -rf /, fork bombs). Avoid blindly adding sudo unless the error clearly requires elevated permissions.
4. Return ONLY valid JSON on a single object (no markdown outside the JSON): {"description":"short summary","steps":["cmd1","cmd2"]}`;

    const response = await callLLM(
      'You are a systems resilience engineer. Output strict JSON only for the user task, no prose.',
      prompt,
      { memoryRows: 0, callRole: 'chaos_specialist' },
    );
    return extractJsonObject(response);
  },
};
