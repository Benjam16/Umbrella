import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type CommandResult = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  blocked: boolean;
  reason?: string;
};

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function readVerifyCommands(): string[] {
  const raw = process.env.UMBRELLA_RUN_VERIFY_COMMANDS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function allowedPrefixes(): string[] {
  const raw = process.env.UMBRELLA_RUN_ALLOWED_COMMAND_PREFIXES?.trim();
  if (!raw) return ["npm", "pnpm", "yarn", "bun", "node", "python", "pytest", "go", "cargo"];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function projectRoot(): string {
  const root = process.env.UMBRELLA_RUN_PROJECT_ROOT?.trim();
  return resolve(root || process.cwd());
}

function isAllowedCommand(command: string): boolean {
  const first = command.trim().split(/\s+/)[0];
  return allowedPrefixes().some((p) => first === p);
}

function hasDangerousSequence(command: string): boolean {
  const lowered = command.toLowerCase();
  const blocked = [
    "rm -rf /",
    "rm -rf ~",
    "mkfs",
    "shutdown",
    "reboot",
    ">:",
    "dd if=",
  ];
  return blocked.some((s) => lowered.includes(s));
}

export function verifyConfig(): {
  commands: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
} {
  return {
    commands: readVerifyCommands(),
    cwd: projectRoot(),
    timeoutMs: Math.max(1_000, envInt("UMBRELLA_RUN_COMMAND_TIMEOUT_MS", 120_000)),
    maxOutputBytes: Math.max(1_024, envInt("UMBRELLA_RUN_MAX_OUTPUT_BYTES", 32_000)),
  };
}

export async function runShellCommand(
  command: string,
  opts: { cwd: string; timeoutMs: number; maxOutputBytes: number },
): Promise<CommandResult> {
  if (!isAllowedCommand(command)) {
    return {
      command,
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      blocked: true,
      reason: "command_prefix_not_allowed",
    };
  }
  if (hasDangerousSequence(command)) {
    return {
      command,
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      blocked: true,
      reason: "command_contains_dangerous_sequence",
    };
  }

  return await new Promise<CommandResult>((resolveResult) => {
    const child = spawn(command, {
      cwd: opts.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500);
    }, opts.timeoutMs);

    const append = (prev: string, chunk: Buffer): string => {
      const merged = prev + chunk.toString("utf-8");
      if (Buffer.byteLength(merged, "utf-8") <= opts.maxOutputBytes) return merged;
      return Buffer.from(merged, "utf-8")
        .subarray(0, opts.maxOutputBytes)
        .toString("utf-8");
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    child.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveResult({
        command,
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${String(e)}`.trim(),
        timedOut,
        blocked: false,
      });
    });

    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveResult({
        command,
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        blocked: false,
      });
    });
  });
}
