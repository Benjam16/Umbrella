import type { OnchainAnchor, RunRecord } from "@umbrella/runner/types";
import { buildProofOfSuccess } from "./proof.js";
import { signProof } from "./signer.js";
import { writeRecordSuccess } from "./chain.js";
import { resolveTokenForBlueprint } from "./registry.js";
import { createWebClient, type WebClient } from "./client.js";

/**
 * The RelayerService — the "Proof-of-Work Bridge" between the off-chain
 * mission supervisor and the on-chain AgentToken economy.
 *
 * Shape of a single tick:
 *   1. Ask the web for unanchored completed runs.
 *   2. For each run, pull its event log.
 *   3. Resolve blueprint → AgentToken (skip if not registered).
 *   4. Build ProofOfSuccess (deterministic, replayable).
 *   5. Sign the proof with the relayer key.
 *   6. Broadcast recordSuccess() — sponsored by Paymaster when configured.
 *   7. POST the anchor back to the web so SSE/UI pick it up.
 *
 * The service is idempotent: postAnchor() returns `duplicate: true` if the
 * web already has an anchor for that run, so a crash mid-tick just retries
 * cleanly next loop.
 */
export type RelayerService = {
  tick(): Promise<RelayerTickResult>;
};

export type RelayerTickResult = {
  scanned: number;
  anchored: number;
  skipped: number;
  failed: number;
  /** Per-run details for logging. */
  items: Array<{
    runId: string;
    blueprintId: string;
    status: "anchored" | "skipped" | "failed" | "duplicate";
    reason?: string;
    txHash?: string;
    simulated?: boolean;
  }>;
};

export type RelayerServiceOptions = {
  client?: WebClient;
  /** How many pending runs to drain per tick. */
  batchSize?: number;
};

export function createRelayerService(
  opts: RelayerServiceOptions = {},
): RelayerService {
  const client = opts.client ?? createWebClient();
  const batchSize = opts.batchSize ?? 15;

  async function tick(): Promise<RelayerTickResult> {
    const result: RelayerTickResult = {
      scanned: 0,
      anchored: 0,
      skipped: 0,
      failed: 0,
      items: [],
    };

    let pending: RunRecord[];
    try {
      pending = await client.listPending(batchSize);
    } catch (err) {
      // Relayer can't reach the web — surface loudly; next tick will retry.
      console.error(
        "[relayer] listPending failed:",
        err instanceof Error ? err.message : err,
      );
      return result;
    }

    result.scanned = pending.length;
    for (const run of pending) {
      try {
        const item = await processRun(run, client);
        result.items.push(item);
        if (item.status === "anchored" || item.status === "duplicate") {
          result.anchored += 1;
        } else if (item.status === "skipped") {
          result.skipped += 1;
        } else {
          result.failed += 1;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[relayer] run ${run.id} failed:`, reason);
        result.failed += 1;
        result.items.push({
          runId: run.id,
          blueprintId: run.blueprintId,
          status: "failed",
          reason,
        });
      }
    }

    return result;
  }

  return { tick };
}

async function processRun(
  run: RunRecord,
  client: WebClient,
): Promise<RelayerTickResult["items"][number]> {
  const tokenEntry = resolveTokenForBlueprint(run.blueprintId);
  if (!tokenEntry) {
    return {
      runId: run.id,
      blueprintId: run.blueprintId,
      status: "skipped",
      reason: "no AgentToken registered for this blueprint",
    };
  }

  const detail = await client.loadRunWithEvents(run.id);
  if (!detail) {
    return {
      runId: run.id,
      blueprintId: run.blueprintId,
      status: "skipped",
      reason: "run disappeared before we could load events",
    };
  }

  const proof = buildProofOfSuccess(detail.run, detail.events);
  const { digest, signature, attester, struct } = await signProof(
    proof,
    tokenEntry.tokenAddress,
    tokenEntry.chainId,
  );
  const chainWrite = await writeRecordSuccess(
    tokenEntry.tokenAddress,
    tokenEntry.chainId,
    proof,
    struct,
    digest,
    signature,
  );

  const anchorInput: Omit<OnchainAnchor, "runId" | "anchoredAt"> = {
    tokenAddress: tokenEntry.tokenAddress,
    chainId: tokenEntry.chainId,
    txHash: chainWrite.txHash,
    attester,
    signature,
    paymasterSponsored: chainWrite.paymasterSponsored,
    proof,
  };

  const posted = await client.postAnchor(run.id, anchorInput);
  return {
    runId: run.id,
    blueprintId: run.blueprintId,
    status: posted.duplicate ? "duplicate" : "anchored",
    txHash: chainWrite.txHash,
    simulated: chainWrite.simulated,
    reason: chainWrite.simulated ? chainWrite.reason : undefined,
  };
}
