import { ensureOwner, listNodesForOwner } from "@/lib/node-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser → server. Returns the list of nodes this browser (by owner cookie)
 * has paired. Source of truth for the /app/nodes page's live list.
 */
export async function GET() {
  const owner = await ensureOwner();
  const nodes = await listNodesForOwner(owner);
  return Response.json(
    { nodes },
    { headers: { "Cache-Control": "no-store" } },
  );
}
