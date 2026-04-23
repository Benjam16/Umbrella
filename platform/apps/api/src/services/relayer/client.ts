import type { OnchainAnchor, RunEvent, RunRecord } from "@umbrella/runner/types";

/**
 * HTTP client the relayer uses to talk to the Next.js web app. All calls go
 * through Authorization: Bearer ${UMBRELLA_RELAYER_SECRET} — that's a
 * platform-level identity, distinct from user sessions.
 *
 * Pointing at a different deployment? Set UMBRELLA_WEB_BASE_URL.
 */
export type WebClient = {
  listPending: (limit?: number) => Promise<RunRecord[]>;
  loadRunWithEvents: (
    runId: string,
  ) => Promise<{ run: RunRecord; events: RunEvent[] } | null>;
  postAnchor: (
    runId: string,
    anchor: Omit<OnchainAnchor, "runId" | "anchoredAt">,
  ) => Promise<{ anchor: OnchainAnchor; duplicate: boolean }>;
  postMarketTrades: (
    trades: Array<{
      hookId?: string;
      tokenAddress?: string;
      side: "buy" | "sell";
      priceUsd: number;
      sizeUsd: number;
      tradedAt?: string;
      txHash?: string;
      blockNumber?: number;
    }>,
  ) => Promise<{ ok: boolean; insertedTrades: number; upsertedCandles: number }>;
};

export function createWebClient(): WebClient {
  const baseUrl =
    process.env.UMBRELLA_WEB_BASE_URL?.replace(/\/+$/, "") ??
    "http://localhost:3040";
  const secret = process.env.UMBRELLA_RELAYER_SECRET;

  const authHeaders: HeadersInit = secret
    ? { Authorization: `Bearer ${secret}` }
    : {};

  async function listPending(limit = 25): Promise<RunRecord[]> {
    if (!secret) {
      throw new Error(
        "UMBRELLA_RELAYER_SECRET not set — cannot call protected /relayer/pending",
      );
    }
    const res = await fetch(
      `${baseUrl}/api/v1/relayer/pending?limit=${limit}`,
      { headers: authHeaders },
    );
    if (!res.ok) {
      throw new Error(`listPending: http ${res.status}`);
    }
    const body = (await res.json()) as { runs: RunRecord[] };
    return body.runs;
  }

  async function loadRunWithEvents(runId: string) {
    const res = await fetch(`${baseUrl}/api/v1/runs/${runId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`loadRun(${runId}): http ${res.status}`);
    return (await res.json()) as { run: RunRecord; events: RunEvent[] };
  }

  async function postAnchor(
    runId: string,
    anchor: Omit<OnchainAnchor, "runId" | "anchoredAt">,
  ) {
    if (!secret) {
      throw new Error("UMBRELLA_RELAYER_SECRET not set — cannot POST anchor");
    }
    const res = await fetch(`${baseUrl}/api/v1/runs/${runId}/anchor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify(anchor),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`postAnchor(${runId}): http ${res.status} ${text}`);
    }
    return (await res.json()) as {
      anchor: OnchainAnchor;
      duplicate: boolean;
    };
  }

  async function postMarketTrades(
    trades: Array<{
      hookId?: string;
      tokenAddress?: string;
      side: "buy" | "sell";
      priceUsd: number;
      sizeUsd: number;
      tradedAt?: string;
      txHash?: string;
      blockNumber?: number;
    }>,
  ) {
    if (!secret) {
      throw new Error("UMBRELLA_RELAYER_SECRET not set — cannot POST market ingest");
    }
    const res = await fetch(`${baseUrl}/api/v1/marketplace/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ trades }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`postMarketTrades: http ${res.status} ${text}`);
    }
    return (await res.json()) as {
      ok: boolean;
      insertedTrades: number;
      upsertedCandles: number;
    };
  }

  return { listPending, loadRunWithEvents, postAnchor, postMarketTrades };
}
