import { z } from "zod";
import { getServerSupabase } from "@umbrella/runner/supabase";
import { readWalletSessionFromCookie } from "@/lib/wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  hookId: z.string().uuid(),
  side: z.enum(["buy", "sell"]),
  amountUsd: z.number().positive(),
  tokenAmount: z.number().positive().optional(),
});

export async function POST(req: Request) {
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });
  const p = parsed.data;
  const sessionWallet = readWalletSessionFromCookie(req.headers.get("cookie"));
  if (!sessionWallet || sessionWallet !== p.walletAddress.toLowerCase()) {
    return Response.json({ error: "wallet auth required" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_trade_intents")
    .insert({
      wallet_address: p.walletAddress.toLowerCase(),
      hook_id: p.hookId,
      side: p.side,
      amount_usd: p.amountUsd,
      token_amount: p.tokenAmount ?? null,
      status: "queued",
    })
    .select("id")
    .single();
  if (error || !data) {
    return Response.json({ error: error?.message ?? "failed to save intent" }, { status: 500 });
  }
  return Response.json({ id: data.id });
}

export async function GET(req: Request) {
  const supabase = getServerSupabase();
  if (!supabase) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet")?.toLowerCase() ?? "";
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return Response.json({ error: "wallet query param required" }, { status: 400 });
  }
  const sessionWallet = readWalletSessionFromCookie(req.headers.get("cookie"));
  if (!sessionWallet || sessionWallet !== wallet) {
    return Response.json({ error: "wallet auth required" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("user_trade_intents")
    .select("id, hook_id, side, amount_usd, token_amount, status, tx_hash, created_at")
    .eq("wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ intents: data ?? [] });
}

