import { ensureOwner, unpairNode } from "@/lib/node-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser → server. Unpairs a node (deletes the row). Scoped to the owner
 * cookie so you can only remove your own.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;
  if (!nodeId) return Response.json({ error: "missing nodeId" }, { status: 400 });
  const owner = await ensureOwner();
  const removed = await unpairNode(owner, nodeId);
  if (!removed) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, nodeId });
}
