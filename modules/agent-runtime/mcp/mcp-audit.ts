import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const LOG_PATH = path.join(os.homedir(), '.umbrella', 'mcp-audit.log');

export async function auditMcpCall(meta: {
  serverIndex: number;
  tool: string;
  ms: number;
  ok: boolean;
  error?: string;
  preview?: string;
}): Promise<void> {
  if (
    process.env.UMBRELLA_MCP_AUDIT === '0' ||
    process.env.UMBRELLA_MCP_AUDIT === 'false'
  ) {
    return;
  }
  const line = `${JSON.stringify({ t: new Date().toISOString(), ...meta })}\n`;
  try {
    await fs.ensureDir(path.dirname(LOG_PATH));
    await fs.appendFile(LOG_PATH, line, 'utf8');
  } catch {
    /* ignore */
  }
}
