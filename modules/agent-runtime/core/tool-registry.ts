import { listMcpToolDescriptors } from '../mcp/client-manager.js';

const BUILTIN = [
  'shell:<cmd>',
  'read:<path>',
  'write:<path>|<content>',
  'git status / git … / npm … / node …',
  'scaffold-cli:{"packageName":"@scope/pkg","subdir":"folder"} (UMBRELLA_SHIPPING_ROOT)',
  '/umb:… (IDE routing; simulated in executor)',
  'mcp:{"server":N,"name":"tool","arguments":{}}',
] as const;

function plannerHintsMaxChars(): number {
  const raw = process.env.UMBRELLA_PLANNER_TOOL_HINTS_MAX_CHARS?.trim();
  const n = raw ? parseInt(raw, 10) : 1400;
  return Number.isFinite(n) && n > 200 ? n : 1400;
}

export type UnifiedToolsResponse = {
  builtin: readonly string[];
  mcp: Array<{ server: number; name: string }>;
};

export function getUnifiedToolsPayload(): UnifiedToolsResponse {
  return { builtin: BUILTIN, mcp: listMcpToolDescriptors() };
}

/**
 * Short block for the orchestrator system prompt (built-ins + MCP names by index).
 */
export function getUnifiedToolPlannerHints(): string {
  const max = plannerHintsMaxChars();
  const lines: string[] = [
    'Built-in tool prefixes:',
    ...BUILTIN.map((b) => `- ${b}`),
  ];
  const mcp = listMcpToolDescriptors();
  if (mcp.length) {
    lines.push('MCP (use mcp JSON with server index matching your UMBRELLA_MCP_SERVERS order):');
    for (const { server, name } of mcp) {
      lines.push(`- server ${server}: ${name}`);
    }
  }
  let s = lines.join('\n');
  if (s.length > max) {
    s = `${s.slice(0, max - 40)}\n… (truncated; GET /api/tools for full list)`;
  }
  return s;
}
