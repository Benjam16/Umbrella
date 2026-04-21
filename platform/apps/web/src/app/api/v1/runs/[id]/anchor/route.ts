import { z } from "zod";
import { getAnchor, recordAnchor } from "@umbrella/runner/supervisor";
import { verifyRelayerSecret } from "@/lib/relayer-auth";
import type { OnchainAnchor, ProofOfSuccess } from "@umbrella/runner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proofSchema = z.object({
  version: z.literal(1),
  runId: z.string().min(1),
  blueprintId: z.string().min(1),
  ownerFingerprint: z.string().nullable(),
  successScore: z.number().int().min(0).max(10_000),
  revenueCents: z.number().int().nonnegative(),
  nodesExecuted: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(["succeeded", "failed"]),
  mintedAt: z.number().int().positive(),
});

const anchorSchema = z.object({
  tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected EVM address"),
  chainId: z.number().int().positive(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32-byte tx hash"),
  attester: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected EVM address"),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "expected hex signature"),
  paymasterSponsored: z.boolean(),
  proof: proofSchema,
});

/**
 * POST /api/v1/runs/:id/anchor
 *
 * Relayer calls this after settling `recordSuccess()` on-chain. The payload
 * includes the signed proof + tx hash + chain id. We store the anchor and
 * emit a `run.onchain` event so the SSE subscribers (the replay page) pick
 * up the BaseScan link instantly.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = verifyRelayerSecret(req.headers);
  if (!auth.ok) {
    return Response.json(
      { error: "unauthorized", reason: auth.reason },
      { status: auth.reason === "missing_config" ? 503 : 401 },
    );
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = anchorSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid anchor payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Cross-check that the proof's runId matches the URL param — otherwise a
  // compromised relayer could anchor proofs to the wrong run.
  if (parsed.data.proof.runId !== id) {
    return Response.json(
      { error: "proof.runId does not match URL id" },
      { status: 400 },
    );
  }

  const proof: ProofOfSuccess = parsed.data.proof;
  const anchor: OnchainAnchor = {
    runId: id,
    tokenAddress: parsed.data.tokenAddress,
    chainId: parsed.data.chainId,
    txHash: parsed.data.txHash,
    attester: parsed.data.attester,
    signature: parsed.data.signature,
    paymasterSponsored: parsed.data.paymasterSponsored,
    proof,
    anchoredAt: new Date().toISOString(),
  };

  const result = await recordAnchor(id, anchor);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(
    { anchor: result.anchor, duplicate: result.duplicate },
    { status: result.duplicate ? 200 : 201 },
  );
}

/**
 * GET /api/v1/runs/:id/anchor
 *
 * Public read. Returns the anchor if one exists, 404 otherwise. The run
 * replay page polls this as a lightweight alternative to reading the event
 * stream for just the BaseScan link.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const anchor = getAnchor(id);
  if (!anchor) {
    return Response.json({ error: "not anchored" }, { status: 404 });
  }
  return Response.json({ anchor });
}
