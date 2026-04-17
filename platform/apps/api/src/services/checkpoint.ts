import { spawn } from "node:child_process";
import { resolve } from "node:path";

type CheckpointResult = {
  status: "created" | "skipped" | "failed";
  checkpointBranch?: string;
  baseBranch?: string;
  error?: string;
};

export type RollbackPreviewResult = {
  ok: boolean;
  commands: string[];
  reason?: string;
};

export type RollbackExecuteResult = {
  ok: boolean;
  commands: string[];
  stdout?: string;
  stderr?: string;
  reason?: string;
};

function runGit(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveResult) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf-8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf-8");
    });
    child.on("error", (e) => {
      resolveResult({ code: 1, stdout, stderr: `${stderr}\n${String(e)}`.trim() });
    });
    child.on("close", (code) => {
      resolveResult({ code: code ?? 1, stdout, stderr });
    });
  });
}

function projectRoot(): string {
  const root = process.env.UMBRELLA_RUN_PROJECT_ROOT?.trim();
  return resolve(root || process.cwd());
}

function sanitizeToken(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createRunCheckpoint(runId: string): Promise<CheckpointResult> {
  const cwd = projectRoot();
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (inside.code !== 0 || !inside.stdout.trim().includes("true")) {
    return { status: "skipped", error: "not_git_repo" };
  }

  const head = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (head.code !== 0) {
    return { status: "failed", error: head.stderr.trim() || "cannot_read_head_branch" };
  }
  const baseBranch = head.stdout.trim() || "unknown";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const checkpointBranch = `umbrella/checkpoint-${sanitizeToken(runId)}-${sanitizeToken(stamp)}`;

  const created = await runGit(["branch", checkpointBranch], cwd);
  if (created.code !== 0) {
    return {
      status: "failed",
      baseBranch,
      checkpointBranch,
      error: created.stderr.trim() || "branch_create_failed",
    };
  }
  return { status: "created", checkpointBranch, baseBranch };
}

export async function previewRollback(checkpointBranch?: string): Promise<RollbackPreviewResult> {
  const branch = checkpointBranch?.trim();
  if (!branch) {
    return { ok: false, commands: [], reason: "missing_checkpoint_branch" };
  }
  const cwd = projectRoot();
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (inside.code !== 0 || !inside.stdout.trim().includes("true")) {
    return { ok: false, commands: [], reason: "not_git_repo" };
  }
  return {
    ok: true,
    commands: [
      `git branch --list "${branch}"`,
      `git diff --name-status "${branch}"...HEAD`,
      `git reset --hard "${branch}"`,
      "git clean -fd",
    ],
  };
}

export async function executeRollback(checkpointBranch?: string): Promise<RollbackExecuteResult> {
  const preview = await previewRollback(checkpointBranch);
  if (!preview.ok) {
    return { ok: false, commands: preview.commands, reason: preview.reason };
  }
  const branch = checkpointBranch!.trim();
  const cwd = projectRoot();
  const exists = await runGit(["branch", "--list", branch], cwd);
  if (exists.code !== 0 || !exists.stdout.trim()) {
    return {
      ok: false,
      commands: preview.commands,
      reason: "checkpoint_branch_not_found",
      stderr: exists.stderr.trim(),
    };
  }
  const reset = await runGit(["reset", "--hard", branch], cwd);
  if (reset.code !== 0) {
    return {
      ok: false,
      commands: preview.commands,
      reason: "git_reset_failed",
      stdout: reset.stdout.trim(),
      stderr: reset.stderr.trim(),
    };
  }
  const clean = await runGit(["clean", "-fd"], cwd);
  if (clean.code !== 0) {
    return {
      ok: false,
      commands: preview.commands,
      reason: "git_clean_failed",
      stdout: `${reset.stdout}\n${clean.stdout}`.trim(),
      stderr: `${reset.stderr}\n${clean.stderr}`.trim(),
    };
  }
  return {
    ok: true,
    commands: preview.commands,
    stdout: `${reset.stdout}\n${clean.stdout}`.trim(),
    stderr: `${reset.stderr}\n${clean.stderr}`.trim(),
  };
}
