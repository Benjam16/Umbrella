import { createRelayerService } from "./relayer/index.js";
import { createMarketSwapIndexer } from "./relayer/market-indexer.js";
import { createWebClient } from "./relayer/client.js";

/**
 * Long-lived RelayerService loop. Drains pending (unanchored) completed
 * runs on a fixed interval.
 *
 * Disable with `UMBRELLA_RELAYER_ENABLED=false`. Tune the cadence with
 * `UMBRELLA_RELAYER_INTERVAL_MS` (min 2s, default 15s).
 *
 * The service refuses to run when `UMBRELLA_RELAYER_SECRET` or
 * `UMBRELLA_WEB_BASE_URL` aren't configured — it needs both to talk to the
 * web app's protected endpoints.
 */
export function startRelayerWorker(): void {
  if (process.env.UMBRELLA_RELAYER_ENABLED === "false") return;
  if (!process.env.UMBRELLA_RELAYER_SECRET) {
    console.log(
      "[relayer] UMBRELLA_RELAYER_SECRET not set — worker disabled. Set it + UMBRELLA_WEB_BASE_URL to enable the Proof-of-Work bridge.",
    );
    return;
  }

  const intervalMs = Math.max(
    2_000,
    Number(process.env.UMBRELLA_RELAYER_INTERVAL_MS ?? 15_000),
  );
  const service = createRelayerService();
  const webClient = createWebClient();
  const marketIndexer = createMarketSwapIndexer(webClient);

  let running = false;
  const tick = async () => {
    if (running) return; // skip overlapping ticks
    running = true;
    try {
      const result = await service.tick();
      const market = await marketIndexer.tick();
      if (result.anchored > 0 || result.failed > 0) {
        console.log(
          `[relayer] tick · scanned=${result.scanned} anchored=${result.anchored} skipped=${result.skipped} failed=${result.failed}`,
        );
        for (const item of result.items) {
          if (item.status === "failed") {
            console.warn(
              `[relayer]   ✗ ${item.runId} (${item.blueprintId}) — ${item.reason ?? "unknown"}`,
            );
          } else if (item.status === "anchored") {
            console.log(
              `[relayer]   ✓ ${item.runId} (${item.blueprintId}) tx=${item.txHash}${
                item.simulated ? " [simulated]" : ""
              }`,
            );
          }
        }
      }
      if (market.emittedTrades > 0) {
        console.log(
          `[relayer] market-indexer · targets=${market.scannedTargets} emittedTrades=${market.emittedTrades}`,
        );
      }
    } catch (err) {
      console.error(
        "[relayer] tick crashed:",
        err instanceof Error ? err.message : err,
      );
    } finally {
      running = false;
    }
  };

  console.log(
    `[relayer] worker started · interval=${intervalMs}ms · web=${process.env.UMBRELLA_WEB_BASE_URL ?? "http://localhost:3040"}`,
  );
  void tick();
  setInterval(tick, intervalMs);
}
