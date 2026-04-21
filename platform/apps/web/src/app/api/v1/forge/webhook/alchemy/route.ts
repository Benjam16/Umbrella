import { z } from "zod";
import {
  generateHookWithKimi,
  insertGeneratedHook,
  verifyAlchemySignature,
  verifyPaymentFromWebhook,
} from "@/lib/forge-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  prompt: z.string().min(1).max(64_000).optional(),
});

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-alchemy-signature");
  if (!verifyAlchemySignature(raw, sig)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  const prompt =
    parsed.success && parsed.data.prompt
      ? parsed.data.prompt
      : "Generate a secure Uniswap v4 hook contract for protocol fee sharing and creator registration on Base.";

  try {
    const payment = await verifyPaymentFromWebhook(payload);
    const generated = await generateHookWithKimi(prompt);
    const row = await insertGeneratedHook({
      walletAddress: payment.from,
      txHash: payment.txHash,
      chainId: 8453,
      prompt,
      solidityCode: generated.code,
      model: generated.model,
    });
    return Response.json(
      {
        ok: true,
        id: row.id,
        walletAddress: row.wallet_address,
        txHash: row.tx_hash,
        createdAt: row.created_at,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "forge webhook failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

