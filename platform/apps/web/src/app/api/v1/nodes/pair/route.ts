import { z } from "zod";
import { claimPairing, ensureOwner } from "@/lib/node-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser → server. The user pasted the 6-char pairing code from
 * `umbrella connect`; this route binds that announcement to the browser's
 * owner cookie. On success, the browser sees the node in `GET /api/v1/nodes`.
 */
const schema = z.object({
  pairingCode: z
    .string()
    .regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/i, "pairingCode must look like XXX-XXX"),
  label: z.string().max(64).optional(),
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

  const owner = await ensureOwner();
  const result = await claimPairing(
    parsed.data.pairingCode,
    owner,
    parsed.data.label,
  );

  if (!result.ok) {
    const status = result.error === "expired" ? 410 : result.error === "already_paired" ? 409 : 404;
    const msg =
      result.error === "expired"
        ? "Pairing code expired — run `umbrella connect --rotate` to mint a fresh one."
        : result.error === "already_paired"
          ? "This pairing code was already claimed by another browser."
          : "No pending pairing for that code. Did you run `umbrella connect`?";
    return Response.json({ error: msg, code: result.error }, { status });
  }

  return Response.json({ ok: true, node: result.node }, { status: 201 });
}
