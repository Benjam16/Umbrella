import fs from 'fs-extra';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { auditMcpCall } from './mcp-audit.js';
import { approxTokens, recordApproxTokenUsage } from '../core/token-budget.js';

export type McpServerConfig = {
  /** stdio server */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** Streamable HTTP / SSE MCP endpoint */
  url?: string;
  headers?: Record<string, string>;
};

type McpTransport = StdioClientTransport | StreamableHTTPClientTransport;

type ConnectedServer = {
  client: Client;
  transport: McpTransport;
  toolNames: Set<string>;
};

const connections: ConnectedServer[] = [];

function mcpEnabled(): boolean {
  return (
    process.env.UMBRELLA_MCP_ENABLED === '1' ||
    process.env.UMBRELLA_MCP_ENABLED === 'true'
  );
}

export function isMcpNetworkBlocked(): boolean {
  return (
    process.env.UMBRELLA_MCP_NETWORK_DISABLED === '1' ||
    process.env.UMBRELLA_MCP_NETWORK_DISABLED === 'true'
  );
}

function maxTools(): number {
  const raw = process.env.UMBRELLA_MCP_MAX_TOOLS?.trim();
  const n = raw ? parseInt(raw, 10) : 128;
  return Number.isFinite(n) && n > 0 ? n : 128;
}

function timeoutMs(): number {
  const raw = process.env.UMBRELLA_MCP_TIMEOUT_MS?.trim();
  const n = raw ? parseInt(raw, 10) : 60_000;
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

function expandStringPlaceholders(s: string): string {
  return s.replace(
    /\$\{([A-Z0-9_]+)\}/g,
    (_, name: string) => process.env[name] ?? '',
  );
}

/** Replace `${VAR}` in env and HTTP header values. */
function expandEnvPlaceholders(cfg: McpServerConfig): McpServerConfig {
  let next = cfg;
  if (cfg.env) {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg.env)) {
      env[k] = expandStringPlaceholders(v);
    }
    next = { ...next, env };
  }
  if (cfg.headers) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg.headers)) {
      headers[k] = expandStringPlaceholders(v);
    }
    next = { ...next, headers };
  }
  return next;
}

function normalizeConfigs(j: unknown): McpServerConfig[] {
  if (!Array.isArray(j)) return [];
  const out: McpServerConfig[] = [];
  for (const x of j) {
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    const command = typeof o.command === 'string' ? o.command.trim() : '';
    if (url) {
      let headers: Record<string, string> | undefined;
      if (
        o.headers &&
        typeof o.headers === 'object' &&
        !Array.isArray(o.headers)
      ) {
        headers = {};
        for (const [k, v] of Object.entries(o.headers as Record<string, unknown>)) {
          if (typeof v === 'string') headers[k] = v;
        }
      }
      out.push({ url, headers });
      continue;
    }
    if (command) {
      out.push({
        command,
        args: Array.isArray(o.args) ? (o.args as string[]) : undefined,
        env:
          o.env && typeof o.env === 'object' && !Array.isArray(o.env)
            ? (o.env as Record<string, string>)
            : undefined,
        cwd: typeof o.cwd === 'string' ? o.cwd : undefined,
      });
    }
  }
  return out;
}

function parseServerList(): McpServerConfig[] {
  const raw = process.env.UMBRELLA_MCP_SERVERS?.trim();
  if (!raw) return [];
  try {
    return normalizeConfigs(JSON.parse(raw));
  } catch {
    console.log('☂️ MCP: UMBRELLA_MCP_SERVERS is not valid JSON — skipping MCP.');
    return [];
  }
}

async function loadServerListFromFile(): Promise<McpServerConfig[]> {
  const p = process.env.UMBRELLA_MCP_SERVERS_FILE?.trim();
  if (!p) return [];
  try {
    if (!(await fs.pathExists(p))) {
      console.log(`☂️ MCP: UMBRELLA_MCP_SERVERS_FILE not found: ${p}`);
      return [];
    }
    const j = await fs.readJson(p);
    return normalizeConfigs(j);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`☂️ MCP: failed to read UMBRELLA_MCP_SERVERS_FILE (${msg})`);
    return [];
  }
}

async function loadAllServerConfigs(): Promise<McpServerConfig[]> {
  const fromFile = await loadServerListFromFile();
  const fromEnv = parseServerList();
  const merged = [...fromFile, ...fromEnv];
  return merged.map(expandEnvPlaceholders);
}

export function isMcpRuntimeEnabled(): boolean {
  return mcpEnabled() && !isMcpNetworkBlocked();
}

export async function initMcp(): Promise<void> {
  if (!mcpEnabled()) {
    return;
  }
  if (isMcpNetworkBlocked()) {
    console.log('☂️ MCP not started (UMBRELLA_MCP_NETWORK_DISABLED=1).');
    return;
  }
  const configs = await loadAllServerConfigs();
  if (configs.length === 0) {
    console.log(
      '☂️ MCP enabled but no servers configured (set UMBRELLA_MCP_SERVERS and/or UMBRELLA_MCP_SERVERS_FILE).',
    );
    return;
  }

  let toolBudget = maxTools();

  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    const client = new Client({ name: 'umbrella', version: '0.1.0' });
    let transport: McpTransport | null = null;
    let label = '';
    try {
      if (cfg.url) {
        transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers
            ? { headers: cfg.headers }
            : undefined,
        });
        label = `url ${cfg.url}`;
      } else if (cfg.command) {
        transport = new StdioClientTransport({
          command: cfg.command,
          args: cfg.args ?? [],
          env: cfg.env,
          cwd: cfg.cwd,
          stderr: 'inherit',
        });
        label = `${cfg.command} ${(cfg.args ?? []).join(' ')}`;
      } else {
        console.log(`☂️ MCP server #${i} skipped (no command or url)`);
        continue;
      }

      await client.connect(transport);
      const listed = await client.listTools();
      const toolNames = new Set<string>();
      for (const t of listed.tools ?? []) {
        if (toolBudget <= 0) break;
        if (t?.name) {
          toolNames.add(t.name);
          toolBudget -= 1;
        }
      }
      connections.push({ client, transport, toolNames });
      console.log(`☂️ MCP server #${i} connected (${label}) — ${toolNames.size} tools`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`☂️ MCP server #${i} failed to start: ${msg}`);
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      if (transport) {
        try {
          await transport.close();
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export async function shutdownMcp(): Promise<void> {
  for (const c of connections) {
    try {
      await c.client.close();
    } catch {
      /* ignore */
    }
    try {
      await c.transport.close();
    } catch {
      /* ignore */
    }
  }
  connections.length = 0;
}

export function listMcpToolSummary(): string[] {
  const out: string[] = [];
  connections.forEach((c, serverIndex) => {
    for (const name of c.toolNames) {
      out.push(`mcp:${JSON.stringify({ server: serverIndex, name })}`);
    }
  });
  return out;
}

/** Structured MCP tools for planner hints and `GET /api/tools`. */
export function listMcpToolDescriptors(): Array<{ server: number; name: string }> {
  const out: Array<{ server: number; name: string }> = [];
  connections.forEach((c, serverIndex) => {
    for (const name of c.toolNames) {
      out.push({ server: serverIndex, name });
    }
  });
  return out;
}

export type McpCallPayload = {
  server: number;
  name: string;
  arguments?: Record<string, unknown>;
};

export function parseMcpAction(action: string): McpCallPayload | null {
  const trimmed = action.trim();
  if (!trimmed.toLowerCase().startsWith('mcp:')) return null;
  const jsonPart = trimmed.slice(4).trim();
  if (!jsonPart) return null;
  try {
    const j = JSON.parse(jsonPart) as unknown;
    if (typeof j !== 'object' || j === null) return null;
    const o = j as Record<string, unknown>;
    const server = o.server;
    const name = o.name;
    if (typeof server !== 'number' || server < 0 || !Number.isInteger(server)) {
      return null;
    }
    if (typeof name !== 'string' || !name.trim()) {
      return null;
    }
    const args = o.arguments;
    const arguments_ =
      args !== undefined && args !== null && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};
    return { server, name: name.trim(), arguments: arguments_ };
  } catch {
    return null;
  }
}

type CallToolResultLike = {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function summarizeToolResult(result: unknown): string {
  if (result === null || result === undefined) return '';
  if (typeof result === 'string') return result;
  const r = result as CallToolResultLike;
  const texts: string[] = [];
  for (const c of r.content ?? []) {
    if (c?.type === 'text' && typeof c.text === 'string') {
      texts.push(c.text);
    }
  }
  if (texts.length) {
    return texts.join('\n').slice(0, 8000);
  }
  try {
    return JSON.stringify(result).slice(0, 8000);
  } catch {
    return String(result);
  }
}

export async function invokeMcp(payload: McpCallPayload): Promise<string> {
  const started = Date.now();
  const server = connections[payload.server];
  if (!server) {
    const msg = `❌ MCP Error: no server at index ${payload.server}`;
    await auditMcpCall({
      serverIndex: payload.server,
      tool: payload.name,
      ms: Date.now() - started,
      ok: false,
      error: 'bad_server_index',
    });
    return msg;
  }
  if (!server.toolNames.has(payload.name)) {
    const msg = `❌ MCP Error: tool "${payload.name}" not in allowlist for server ${payload.server}`;
    await auditMcpCall({
      serverIndex: payload.server,
      tool: payload.name,
      ms: Date.now() - started,
      ok: false,
      error: 'tool_not_listed',
    });
    return msg;
  }

  try {
    const res = await server.client.callTool(
      {
        name: payload.name,
        arguments: payload.arguments ?? {},
      },
      undefined,
      { timeout: timeoutMs() },
    );
    const text = summarizeToolResult(res);
    const ms = Date.now() - started;
    await auditMcpCall({
      serverIndex: payload.server,
      tool: payload.name,
      ms,
      ok: !res?.isError,
      preview: text.slice(0, 500),
    });
    const approx = approxTokens(text);
    await recordApproxTokenUsage(approx, 'mcp_tool');
    if (res?.isError) {
      return `❌ MCP tool error: ${text}`;
    }
    return text || '✅ MCP tool completed (no text content)';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await auditMcpCall({
      serverIndex: payload.server,
      tool: payload.name,
      ms: Date.now() - started,
      ok: false,
      error: msg.slice(0, 500),
    });
    return `❌ MCP Error: ${msg}`;
  }
}
