#!/usr/bin/env tsx
/**
 * One-shot CLI for the RelayerService. Useful for:
 *   - smoke-testing a local setup: `pnpm -F @umbrella/api exec tsx src/services/relayer/cli.ts once`
 *   - draining a backlog after an outage
 *   - verifying a registry change without restarting the long-running worker
 *
 * Commands:
 *   once               run a single tick, print JSON result, exit
 *   loop [intervalSec] run ticks forever (defaults to 15s)
 *   identity           print the attester address + registry summary
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, "..", "..", "..", ".env") });

import { createRelayerService } from "./index.js";
import { getRelayerAccount } from "./signer.js";
import { loadRegistry } from "./registry.js";
import { getPaymasterConfig } from "./paymaster.js";

async function main() {
  const [, , cmd, arg] = process.argv;
  switch (cmd) {
    case "once": {
      const service = createRelayerService();
      const result = await service.tick();
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    case "loop": {
      const intervalSec = Math.max(2, Number(arg ?? 15));
      const service = createRelayerService();
      console.log(`[relayer-cli] looping every ${intervalSec}s — ctrl-c to exit`);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await service.tick();
        console.log(
          `[relayer-cli] ${new Date().toISOString()} scanned=${r.scanned} anchored=${r.anchored} skipped=${r.skipped} failed=${r.failed}`,
        );
        await new Promise((res) => setTimeout(res, intervalSec * 1000));
      }
    }
    case "identity": {
      const acct = getRelayerAccount();
      const registry = loadRegistry();
      const paymaster = getPaymasterConfig();
      console.log(
        JSON.stringify(
          {
            attester: acct.address,
            paymaster,
            registry,
            env: {
              UMBRELLA_WEB_BASE_URL: process.env.UMBRELLA_WEB_BASE_URL ?? null,
              BASE_RPC_URL: process.env.BASE_RPC_URL ? "set" : null,
              BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL
                ? "set"
                : null,
              UMBRELLA_RELAYER_SECRET: process.env.UMBRELLA_RELAYER_SECRET
                ? "set"
                : null,
            },
          },
          null,
          2,
        ),
      );
      return;
    }
    default:
      console.error(
        "usage: tsx src/services/relayer/cli.ts <once | loop [intervalSec] | identity>",
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
