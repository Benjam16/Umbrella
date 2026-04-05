/**
 * Central shell allow/deny checks (chaos recovery and Toolset.shell).
 */

const DEFAULT_FORBIDDEN_SUBSTRINGS = [
  'rm -rf /',
  'mkfs',
  'shutdown',
  ':(){ :|:& };:',
  'dd if=/dev/zero',
];

function strictMode(): boolean {
  return (
    process.env.UMBRELLA_SHELL_POLICY === 'strict' ||
    process.env.UMBRELLA_SHELL_POLICY === '1'
  );
}

function allowPrefixes(): string[] {
  const raw = process.env.UMBRELLA_SHELL_ALLOW_PREFIXES?.trim();
  if (!raw) {
    return [
      'git ',
      'npm ',
      'npx ',
      'pnpm ',
      'yarn ',
      'node ',
      'echo ',
      'pwd',
      'ls',
      'cd ',
      'cat ',
      'head ',
      'tail ',
    ];
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function denyRegexList(): RegExp[] {
  const raw = process.env.UMBRELLA_SHELL_DENY_REGEX?.trim();
  if (!raw) return [];
  return raw.split('|').map((part) => {
    try {
      return new RegExp(part.trim());
    } catch {
      return /^$/;
    }
  });
}

export type ShellPolicyResult = { ok: true } | { ok: false; reason: string };

export function evaluateShellCommand(command: string): ShellPolicyResult {
  const cmd = command.trim();
  if (!cmd) {
    return { ok: false, reason: 'empty command' };
  }

  for (const f of DEFAULT_FORBIDDEN_SUBSTRINGS) {
    if (cmd.includes(f)) {
      return { ok: false, reason: `blocked pattern: ${f}` };
    }
  }

  for (const re of denyRegexList()) {
    if (re.test(cmd)) {
      return { ok: false, reason: `matched UMBRELLA_SHELL_DENY_REGEX` };
    }
  }

  if (strictMode()) {
    const lower = cmd.toLowerCase();
    const bareOk = (base: string) =>
      lower === base || lower.startsWith(`${base} `);
    if (bareOk('pwd') || bareOk('ls') || bareOk('whoami')) {
      return { ok: true };
    }
    const prefixes = allowPrefixes();
    const allowed = prefixes.some((p) => lower.startsWith(p.toLowerCase()));
    if (!allowed) {
      return {
        ok: false,
        reason:
          'UMBRELLA_SHELL_POLICY=strict: command must start with one of UMBRELLA_SHELL_ALLOW_PREFIXES (or be pwd/ls/whoami)',
      };
    }
  }

  return { ok: true };
}
