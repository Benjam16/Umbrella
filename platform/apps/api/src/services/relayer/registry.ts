import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Maps a `blueprintId` to the UmbrellaAgentToken it should update when a
 * mission using that blueprint completes.
 *
 * Resolution order:
 *   1. JSON from `UMBRELLA_AGENT_REGISTRY` env (inline).
 *   2. JSON file at `UMBRELLA_AGENT_REGISTRY_FILE` (absolute path).
 *   3. Default file shipped with the api app at `config/agent-registry.json`.
 *
 * The shipped file mirrors the marketplace seed so the relayer "just works"
 * out of the box — when you deploy a new AgentToken, update this file and
 * restart the worker.
 */

export type AgentRegistryEntry = {
  blueprintId: string;
  tokenAddress: `0x${string}`;
  /** EIP-155 chain id. Defaults to Base Sepolia. */
  chainId: number;
  /** Display symbol for logs. */
  symbol?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = join(__dirname, "..", "..", "..", "config", "agent-registry.json");

let cache: AgentRegistryEntry[] | null = null;

export function loadRegistry(): AgentRegistryEntry[] {
  if (cache) return cache;

  const inline = process.env.UMBRELLA_AGENT_REGISTRY;
  if (inline) {
    try {
      cache = normalize(JSON.parse(inline));
      return cache;
    } catch (err) {
      console.warn("[relayer] UMBRELLA_AGENT_REGISTRY is not valid JSON:", err);
    }
  }

  const fileEnv = process.env.UMBRELLA_AGENT_REGISTRY_FILE;
  const path = fileEnv && existsSync(fileEnv) ? fileEnv : DEFAULT_FILE;
  if (existsSync(path)) {
    try {
      cache = normalize(JSON.parse(readFileSync(path, "utf8")));
      return cache;
    } catch (err) {
      console.warn(`[relayer] failed to read registry ${path}:`, err);
    }
  }

  cache = [];
  return cache;
}

export function resolveTokenForBlueprint(
  blueprintId: string,
): AgentRegistryEntry | null {
  for (const e of loadRegistry()) {
    if (e.blueprintId === blueprintId) return e;
  }
  return null;
}

/**
 * Force a reload next call — used by the CLI sub-command that lets ops swap
 * registries in place without restarting the worker.
 */
export function clearRegistryCache(): void {
  cache = null;
}

function normalize(raw: unknown): AgentRegistryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentRegistryEntry[] = [];
  for (const r of raw) {
    if (
      r &&
      typeof r === "object" &&
      typeof (r as Record<string, unknown>).blueprintId === "string" &&
      typeof (r as Record<string, unknown>).tokenAddress === "string" &&
      typeof (r as Record<string, unknown>).chainId === "number"
    ) {
      const entry = r as Record<string, unknown>;
      out.push({
        blueprintId: entry.blueprintId as string,
        tokenAddress: (entry.tokenAddress as string).toLowerCase() as `0x${string}`,
        chainId: entry.chainId as number,
        symbol:
          typeof entry.symbol === "string" ? (entry.symbol as string) : undefined,
      });
    }
  }
  return out;
}
