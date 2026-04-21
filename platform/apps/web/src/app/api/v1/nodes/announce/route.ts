import { z } from "zod";
import { announceNode } from "@/lib/node-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `umbrella connect` calls this. The CLI mints a token locally, hashes it,
 * and sends only the hash — the raw token never leaves the machine.
 *
 * The row created here is **pending** (paired=false, no owner). It becomes
 * a real node when someone claims the pairing code via POST /pair.
 */
const schema = z.object({
  nodeId: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9-]+$/i, "nodeId must be [a-z0-9-]"),
  pairingCode: z
    .string()
    .regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/, "pairingCode must look like XXX-XXX"),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/, "tokenHash must be sha256 hex"),
  hostname: z.string().max(255).optional().nullable(),
  label: z.string().max(64).optional().nullable(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const node = await announceNode({
      nodeId: parsed.data.nodeId,
      pairingCode: parsed.data.pairingCode,
      tokenHash: parsed.data.tokenHash,
      hostname: parsed.data.hostname ?? null,
      label: parsed.data.label ?? null,
    });
    return Response.json(
      {
        announced: true,
        nodeId: node.nodeId,
        pairingCode: node.pairingCode,
        expiresAt: node.pairingExpiresAt,
        pairUrl: "/app/nodes",
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "announce failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
