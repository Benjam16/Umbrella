import { memory } from './memory.js';
import { callLLM, isLlmConfigured } from './llm.js';
import { loadOrchestratorHints, orchestratorPreamble } from './orchestrator-context.js';
import { getUnifiedToolPlannerHints } from './tool-registry.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function writePlanFile(xml: string): Promise<void> {
  const planPath = path.join(os.homedir(), '.umbrella', 'current-plan.xml');
  await fs.ensureDir(path.dirname(planPath));
  await fs.writeFile(planPath, xml, 'utf8');
}

async function fallbackPlan(goal: string): Promise<string> {
  const rows = await memory.recall(goal, 3);
  const contextSummary = rows.map((r) => r.content).join('\n');
  const g = escapeXml(goal);
  const c = escapeXml(contextSummary);
  const plan = `<plan>
<goal>${g}</goal>
<context>${c}</context>
<milestones>
<milestone id="1" name="Scope">
<slice id="1">
<task>
<id>1</id>
<name>Research and scope</name>
<action>/umb:memory-recall ${g}</action>
<verify>Check if context is sufficient.</verify>
</task>
</slice>
</milestone>
<milestone id="2" name="Execute">
<slice id="1">
<task>
<id>2</id>
<name>Execute lean change</name>
<action>/umb:lean-execute ${g}</action>
<verify>Diff applied cleanly + tests pass</verify>
</task>
</slice>
</milestone>
</milestones>
<done>Mark as complete in memory</done>
</plan>`;
  await writePlanFile(plan);
  console.log('☂️ Planner created fallback XML plan');
  return plan;
}

export class UmbrellaPlanner {
  async createPlan(goal: string): Promise<string> {
    if (!isLlmConfigured()) {
      console.log(
        '☂️ Planner: no LLM API key (Anthropic / OpenAI / Google) — using fallback XML plan',
      );
      return fallbackPlan(goal);
    }

    const hints = await loadOrchestratorHints();
    const budget = orchestratorPreamble(hints);
    const toolSurface = getUnifiedToolPlannerHints();

    const systemPrompt = `You are Umbrella's Orchestrator Planner (GSD-inspired).
${budget}
Tool surface (built-in + MCP; prefer these over inventing new verbs):
${toolSurface}
Rules:
- Structure work as milestones → slices → tasks (each slice is one focused context window of work).
- Never output full source files — only unified diffs, /umb: commands, or tool prefixes: shell:, read:, write:path|content, scaffold-cli:{"packageName":"@scope/pkg","subdir":"folder"} (npm CLI template under UMBRELLA_SHIPPING_ROOT when shipping new tools).
- Each task must be atomic and verifiable via its <verify> line.
- Prefer parallel-safe ordering; later tasks may depend on earlier verify passing.
- Output ONLY valid XML with root <plan>. No markdown fences, no prose outside XML.`;

    const userPrompt = `Goal: ${goal}
Return XML in this shape (you may add milestones/slices as needed, keep tasks inside <slice>):
<plan>
<goal>...</goal>
<context>...</context>
<milestones>
<milestone id="1" name="...">
<slice id="1">
<task><id/><name/><action/><verify/></task>
</slice>
</milestone>
</milestones>
<done>...</done>
</plan>

If the goal is trivial, a single milestone with one slice and 1–2 tasks is enough.`;

    console.log('☂️ Planner calling LLM (orchestrator mode)…');
    const rawPlan = await callLLM(systemPrompt, userPrompt, {
      memoryRows: 3,
      callRole: 'orchestrator_planner',
    });
    await writePlanFile(rawPlan);
    console.log('☂️ Planner saved LLM plan');
    return rawPlan;
  }
}

export const planner = new UmbrellaPlanner();
