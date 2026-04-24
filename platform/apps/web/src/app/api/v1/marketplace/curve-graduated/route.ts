import { z } from "zod";
import { verifyRelayerSecret } from "@/lib/relayer-auth";
import { getServerSupabase } from "@umbrella/runner/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  hookId: z.string().uuid(),
  poolAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

/**
 * POST /api/v1/marketplace/curve-graduated
 *
 * Called by the relayer market indexer when it observes a `Graduated` event
 * on an `UmbrellaBondingCurve`. Flips `curve_stage` to `graduated` and
 * optionally stamps the new Uniswap v4 pool address.
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
  if (!parsed.success) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return Response.json({ error: "supabase not configured" }, { status: 503 });
  }

  const update: Record<string, unknown> = {
    curve_stage: "graduated",
    graduated_at: new Date().toISOString(),
  };
  if (parsed.data.poolAddress) update.pool_address = parsed.data.poolAddress;

  const { error } = await supabase
    .from("generated_hooks")
    .update(update)
    .eq("id", parsed.data.hookId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
