import { readFileSync } from "fs";
import { join } from "path";

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
  const roots = [
    process.env.UMBRELLA_CONTRACTS_OUT_DIR?.trim(),
    join(process.cwd(), "../../contracts/out"),
    join(process.cwd(), "../../../contracts/out"),
    join(process.cwd(), "platform/contracts/out"),
  ].filter((v): v is string => !!v);

  let lastError: unknown = null;
  for (const root of roots) {
    try {
      const path = join(
        root,
        "UmbrellaAgentMissionRecord.sol",
        "UmbrellaAgentMissionRecord.json",
      );
      const raw = readFileSync(path, "utf-8");
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
