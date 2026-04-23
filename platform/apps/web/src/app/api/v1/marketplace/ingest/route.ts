import { z } from "zod";
import { verifyRelayerSecret } from "@/lib/relayer-auth";
import { ingestMarketTrades } from "@/lib/market-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tradeSchema = z.object({
  hookId: z.string().uuid().optional(),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  side: z.enum(["buy", "sell"]),
  priceUsd: z.number().positive(),
  sizeUsd: z.number().positive(),
  chainId: z.number().int().nonnegative().optional(),
  logIndex: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(220).optional(),
  tradedAt: z.string().datetime().optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  blockNumber: z.number().int().nonnegative().optional(),
});

const bodySchema = z.object({
  trades: z.array(tradeSchema).min(1).max(500),
}).refine((v) => v.trades.every((t) => !!t.hookId || !!t.tokenAddress), {
  message: "each trade requires hookId or tokenAddress",
});

/**
 * POST /api/v1/marketplace/ingest
 *
 * Relayer/indexer ingestion endpoint. Accepts verified swap prints, writes
 * `market_trades`, and incrementally maintains 1m candles.
 */
export async function POST(req: Request) {
  const auth = verifyRelayerSecret(req.headers);
  if (!auth.ok) {
    return Response.json(
      { error: "unauthorized", reason: auth.reason },
      { status: auth.reason === "missing_config" ? 503 : 401 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });

  try {
    const out = await ingestMarketTrades(parsed.data.trades);
    return Response.json({ ok: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

