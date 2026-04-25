import { readFileSync } from "fs";
import { join } from "path";
import embeddedMissionRecord from "./embedded/UmbrellaAgentMissionRecord.json";

/**
 * Loads the UmbrellaAgentMissionRecord foundry artifact so the server can
 * deploy an immutable record of each agent's Kimi-generated mission logic.
 *
 * The artifact is produced by `forge build` in platform/contracts. We resolve
 * it at runtime (rather than importing the JSON at bundle time) because
 * Next.js's bundler sometimes fails on large JSON imports.
 *
 * If you ever see "missionRecord artifact not found" in production, rerun
 * `cd platform/contracts && forge build`.
 */
type ForgeArtifact = {
  abi: ReadonlyArray<Record<string, unknown>>;
  bytecode: { object: `0x${string}` };
};

let cached: ForgeArtifact | null = null;

export function loadMissionRecordArtifact(): ForgeArtifact {
  if (cached) return cached;
  // Production-safe fallback: bundle a known-good artifact so deployments
  // don't depend on shipping `platform/contracts/out` at runtime.
  if ((embeddedMissionRecord as ForgeArtifact)?.bytecode?.object) {
    cached = embeddedMissionRecord as unknown as ForgeArtifact;
    return cached;
  }
  const roots = [
    process.env.UMBRELLA_CONTRACTS_OUT_DIR?.trim(),
    // Typical dev: running from platform/apps/web
    join(process.cwd(), "../../contracts/out"),
    // Running from platform/apps/web in some Next layouts
    join(process.cwd(), "../../../contracts/out"),
    // Monorepo root cwd (or bundled /var/task root)
    join(process.cwd(), "platform/contracts/out"),
    // Worst-case: cwd already at repo root (or close)
    join(process.cwd(), "contracts/out"),
  ].filter((v): v is string => !!v);

  let lastError: unknown = null;
  for (const root of roots) {
    try {
      const candidates = [
        // Foundry default: out/<Contract>.sol/<Contract>.json
        join(root, "UmbrellaAgentMissionRecord.sol", "UmbrellaAgentMissionRecord.json"),
        // Some builds (and user screenshot) nest an extra `out/` segment into the computed root
        join(root, "out", "UmbrellaAgentMissionRecord.sol", "UmbrellaAgentMissionRecord.json"),
        // Alternative layout: out/<file>/<Contract>.json (rare, but harmless to try)
        join(root, "UmbrellaAgentMissionRecord", "UmbrellaAgentMissionRecord.json"),
      ];
      let raw: string | null = null;
      for (const p of candidates) {
        try {
          raw = readFileSync(p, "utf-8");
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ForgeArtifact;
      if (!parsed.bytecode?.object) continue;
      cached = parsed;
      return parsed;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `missionRecord artifact not found. Build contracts with 'cd platform/contracts && forge build'. ${
      lastError instanceof Error ? lastError.message : ""
    }`,
  );
}
