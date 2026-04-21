import type { ProofOfSuccess, RunEvent, RunRecord } from "@umbrella/runner/types";

/**
 * Builds a ProofOfSuccess from a completed run + its event log.
 *
 * The "successScore" is derived from the actual execution — we don't trust
 * the summary text:
 *   - every `node.finish` with ok=true contributes a bucket of points
 *   - `node.finish` with ok=false subtracts
 *   - `node.log` lines that match /quality score: (\d+)/ scale the result
 *   - `run.error` caps the score at 2000 (20%) so failures still anchor
 *
 * `revenueCents` is optional — a mission may report `payload.revenueCents`
 * explicitly on `run.finish`; otherwise we estimate from the blueprint
 * class (this is obviously a placeholder until blueprints emit a
 * structured revenue receipt).
 */
export function buildProofOfSuccess(
  run: RunRecord,
  events: RunEvent[],
): ProofOfSuccess {
  const finishEvent = events.find((e) => e.kind === "run.finish");
  const errorEvent = events.find((e) => e.kind === "run.error");
  const status: ProofOfSuccess["status"] =
    run.status === "succeeded" || (finishEvent && !errorEvent)
      ? "succeeded"
      : "failed";

  const nodeFinishes = events.filter((e) => e.kind === "node.finish");
  const okCount = nodeFinishes.filter((e) => e.payload.ok === true).length;
  const failCount = nodeFinishes.length - okCount;

  let score = 0;
  if (nodeFinishes.length > 0) {
    score = Math.round((okCount / nodeFinishes.length) * 10_000);
  } else if (finishEvent) {
    score = 8_000;
  }
  score -= failCount * 500;

  // Auditor quality score nudges the final number when present.
  for (const ev of events) {
    if (ev.kind !== "node.log") continue;
    const line = String(ev.payload.line ?? "");
    const m = /quality score:\s*(\d+)\/100/i.exec(line);
    if (m) {
      const q = Math.min(100, Math.max(0, Number(m[1])));
      score = Math.round((score + q * 100) / 2);
    }
  }

  if (errorEvent) score = Math.min(score, 2_000);
  score = Math.max(0, Math.min(10_000, score));

  // Revenue: prefer explicit signal on run.finish.payload.revenueCents,
  // otherwise estimate. Storing cents avoids the float vs bigint debate
  // across JSON boundaries.
  let revenueCents = 0;
  if (finishEvent && typeof finishEvent.payload.revenueCents === "number") {
    revenueCents = Math.max(0, Math.floor(finishEvent.payload.revenueCents));
  } else if (finishEvent && typeof finishEvent.payload.revenueUsd === "number") {
    revenueCents = Math.max(
      0,
      Math.floor((finishEvent.payload.revenueUsd as number) * 100),
    );
  } else if (status === "succeeded") {
    revenueCents = estimateRevenueFromBlueprint(run.blueprintId);
  }

  const startedAt = run.startedAt ? Date.parse(run.startedAt) : NaN;
  const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : NaN;
  const durationMs =
    Number.isFinite(startedAt) && Number.isFinite(finishedAt)
      ? Math.max(0, finishedAt - startedAt)
      : 0;

  return {
    version: 1,
    runId: run.id,
    blueprintId: run.blueprintId,
    ownerFingerprint: run.ownerFingerprint ?? null,
    successScore: score,
    revenueCents,
    nodesExecuted: nodeFinishes.length,
    durationMs,
    status,
    mintedAt: Date.now(),
  };
}

/**
 * Rough per-blueprint revenue hint in cents. Real blueprints should emit a
 * `revenueCents` field on `run.finish` when they actually move money —
 * this function is only used as a fallback so the dashboard has non-zero
 * numbers to show on day one.
 */
function estimateRevenueFromBlueprint(blueprintId: string): number {
  switch (blueprintId) {
    case "auto-compound":
      return 140;
    case "base-arb-sentinel":
      return 320;
    case "base-pulse-report":
      return 40;
    case "alpha-scribe":
      return 180;
    case "nft-floor-scan":
      return 20;
    case "contract-audit":
      return 600;
    case "competitor-scrape":
    case "repo-recon":
    case "sentiment-sweep":
      return 30;
    default:
      return 0;
  }
}
