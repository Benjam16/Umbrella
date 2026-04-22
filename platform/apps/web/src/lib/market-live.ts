import { getServerSupabase } from "@umbrella/runner/supabase";

export type LivePrint = {
  id: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  ts: number;
};

export type LiveMarketPayload = {
  priceUsd: number;
  delta: number;
  spark: Array<{ t: number; price: number }>;
  tape: LivePrint[];
  updatedAt: number;
};

/**
 * Fetch real persisted market telemetry for a hook from Supabase market tables.
 * Returns null when no rows exist yet so callers can gracefully fall back.
 */
export async function getPersistedLiveMarket(hookId: string): Promise<LiveMarketPayload | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;

  const [candlesRes, tradesRes] = await Promise.all([
    supabase
      .from("market_candles_1m")
      .select("bucket, close")
      .eq("hook_id", hookId)
      .order("bucket", { ascending: true })
      .limit(180),
    supabase
      .from("market_trades")
      .select("id, side, price_usd, size_usd, traded_at")
      .eq("hook_id", hookId)
      .order("traded_at", { ascending: false })
      .limit(40),
  ]);

  if (candlesRes.error) throw new Error(candlesRes.error.message);
  if (tradesRes.error) throw new Error(tradesRes.error.message);

  const candleRows = (candlesRes.data ?? []) as Array<{ bucket: string; close: string | number }>;
  if (candleRows.length < 2) return null;
  const spark = candleRows.map((r) => ({
    t: new Date(r.bucket).getTime(),
    price: Number(r.close),
  }));
  const last = spark[spark.length - 1]!;
  const prev = spark[spark.length - 2]!;
  const delta = prev.price > 0 ? (last.price - prev.price) / prev.price : 0;

  const tape = ((tradesRes.data ?? []) as Array<{
    id: string;
    side: "buy" | "sell";
    price_usd: string | number;
    size_usd: string | number;
    traded_at: string;
  }>).map((t) => ({
    id: t.id,
    side: t.side === "buy" ? ("BUY" as const) : ("SELL" as const),
    price: Number(t.price_usd),
    size: Number(t.size_usd),
    ts: new Date(t.traded_at).getTime(),
  }));

  return {
    priceUsd: last.price,
    delta,
    spark,
    tape,
    updatedAt: Date.now(),
  };
}

