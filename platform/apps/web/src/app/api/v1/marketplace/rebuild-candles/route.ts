import { z } from "zod";
import { verifyRelayerSecret } from "@/lib/relayer-auth";
import { rebuildCandlesFromTrades } from "@/lib/market-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  hookId: z.string().uuid(),
});

/**
 * POST /api/v1/marketplace/rebuild-candles
 *
 * Utility endpoint for relayer/backfill jobs: recompute all 1m candles for a
 * hook from `market_trades`.
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
    const out = await rebuildCandlesFromTrades(parsed.data.hookId);
    return Response.json({ ok: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rebuild failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

