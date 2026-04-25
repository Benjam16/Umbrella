import { createPublicClient, http, type Address } from "viem";

import { listPublicHooks } from "@/lib/forge-hooks";
import { getPersistedLiveMarket } from "@/lib/market-live";
import { bondingCurveAbi } from "@/lib/launch/abi";
import { getLaunchConfig } from "@/lib/launch/chain-config";
import { getServerSupabase } from "@umbrella/runner/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/marketplace/:agentId/live
 *
 * Returns a token-profile-friendly payload (price, spark window, tape) for
 * high-frequency polling from the token page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  if (!agentId) return Response.json({ error: "agent id required" }, { status: 400 });

  try {
    const rows = await listPublicHooks(200);
    const row = rows.find((r) => r.id === agentId);
    if (!row) return Response.json({ error: "not found" }, { status: 404 });
    const curveInfo = await readCurveInfo({
      curveAddress: row.curve_address ?? null,
      chainId: row.chain_id ?? null,
      stage: row.curve_stage ?? null,
    });
    const persisted = await getPersistedLiveMarket(agentId);
    if (persisted) {
      return Response.json(
        {
          id: row.id,
          symbol: inferSymbol(row.prompt, row.id),
          state: "live",
          live: {
            priceUsd: persisted.priceUsd,
            delta: persisted.delta,
            updatedAt: persisted.updatedAt,
          },
          spark: persisted.spark,
          tape: persisted.tape,
          curve: curveInfo,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const warmup = await getWarmupState(row.id, row.created_at);
    if (warmup) {
      return Response.json(
        {
          id: row.id,
          symbol: inferSymbol(row.prompt, row.id),
          state: "warmup",
          message: warmup.message,
          live: {
            priceUsd: warmup.priceUsd,
            delta: 0,
            updatedAt: Date.now(),
          },
          spark: warmup.spark,
          tape: warmup.tape,
          curve: curveInfo,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      {
        id: row.id,
        symbol: inferSymbol(row.prompt, row.id),
        state: "warmup",
        message: "Awaiting first on-chain event",
        live: {
          priceUsd: 0,
          delta: 0,
          updatedAt: Date.now(),
        },
        spark: [],
        tape: [],
        curve: curveInfo,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "live feed failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

function inferSymbol(prompt: string | null, id: string): string {
  if (!prompt) return id.slice(0, 4).toUpperCase();
  const match = prompt.match(/\b(?:Agent|Symbol|Ticker)\s*[:\-]\s*([A-Za-z0-9]{2,8})/i);
  if (match?.[1]) return match[1].toUpperCase().slice(0, 8);
  const word = prompt.match(/\b[A-Za-z]{3,8}\b/)?.[0];
  return (word ?? id.slice(0, 4)).toUpperCase().slice(0, 8);
}

async function readCurveInfo(args: {
  curveAddress: string | null;
  chainId: number | null;
  stage: string | null;
}): Promise<{
  address: string | null;
  chainId: number | null;
  stage: "pending" | "deploying" | "active" | "graduated" | "failed";
  ethReserveWei: string;
  graduationThresholdWei: string;
  progress: number;
} | null> {
  const normalizedStage = normalizeStage(args.stage);
  if (!args.curveAddress || !/^0x[a-fA-F0-9]{40}$/.test(args.curveAddress)) {
    return {
      address: null,
      chainId: args.chainId,
      stage: normalizedStage,
      ethReserveWei: "0",
      graduationThresholdWei: "0",
      progress: 0,
    };
  }
  try {
    const config = getLaunchConfig(args.chainId ?? undefined);
    const client = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
    const [reserve, threshold] = (await Promise.all([
      client.readContract({
        address: args.curveAddress as Address,
        abi: bondingCurveAbi,
        functionName: "ethReserve",
      }),
      client.readContract({
        address: args.curveAddress as Address,
        abi: bondingCurveAbi,
        functionName: "graduationThresholdWei",
      }),
    ])) as [bigint, bigint];
    const progress = threshold > 0n ? Number((reserve * 10_000n) / threshold) / 100 : 0;
    return {
      address: args.curveAddress,
      chainId: config.chainId,
      stage: normalizedStage,
      ethReserveWei: reserve.toString(),
      graduationThresholdWei: threshold.toString(),
      progress: Math.min(100, Math.max(0, progress)),
    };
  } catch {
    return {
      address: args.curveAddress,
      chainId: args.chainId,
      stage: normalizedStage,
      ethReserveWei: "0",
      graduationThresholdWei: "0",
      progress: 0,
    };
  }
}

function normalizeStage(
  stage: string | null | undefined,
): "pending" | "deploying" | "active" | "graduated" | "failed" {
  if (stage === "deploying" || stage === "active" || stage === "graduated" || stage === "failed") {
    return stage;
  }
  return "pending";
}

async function getWarmupState(
  hookId: string,
  createdAtIso: string,
): Promise<{
  message: string;
  priceUsd: number;
  spark: Array<{ t: number; price: number }>;
  tape: Array<{ id: string; side: "BUY" | "SELL"; price: number; size: number; ts: number }>;
} | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;

  const [{ count, error: countErr }, { data: latestTrade, error: tradeErr }] = await Promise.all([
    supabase
      .from("market_trades")
      .select("id", { count: "exact", head: true })
      .eq("hook_id", hookId),
    supabase
      .from("market_trades")
      .select("id, side, price_usd, size_usd, traded_at")
      .eq("hook_id", hookId)
      .order("traded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countErr) throw new Error(countErr.message);
  if (tradeErr) throw new Error(tradeErr.message);

  const tradeCount = count ?? 0;
  const createdAt = new Date(createdAtIso).getTime();
  const isFresh = Number.isFinite(createdAt) && Date.now() - createdAt < 48 * 60 * 60 * 1000;

  if (tradeCount === 0 && !isFresh) return null;

  const trade = latestTrade as
    | {
        id: string;
        side: "buy" | "sell";
        price_usd: number | string;
        size_usd: number | string;
        traded_at: string;
      }
    | null;
  const price = trade ? Number(trade.price_usd) : 0;
  const ts = trade ? new Date(trade.traded_at).getTime() : Date.now();
  const tape = trade
    ? [
        {
          id: trade.id,
          side: trade.side === "buy" ? ("BUY" as const) : ("SELL" as const),
          price,
          size: Number(trade.size_usd),
          ts,
        },
      ]
    : [];

  return {
    message:
      tradeCount > 0
        ? "Indexer warm-up: finalizing first candle from live trades."
        : "Awaiting first on-chain event",
    priceUsd: Number.isFinite(price) ? price : 0,
    spark: price > 0 ? [{ t: ts, price }] : [],
    tape,
  };
}

