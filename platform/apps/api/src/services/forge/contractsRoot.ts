import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Root of the Foundry workspace (`platform/contracts`) — contains `lib/`, `foundry.toml`.
 * Override with `UMBRELLA_CONTRACTS_ROOT` in production or nonstandard layouts.
 */
export function resolveContractsRoot(): string {
  const env = process.env.UMBRELLA_CONTRACTS_ROOT?.trim();
  if (env) return path.resolve(env);

  const here = path.dirname(fileURLToPath(import.meta.url));
  // .../platform/apps/api/src/services/forge → platform/contracts
  const platformRoot = path.resolve(here, "..", "..", "..", "..", "..");
  return path.join(platformRoot, "contracts");
}

export function assertContractsRoot(): string {
  const root = resolveContractsRoot();
  if (!existsSync(path.join(root, "foundry.toml"))) {
    throw new Error(
      `UMBRELLA_CONTRACTS_ROOT invalid: missing foundry.toml at ${root}. Set UMBRELLA_CONTRACTS_ROOT.`,
    );
  }
  if (!existsSync(path.join(root, "lib"))) {
    throw new Error(`Contracts workspace missing lib/ at ${root}`);
  }
  return root;
}
