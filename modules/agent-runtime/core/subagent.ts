import { callLLM, isLlmConfigured } from './llm.js';
import { checkpointSlice } from './session-control.js';
import {
  runSubagentLlmInChild,
  useSubagentOutOfProcess,
} from '../worker/subagent-process.js';

function extractJsonStringArray(text: string): string[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) {
    throw new Error('Subagent: no JSON array in response');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Subagent: JSON root is not an array');
  }
  return parsed
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Fresh-context “subagent” for one slice: no global memory in the LLM call (see llm options).
 * Refines a slice’s XML into an ordered list of executable action lines.
 */
export async function expandSliceWithSubagent(params: {
  sliceXml: string;
  goal: string;
  milestoneName: string;
  sliceLabel: string;
}): Promise<string[]> {
  if (!isLlmConfigured()) {
    throw new Error('Subagent requires an LLM API key');
  }

  const sliceCap = Number(process.env.UMBRELLA_SUBAGENT_SLICE_CHARS || '14000');
  const body = params.sliceXml.slice(0, sliceCap);

  const system = `You are Umbrella SUBAGENT #${params.sliceLabel} — disposable context window.
Rules:
- You receive ONE slice from the orchestrator; expand it into concrete, ordered actions.
- Each action is ONE line: shell:..., read:..., write:path|body, scaffold-cli:{"packageName":"@scope/pkg","subdir":"folder"}, /umb:..., or a raw git/npm/node line.
- No prose. Output ONLY a JSON array of strings. Max 20 strings.
- Respect verify steps conceptually (your actions should make verification possible).`;

  const user = `Parent goal: ${params.goal}
Milestone: ${params.milestoneName}
Slice id: ${params.sliceLabel}

Slice XML (tasks inside):
${body}

Return JSON string array only, e.g. ["shell:pwd","read:package.json"]`;

  await checkpointSlice(`${params.milestoneName}/${params.sliceLabel}`);
  const llmOptions = {
    memoryRows: 0 as const,
    callRole: 'subagent_slice' as const,
  };
  const raw = useSubagentOutOfProcess()
    ? await runSubagentLlmInChild({
        systemPrompt: system,
        userPrompt: user,
        options: llmOptions,
      })
    : await callLLM(system, user, llmOptions);
  return extractJsonStringArray(raw);
}
