import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { mkdirSync } from "node:fs";
import { runShellCommand, verifyConfig } from "./command-executor.js";

export type ToolAction =
  | { type: "run_command"; command: string }
  | { type: "write_file_patch"; path: string; find: string; replace: string }
  | { type: "navigate_and_extract"; url: string; schema: Record<string, string> }
  | { type: "retrieve_context"; query: string; limit?: number }
  | {
      type: "propose_on_chain_tx";
      network: "base";
      to: string;
      data: string;
      value: string;
      description?: string;
    };

export type ToolExecutionResult = {
  action: ToolAction;
  ok: boolean;
  message: string;
  output?: string;
};

function approvalForProtectedWritesEnabled(): boolean {
  return process.env.UMBRELLA_RUN_REQUIRE_APPROVAL_FOR_PROTECTED_WRITES !== "false";
}

function protectedWritePrefixes(): string[] {
  const raw = process.env.UMBRELLA_RUN_PROTECTED_PATHS?.trim();
  if (!raw) return ["README.md", "package.json", "platform/apps/api/src/"];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function readWriteAllowlist(): string[] {
  const raw = process.env.UMBRELLA_RUN_WRITE_ALLOWLIST?.trim();
  if (!raw) return ["src/", "apps/", "packages/", "README.md", "platform/"];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function isWithinRoot(absPath: string, root: string): boolean {
  return absPath === root || absPath.startsWith(root + sep);
}

function toSafePath(pathInput: string, root: string): string | null {
  const abs = resolve(root, pathInput);
  if (!isWithinRoot(abs, root)) return null;
  return abs;
}

function pathAllowed(relPath: string): boolean {
  return readWriteAllowlist().some((prefix) => relPath.startsWith(prefix));
}

function executePatch(path: string, find: string, replace: string, root: string): ToolExecutionResult {
  if (!path || !find) {
    return {
      action: { type: "write_file_patch", path, find, replace },
      ok: false,
      message: "write_file_patch requires non-empty path and find",
    };
  }
  const abs = toSafePath(path, root);
  if (!abs) {
    return {
      action: { type: "write_file_patch", path, find, replace },
      ok: false,
      message: "path_outside_project_root",
    };
  }
  const rel = abs.slice(root.length + 1).replace(/\\/g, "/");
  if (!pathAllowed(rel)) {
    return {
      action: { type: "write_file_patch", path, find, replace },
      ok: false,
      message: `path_not_allowed:${rel}`,
    };
  }

  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, "", "utf-8");
  }
  const current = readFileSync(abs, "utf-8");
  if (!current.includes(find)) {
    return {
      action: { type: "write_file_patch", path, find, replace },
      ok: false,
      message: "find_text_not_present",
    };
  }
  const updated = current.replace(find, replace);
  writeFileSync(abs, updated, "utf-8");
  return {
    action: { type: "write_file_patch", path, find, replace },
    ok: true,
    message: `patched:${rel}`,
  };
}

export function parseToolActions(raw: string): ToolAction[] {
  const match = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = match?.[1] ?? raw;
  try {
    const parsed = JSON.parse(candidate) as { actions?: unknown };
    if (!Array.isArray(parsed.actions)) return [];
    const out: ToolAction[] = [];
    for (const item of parsed.actions) {
      if (!item || typeof item !== "object") continue;
      const t = (item as { type?: string }).type;
      if (t === "run_command") {
        const cmd = String((item as { command?: unknown }).command ?? "").trim();
        if (cmd) out.push({ type: "run_command", command: cmd });
      } else if (t === "write_file_patch") {
        const p = String((item as { path?: unknown }).path ?? "").trim();
        const find = String((item as { find?: unknown }).find ?? "");
        const replace = String((item as { replace?: unknown }).replace ?? "");
        if (p && find) out.push({ type: "write_file_patch", path: p, find, replace });
      } else if (t === "navigate_and_extract" || t === "maps_and_extract") {
        const url = String((item as { url?: unknown }).url ?? "").trim();
        const rawSchema = (item as { schema?: unknown }).schema;
        const schema =
          rawSchema && typeof rawSchema === "object" && !Array.isArray(rawSchema)
            ? Object.fromEntries(
                Object.entries(rawSchema as Record<string, unknown>)
                  .filter(([k]) => k.trim().length > 0)
                  .map(([k, v]) => [k.trim(), String(v ?? "")]),
              )
            : {};
        if (url) out.push({ type: "navigate_and_extract", url, schema });
      } else if (t === "retrieve_context") {
        const query = String((item as { query?: unknown }).query ?? "").trim();
        const limitRaw = Number((item as { limit?: unknown }).limit ?? 3);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10, Math.floor(limitRaw))) : 3;
        if (query.length >= 3) {
          out.push({ type: "retrieve_context", query, limit });
        }
      } else if (t === "propose_on_chain_tx") {
        const networkRaw = String((item as { network?: unknown }).network ?? "base").toLowerCase();
        const to = String((item as { to?: unknown }).to ?? "").trim();
        const data = String((item as { data?: unknown }).data ?? "").trim();
        const value = String((item as { value?: unknown }).value ?? "0").trim() || "0";
        const description = String((item as { description?: unknown }).description ?? "").trim();
        if (networkRaw === "base" && to && data) {
          out.push({
            type: "propose_on_chain_tx",
            network: "base",
            to,
            data,
            value,
            description: description || undefined,
          });
        }
      }
    }
    return out.slice(0, 5);
  } catch {
    return [];
  }
}

export function protectedWriteActions(actions: ToolAction[]): ToolAction[] {
  if (!approvalForProtectedWritesEnabled()) return [];
  const prefixes = protectedWritePrefixes();
  return actions.filter((a) => {
    if (a.type !== "write_file_patch") return false;
    const rel = a.path.replace(/\\/g, "/");
    return prefixes.some((p) => rel.startsWith(p));
  });
}

export async function executeToolActions(actions: ToolAction[]): Promise<ToolExecutionResult[]> {
  const cfg = verifyConfig();
  const results: ToolExecutionResult[] = [];
  for (const action of actions) {
    if (action.type === "run_command") {
      const res = await runShellCommand(action.command, {
        cwd: cfg.cwd,
        timeoutMs: cfg.timeoutMs,
        maxOutputBytes: cfg.maxOutputBytes,
      });
      if (res.blocked) {
        results.push({
          action,
          ok: false,
          message: `command_blocked:${res.reason ?? "not_allowed"}`,
          output: (res.stderr || res.stdout).slice(-800),
        });
      } else if (res.timedOut) {
        results.push({
          action,
          ok: false,
          message: "command_timed_out",
          output: (res.stderr || res.stdout).slice(-800),
        });
      } else if (res.exitCode !== 0) {
        results.push({
          action,
          ok: false,
          message: `command_failed:${String(res.exitCode)}`,
          output: (res.stderr || res.stdout).slice(-800),
        });
      } else {
        results.push({
          action,
          ok: true,
          message: "command_passed",
          output: (res.stdout || res.stderr).slice(-800),
        });
      }
      continue;
    }
    if (action.type === "write_file_patch") {
      results.push(executePatch(action.path, action.find, action.replace, cfg.cwd));
      continue;
    }
    results.push({
      action,
      ok: false,
      message: `unsupported_action_for_executor:${action.type}`,
    });
  }
  return results;
}
