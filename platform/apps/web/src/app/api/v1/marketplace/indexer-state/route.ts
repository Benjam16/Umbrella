import { z } from "zod";
import { getServerSupabase } from "@umbrella/runner/supabase";
import { verifyRelayerSecret } from "@/lib/relayer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().min(2).max(120),
  cursorBlock: z.number().int().nonnegative(),
  meta: z.record(z.any()).optional(),
});

/**
 * Relayer-only cursor state endpoint for market indexers.
 */
export async function GET(req: Request) {
  const auth = verifyRelayerSecret(req.headers);
  if (!auth.ok) {
    return Response.json(
      { error: "unauthorized", reason: auth.reason },
      { status: auth.reason === "missing_config" ? 503 : 401 },
    );
  }
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "id query param required" }, { status: 400 });

  const { data, error } = await supabase
    .from("market_indexer_state")
    .select("id, cursor_block, meta, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ id, cursorBlock: 0, meta: {}, updatedAt: null });
  return Response.json({
    id: data.id,
    cursorBlock: Number(data.cursor_block),
    meta: data.meta ?? {},
    updatedAt: data.updated_at,
  });
}

export async function POST(req: Request) {
  const auth = verifyRelayerSecret(req.headers);
  if (!auth.ok) {
    return Response.json(
      { error: "unauthorized", reason: auth.reason },
      { status: auth.reason === "missing_config" ? 503 : 401 },
    );
  }
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });
  const p = parsed.data;

  const { error } = await supabase.from("market_indexer_state").upsert({
    id: p.id,
    cursor_block: p.cursorBlock,
    meta: p.meta ?? {},
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

