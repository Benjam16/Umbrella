type MarketTradePayload = {
  hookId: string;
  side: "buy" | "sell";
  priceUsd: number;
  sizeUsd: number;
  tradedAt?: string;
  txHash?: string;
  blockNumber?: number;
};

/**
 * Bridge API-side indexer/webhook events into the web app's market ingest API.
 * Uses the same relayer bearer secret model as other protected web routes.
 */
export async function postMarketTradesToWeb(
  trades: MarketTradePayload[],
): Promise<{ ok: boolean; insertedTrades?: number; upsertedCandles?: number; error?: string }> {
  if (trades.length === 0) return { ok: true, insertedTrades: 0, upsertedCandles: 0 };
  const baseUrl =
    process.env.UMBRELLA_WEB_BASE_URL?.replace(/\/+$/, "") ??
    "http://localhost:3040";
  const secret = process.env.UMBRELLA_RELAYER_SECRET?.trim();
  if (!secret) {
    return { ok: false, error: "UMBRELLA_RELAYER_SECRET not set" };
  }
  const res = await fetch(`${baseUrl}/api/v1/marketplace/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ trades }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `http ${res.status} ${text}` };
  }
  const body = (await res.json()) as {
    insertedTrades?: number;
    upsertedCandles?: number;
  };
  return {
    ok: true,
    insertedTrades: body.insertedTrades ?? 0,
    upsertedCandles: body.upsertedCandles ?? 0,
  };
}

