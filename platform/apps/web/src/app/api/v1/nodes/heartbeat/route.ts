import {
  recordHeartbeat,
  toPublicNode,
  verifyBearerNode,
} from "@/lib/node-auth";
import { listPendingRunsForNode } from "@umbrella/runner/supervisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CLI → server. Proves the node controls its token by sending
 * `Authorization: Bearer <token>` + `X-Umbrella-Node-Id: <nodeId>`. The
 * server rehashes the token and compares to token_hash. Matching rows
 * get status=online + last_seen/heartbeat stamps.
 *
 * Returns the public view of the node (no token hash) so the CLI can
 * display something useful:
 *
 *   $ umbrella status
 *   ✓ online · paired to browser · last seen 2s ago
 */
export async function POST(req: Request) {
  const node = await verifyBearerNode(req.headers);
  if (!node) {
    return Response.json(
      { error: "unauthorized — bad token or unknown nodeId" },
      { status: 401 },
    );
  }

  if (!node.paired) {
    return Response.json(
      {
        ok: true,
        paired: false,
        node: toPublicNode(node),
        message:
          "Node announced but not yet paired. Paste the pairing code into /app/nodes.",
      },
      { status: 202 },
    );
  }

  const updated = await recordHeartbeat(node);

  // Drain dispatched work. The CLI calls `/claim` on any ids it wants to run;
  // uncontested by default since runs are tagged to a single node.
  const pending = await listPendingRunsForNode(node.nodeId);

  return Response.json({
    ok: true,
    paired: true,
    node: toPublicNode(updated),
    pendingRuns: pending.map((r) => ({
      id: r.id,
      blueprintId: r.blueprintId,
      goal: r.goal,
      inputs: r.inputs,
      riskThreshold: r.riskThreshold,
      createdAt: r.createdAt,
      claimUrl: `/api/v1/runs/${r.id}/claim`,
      eventsUrl: `/api/v1/runs/${r.id}/events`,
    })),
  });
}
