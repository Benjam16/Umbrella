import { z } from "zod";
import { createAuthChallenge } from "@/lib/wallet-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid walletAddress" }, { status: 400 });
  try {
    const challenge = createAuthChallenge(parsed.data.walletAddress);
    return Response.json(challenge);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed to create challenge";
    return Response.json({ error: message }, { status: 500 });
  }
}

