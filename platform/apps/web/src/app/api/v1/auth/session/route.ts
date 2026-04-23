import { z } from "zod";
import {
  createWalletSession,
  readWalletSessionFromCookie,
  verifyAuthChallenge,
  walletSessionCookie,
} from "@/lib/wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  message: z.string().min(10),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  challengeToken: z.string().min(10),
});

export async function GET(req: Request) {
  const wallet = readWalletSessionFromCookie(req.headers.get("cookie"));
  return Response.json({ ok: true, wallet });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });
  const p = parsed.data;
  try {
    const ok = await verifyAuthChallenge({
      wallet: p.walletAddress,
      message: p.message,
      signature: p.signature,
      challengeToken: p.challengeToken,
    });
    if (!ok) return Response.json({ error: "signature verification failed" }, { status: 401 });
    const session = createWalletSession(p.walletAddress);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": walletSessionCookie(session),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "session failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

