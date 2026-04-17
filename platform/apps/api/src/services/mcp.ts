import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export type McpServerConfig = {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type McpConnection = {
  id: string;
  client: Client;
  transport: StdioClientTransport;
  connectedAt: string;
  command: string;
  args: string[];
};

type McpTextContent = { type: "text"; text: string };

function safeStringMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function parseConfiguredServers(): McpServerConfig[] {
  const raw = process.env.UMBRELLA_MCP_SERVERS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: McpServerConfig[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const id = String((item as { id?: unknown }).id ?? "").trim();
      const command = String((item as { command?: unknown }).command ?? "").trim();
      const argsRaw = (item as { args?: unknown }).args;
      const args = Array.isArray(argsRaw)
        ? argsRaw.map((v) => String(v)).filter(Boolean)
        : [];
      const env = safeStringMap((item as { env?: unknown }).env);
      if (!id || !command) continue;
      out.push({ id, command, args, env });
    }
    return out;
  } catch {
    return [];
  }
}

export class MCPClientService {
  private readonly connections = new Map<string, McpConnection>();

  constructor() {
    const configured = parseConfiguredServers();
    for (const server of configured) {
      void this.connect(server).catch((e) => {
        console.warn(`[mcp] failed autoconnect ${server.id}: ${String(e)}`);
      });
    }
  }

  async connect(config: McpServerConfig): Promise<{ id: string; connectedAt: string }> {
    const existing = this.connections.get(config.id);
    if (existing) {
      return { id: existing.id, connectedAt: existing.connectedAt };
    }
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: {
        ...safeStringMap(process.env),
        ...(config.env ?? {}),
      },
    });
    const client = new Client(
      {
        name: "umbrella-api-mcp-client",
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );
    await client.connect(transport);
    const connection: McpConnection = {
      id: config.id,
      client,
      transport,
      connectedAt: new Date().toISOString(),
      command: config.command,
      args: config.args ?? [],
    };
    this.connections.set(config.id, connection);
    return { id: connection.id, connectedAt: connection.connectedAt };
  }

  async disconnect(serverId: string): Promise<boolean> {
    const connection = this.connections.get(serverId);
    if (!connection) return false;
    await connection.transport.close();
    this.connections.delete(serverId);
    return true;
  }

  listConnections(): Array<{
    id: string;
    connectedAt: string;
    command: string;
    args: string[];
  }> {
    return [...this.connections.values()].map((c) => ({
      id: c.id,
      connectedAt: c.connectedAt,
      command: c.command,
      args: c.args,
    }));
  }

  private getConnection(serverId: string): McpConnection {
    const connection = this.connections.get(serverId);
    if (!connection) throw new Error(`mcp_server_not_connected:${serverId}`);
    return connection;
  }

  async listTools(serverId: string): Promise<unknown[]> {
    const { client } = this.getConnection(serverId);
    const res = await client.listTools();
    return res.tools ?? [];
  }

  async callTool(serverId: string, toolName: string, args?: Record<string, unknown>): Promise<{
    content: McpTextContent[];
    isError?: boolean;
    structuredContent?: unknown;
  }> {
    const { client } = this.getConnection(serverId);
    const res = await client.callTool({
      name: toolName,
      arguments: args ?? {},
    });
    const content = Array.isArray(res.content)
      ? res.content.filter((item): item is McpTextContent => item.type === "text")
      : [];
    return {
      content,
      isError: typeof res.isError === "boolean" ? res.isError : undefined,
      structuredContent: res.structuredContent,
    };
  }

  async listResources(serverId: string): Promise<unknown[]> {
    const { client } = this.getConnection(serverId);
    const res = await client.listResources();
    return res.resources ?? [];
  }

  async readResource(serverId: string, uri: string): Promise<{
    contents: Array<{ uri?: string; mimeType?: string; text?: string }>;
  }> {
    const { client } = this.getConnection(serverId);
    const res = await client.readResource({ uri });
    return {
      contents: (res.contents ?? []).map((c) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: "text" in c && typeof c.text === "string" ? c.text : undefined,
      })),
    };
  }
}

export const mcpClient = new MCPClientService();
