import { memory } from './memory.js';
import { Toolset } from './tools.js';
import { callLLM, isLlmConfigured } from './llm.js';
import { ChaosMonitor } from './chaos-monitor.js';
import { expandSliceWithSubagent } from './subagent.js';
import { checkpointSlice } from './session-control.js';
import {
  invokeMcp,
  isMcpRuntimeEnabled,
  parseMcpAction,
} from '../mcp/client-manager.js';
import {
  executeScaffoldCliFromAgent,
  parseScaffoldCliJson,
} from './shipping-scaffold.js';
import {
  extractGoal,
  extractSlices,
  parseTasksFromXml,
  type ParsedTask,
} from './plan-xml-parse.js';

export type { ParsedTask };

export class UmbrellaExecutor {
  async run(planXml: string): Promise<void> {
    console.log('☂️ Executor starting (orchestrator → slices → tasks)…');
    const goal = extractGoal(planXml);
    const slices = extractSlices(planXml);
    const useSub =
      (process.env.UMBRELLA_SUBAGENT_PER_SLICE === '1' ||
        process.env.UMBRELLA_SUBAGENT_PER_SLICE === 'true') &&
      isLlmConfigured();

    for (const slice of slices) {
      await checkpointSlice(`${slice.milestoneName}/${slice.sliceLabel}`);
      console.log(
        `☂️ Slice ${slice.milestoneName} / ${slice.sliceLabel} (${useSub ? 'subagent' : 'xml'})`,
      );

      let tasks: ParsedTask[];
      if (useSub) {
        try {
          const actions = await expandSliceWithSubagent({
            sliceXml: slice.body,
            goal,
            milestoneName: slice.milestoneName,
            sliceLabel: slice.sliceLabel,
          });
          tasks = actions.map((action, i) => ({
            name: `subagent step ${i + 1}`,
            action,
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`☂️ Subagent expansion failed (${msg}), using XML tasks.`);
          tasks = parseTasksFromXml(slice.body);
        }
      } else {
        tasks = parseTasksFromXml(slice.body);
      }

      for (const t of tasks) {
        await this.runOneTask(t.name, t.action);
      }
    }

    console.log('☂️ Executor finished plan');
  }

  private async runOneTask(name: string, action: string): Promise<void> {
    console.log(`☂️ Executing task: ${name}`);

    let result = '';

    if (action.startsWith('/umb:')) {
      result = `✅ ${action} completed (simulated — run inside your AI IDE for real execution)`;
      await memory.ingest('execution_result', result);
      console.log('☂️ Task completed');
      return;
    }

    const mcpPayload = parseMcpAction(action);
    if (mcpPayload) {
      result = isMcpRuntimeEnabled()
        ? await invokeMcp(mcpPayload)
        : '❌ MCP action ignored (set UMBRELLA_MCP_ENABLED=1 and UMBRELLA_MCP_SERVERS).';
    } else if (action.startsWith('scaffold-cli:')) {
      const body = action.slice('scaffold-cli:'.length).trim();
      const payload = parseScaffoldCliJson(body);
      if (!payload) {
        result =
          '❌ scaffold-cli: invalid JSON or missing packageName/subdir. Example: scaffold-cli:{"packageName":"@scope/x","subdir":"x"}';
      } else {
        result = await executeScaffoldCliFromAgent(payload);
      }
    } else if (action.startsWith('shell:')) {
      result = await ChaosMonitor.runWithRecovery(action.replace(/^shell:\s*/, ''));
    } else if (action.startsWith('read:')) {
      result = await Toolset.read_file(action.replace(/^read:\s*/, ''));
    } else if (action.startsWith('write:')) {
      const rest = action.replace(/^write:\s*/, '');
      const pipeIdx = rest.indexOf('|');
      const filePath =
        pipeIdx === -1 ? rest.trim() : rest.slice(0, pipeIdx).trim();
      const body = pipeIdx === -1 ? '' : rest.slice(pipeIdx + 1);
      result = await Toolset.write_file(filePath, body);
    } else if (action.startsWith('git_status') || action === 'git status') {
      result = await Toolset.git_status();
    } else if (
      action.startsWith('git ') ||
      action.startsWith('npm ') ||
      action.startsWith('node ')
    ) {
      result = await ChaosMonitor.runWithRecovery(action);
    } else {
      result = await this.llmExecute(action);
    }

    await memory.ingest(
      'execution_result',
      `Task: ${name}\nResult: ${result}`,
    );
    console.log('☂️ Task completed');
  }

  private async llmExecute(task: string): Promise<string> {
    if (!isLlmConfigured()) {
      return `LLM routing skipped (no LLM API key). Task was: ${task}`;
    }
    try {
      const system = `You are the Umbrella Executor. Prefer tool prefixes:
shell:<cmd>, read:<path>, write:<path>|<content>
scaffold-cli:{"packageName":"@scope/pkg","subdir":"folder"} — only if UMBRELLA_SHIPPING_ROOT is set; creates npm CLI template under that root (optional "bin").
If MCP is enabled, use one line JSON: mcp:{"server":0,"name":"tool_name","arguments":{}}
Output ONE line only — the exact tool prefix, mcp: JSON, or a git/npm shell command.`;
      const command = (
        await callLLM(system, task, {
          memoryRows: 2,
          callRole: 'executor_router',
        })
      )
        .split('\n')[0]
        .trim();

      const mcpFromLlm = parseMcpAction(command);
      if (mcpFromLlm && isMcpRuntimeEnabled()) {
        return await invokeMcp(mcpFromLlm);
      }
      if (command.startsWith('shell:')) {
        return await ChaosMonitor.runWithRecovery(command.replace(/^shell:\s*/, ''));
      }
      if (command.startsWith('read:')) {
        return await Toolset.read_file(command.replace(/^read:\s*/, ''));
      }
      if (command.startsWith('write:')) {
        const rest = command.replace(/^write:\s*/, '');
        const pipeIdx = rest.indexOf('|');
        const filePath =
          pipeIdx === -1 ? rest.trim() : rest.slice(0, pipeIdx).trim();
        const body =
          pipeIdx === -1 ? '' : rest.slice(pipeIdx + 1);
        return await Toolset.write_file(filePath, body);
      }
      if (command.startsWith('scaffold-cli:')) {
        const body = command.slice('scaffold-cli:'.length).trim();
        const payload = parseScaffoldCliJson(body);
        if (!payload) {
          return '❌ scaffold-cli: invalid JSON or missing packageName/subdir.';
        }
        return await executeScaffoldCliFromAgent(payload);
      }
      if (/^git\s|^npm\s|^node\s/.test(command)) {
        return await ChaosMonitor.runWithRecovery(command);
      }
      return `LLM suggested (unhandled): ${command}`;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      await memory.ingest('error', message);
      return `❌ llmExecute error: ${message}`;
    }
  }
}

export const executor = new UmbrellaExecutor();
