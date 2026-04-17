import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { runShellCommand, verifyConfig } from "./command-executor.js";

type WritePatchAction = {
  type: "write_file_patch";
  path: string;
  find: string;
  replace: string;
};

type SandboxPreflightResult = {
  ok: boolean;
  message: string;
  output?: string;
  sandboxPath: string;
};

function isWithinRoot(absPath: string, root: string): boolean {
  return absPath === root || absPath.startsWith(root + sep);
}

function toSafePath(pathInput: string, root: string): string | null {
  const abs = resolve(root, pathInput);
  if (!isWithinRoot(abs, root)) return null;
  return abs;
}

function writeAllowlist(): string[] {
  const raw = process.env.UMBRELLA_RUN_WRITE_ALLOWLIST?.trim();
  if (!raw) return ["src/", "apps/", "packages/", "README.md", "platform/"];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function pathAllowed(relPath: string): boolean {
  return writeAllowlist().some((prefix) => relPath.startsWith(prefix));
}

function cloneProjectToSandbox(root: string): string {
  const sandbox = mkdtempSync(join(tmpdir(), "umbrella-sandbox-"));
  cpSync(root, sandbox, {
    recursive: true,
    filter: (src: string) => {
      const normalized = src.replace(/\\/g, "/");
      if (normalized.includes("/.git/")) return false;
      if (normalized.includes("/node_modules/")) return false;
      if (normalized.includes("/dist/")) return false;
      if (normalized.includes("/build/")) return false;
      if (normalized.includes("/.next/")) return false;
      if (normalized.includes("/coverage/")) return false;
      if (normalized.includes("/data/store.json")) return false;
      return true;
    },
  });
  return sandbox;
}

function applyPatchInRoot(action: WritePatchAction, root: string): SandboxPreflightResult {
  if (!action.path || !action.find) {
    return { ok: false, message: "sandbox_patch_invalid", sandboxPath: root };
  }
  const abs = toSafePath(action.path, root);
  if (!abs) return { ok: false, message: "sandbox_path_outside_root", sandboxPath: root };
  const rel = abs.slice(root.length + 1).replace(/\\/g, "/");
  if (!pathAllowed(rel)) return { ok: false, message: `sandbox_path_not_allowed:${rel}`, sandboxPath: root };
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "", "utf-8");
  }
  const current = readFileSync(abs, "utf-8");
  if (!current.includes(action.find)) {
    return { ok: false, message: `sandbox_find_not_present:${rel}`, sandboxPath: root };
  }
  writeFileSync(abs, current.replace(action.find, action.replace), "utf-8");
  return { ok: true, message: `sandbox_patched:${rel}`, sandboxPath: root };
}

export async function preflightWritePatchesInSandbox(actions: WritePatchAction[]): Promise<SandboxPreflightResult> {
  const cfg = verifyConfig();
  const sandboxPath = cloneProjectToSandbox(cfg.cwd);
  try {
    for (const action of actions) {
      const patch = applyPatchInRoot(action, sandboxPath);
      if (!patch.ok) return patch;
    }
    const verifyCommands = verifyConfig().commands;
    if (verifyCommands.length === 0) {
      return {
        ok: true,
        message: "sandbox_patch_only_passed",
        output: "No verification commands configured.",
        sandboxPath,
      };
    }
    for (const command of verifyCommands) {
      const res = await runShellCommand(command, {
        cwd: sandboxPath,
        timeoutMs: cfg.timeoutMs,
        maxOutputBytes: cfg.maxOutputBytes,
      });
      if (res.blocked || res.timedOut || res.exitCode !== 0) {
        return {
          ok: false,
          message: `sandbox_verify_failed:${command}`,
          output: (res.stderr || res.stdout).slice(-1500),
          sandboxPath,
        };
      }
    }
    return {
      ok: true,
      message: "sandbox_verify_passed",
      output: "All sandbox verification commands passed.",
      sandboxPath,
    };
  } finally {
    rmSync(sandboxPath, { recursive: true, force: true });
  }
}
