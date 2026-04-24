import { z } from "zod";
import { verifyPaymentFromWebhook } from "@/lib/forge-hooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  chainId: z.number().int().positive().optional(),
});

/**
 * POST /api/v1/forge/verify-payment
 *
 * Verifies an on-chain fee payment against the configured forge chain/treasury.
 * Defaults to `UMBRELLA_FORGE_CHAIN_ID` when `chainId` is omitted.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });

  const defaultChainId = Number(process.env.UMBRELLA_FORGE_CHAIN_ID?.trim() ?? "84532");
  const chainId = parsed.data.chainId ?? defaultChainId;

  try {
    const payment = await verifyPaymentFromWebhook({ txHash: parsed.data.txHash }, { chainId });
    return Response.json({
      ok: true,
      chainId,
      payment: {
        txHash: payment.txHash,
        from: payment.from,
        to: payment.to,
        valueWei: payment.value.toString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "payment verification failed";
    return Response.json({ error: message }, { status: 400 });
  }
}

