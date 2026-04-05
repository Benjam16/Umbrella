import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const LOG_PATH = path.join(os.homedir(), '.umbrella', 'llm-audit.log');

export async function auditLlmCall(meta: {
  provider: string;
  model: string;
  ms: number;
  ok: boolean;
  error?: string;
}): Promise<void> {
  if (process.env.UMBRELLA_LLM_AUDIT === '0' || process.env.UMBRELLA_LLM_AUDIT === 'false') {
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
