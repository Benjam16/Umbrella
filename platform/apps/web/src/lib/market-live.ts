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

export type MarketTradeIngest = {
  hookId?: string;
  tokenAddress?: string;
  side: "buy" | "sell";
  priceUsd: number;
  sizeUsd: number;
  chainId?: number;
  logIndex?: number;
  idempotencyKey?: string;
  tradedAt?: string;
  txHash?: string;
  blockNumber?: number;
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

/**
 * Ingest one or more on-chain trades and incrementally maintain 1m candles.
 * This is designed for relayer/indexer workers posting verified swap events.
 */
export async function ingestMarketTrades(trades: MarketTradeIngest[]): Promise<{
  insertedTrades: number;
  upsertedCandles: number;
}> {
  if (trades.length === 0) return { insertedTrades: 0, upsertedCandles: 0 };
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("supabase not configured");

  const rows: Array<{
    hook_id: string;
    side: "buy" | "sell";
    price_usd: number;
    size_usd: number;
    source_chain_id: number | null;
    log_index: number | null;
    idempotency_key: string | null;
    tx_hash: string | null;
    block_number: number | null;
    traded_at: string;
  }> = [];
  for (const t of trades) {
    const hookId =
      t.hookId ??
      (t.tokenAddress ? await resolveHookIdForTokenAddress(t.tokenAddress) : null);
    if (!hookId) continue;
    rows.push({
      hook_id: hookId,
      side: t.side,
      price_usd: t.priceUsd,
      size_usd: t.sizeUsd,
      source_chain_id: t.chainId ?? null,
      log_index: Number.isInteger(t.logIndex) ? t.logIndex! : null,
      idempotency_key:
        t.idempotencyKey ??
        buildIdempotencyKey({
          hookId,
          chainId: t.chainId ?? null,
          txHash: t.txHash ?? null,
          logIndex: Number.isInteger(t.logIndex) ? t.logIndex! : null,
          side: t.side,
          tradedAt: t.tradedAt ?? null,
        }),
      tx_hash: t.txHash ?? null,
      block_number: t.blockNumber ?? null,
      traded_at: t.tradedAt ? new Date(t.tradedAt).toISOString() : new Date().toISOString(),
    });
  }
  if (rows.length === 0) return { insertedTrades: 0, upsertedCandles: 0 };

  const { data: inserted, error: insertError } = await supabase
    .from("market_trades")
    .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("hook_id, price_usd, size_usd, traded_at");
  if (insertError) throw new Error(insertError.message);

  let upsertedCandles = 0;
  for (const r of (inserted ?? []) as Array<{
    hook_id: string;
    price_usd: number | string;
    size_usd: number | string;
    traded_at: string;
  }>) {
    const price = Number(r.price_usd);
    const size = Number(r.size_usd);
    const bucket = minuteBucketIso(r.traded_at);
    const { data: existing, error: readErr } = await supabase
      .from("market_candles_1m")
      .select("open, high, low, close, volume_usd, trades_count")
      .eq("hook_id", r.hook_id)
      .eq("bucket", bucket)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    if (!existing) {
      const { error: upsertErr } = await supabase.from("market_candles_1m").upsert({
        hook_id: r.hook_id,
        bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume_usd: size,
        trades_count: 1,
        updated_at: new Date().toISOString(),
      });
      if (upsertErr) throw new Error(upsertErr.message);
      upsertedCandles += 1;
      continue;
    }

    const next = {
      open: Number(existing.open),
      high: Math.max(Number(existing.high), price),
      low: Math.min(Number(existing.low), price),
      close: price,
      volume_usd: Number(existing.volume_usd) + size,
      trades_count: Number(existing.trades_count) + 1,
      updated_at: new Date().toISOString(),
    };
    const { error: updateErr } = await supabase
      .from("market_candles_1m")
      .update(next)
      .eq("hook_id", r.hook_id)
      .eq("bucket", bucket);
    if (updateErr) throw new Error(updateErr.message);
    upsertedCandles += 1;
  }

  return { insertedTrades: inserted?.length ?? rows.length, upsertedCandles };
}

function buildIdempotencyKey(args: {
  hookId: string;
  chainId: number | null;
  txHash: string | null;
  logIndex: number | null;
  side: "buy" | "sell";
  tradedAt: string | null;
}): string {
  if (args.txHash) {
    const chain = args.chainId ?? 0;
    const idx = args.logIndex ?? -1;
    return `${args.hookId}:${chain}:${args.txHash.toLowerCase()}:${idx}:${args.side}`;
  }
  return `${args.hookId}:ts:${args.tradedAt ?? "na"}:${args.side}`;
}

export async function rebuildCandlesFromTrades(hookId: string): Promise<{
  candles: number;
}> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("supabase not configured");
  const { data: trades, error } = await supabase
    .from("market_trades")
    .select("price_usd, size_usd, traded_at")
    .eq("hook_id", hookId)
    .order("traded_at", { ascending: true });
  if (error) throw new Error(error.message);

  const buckets = new Map<
    string,
    { open: number; high: number; low: number; close: number; volume: number; count: number }
  >();
  for (const t of (trades ?? []) as Array<{
    price_usd: number | string;
    size_usd: number | string;
    traded_at: string;
  }>) {
    const price = Number(t.price_usd);
    const size = Number(t.size_usd);
    const bucket = minuteBucketIso(t.traded_at);
    const prev = buckets.get(bucket);
    if (!prev) {
      buckets.set(bucket, {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: size,
        count: 1,
      });
    } else {
      prev.high = Math.max(prev.high, price);
      prev.low = Math.min(prev.low, price);
      prev.close = price;
      prev.volume += size;
      prev.count += 1;
    }
  }

  const rows = Array.from(buckets.entries()).map(([bucket, c]) => ({
    hook_id: hookId,
    bucket,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume_usd: c.volume,
    trades_count: c.count,
    updated_at: new Date().toISOString(),
  }));
  const { error: upsertErr } = await supabase.from("market_candles_1m").upsert(rows);
  if (upsertErr) throw new Error(upsertErr.message);
  return { candles: rows.length };
}

function minuteBucketIso(ts: string): string {
  const d = new Date(ts);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

async function resolveHookIdForTokenAddress(tokenAddress: string): Promise<string | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const normalized = tokenAddress.toLowerCase();
  const { data, error } = await supabase
    .from("generated_hooks")
    .select("id")
    .eq("token_address", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

