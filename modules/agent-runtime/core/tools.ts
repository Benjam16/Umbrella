import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { evaluateShellCommand } from './shell-policy.js';

export const Toolset = {
  shell: async (command: string): Promise<string> => {
    const policy = evaluateShellCommand(command);
    if (!policy.ok) {
      return `❌ Error: Command blocked (${policy.reason}).`;
    }
    try {
      const output = execSync(command, { encoding: 'utf8', timeout: 30000 });
      return output || '✅ Command executed (no output)';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `❌ Shell Error: ${message}`;
    }
  },

  read_file: async (filePath: string): Promise<string> => {
    try {
      if (!(await fs.pathExists(filePath))) return '❌ Error: File not found.';
      const content = await fs.readFile(filePath, 'utf8');
      return content.slice(0, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `❌ Read Error: ${message}`;
    }
  },

  write_file: async (filePath: string, content: string): Promise<string> => {
    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf8');
      return `✅ File written to ${filePath}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `❌ Write Error: ${message}`;
    }
  },

  git_status: async (): Promise<string> => {
    try {
      return execSync('git status --short', { encoding: 'utf8' });
    } catch {
      return '❌ Error: Not a git repository.';
    }
  },
};
