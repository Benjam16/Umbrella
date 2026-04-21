import { claimRun } from "@umbrella/runner/supervisor";
import { verifyBearerNode } from "@/lib/node-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/runs/:id/claim
 *
 * Called by the CLI (`umbrella serve` loop) to take ownership of a dispatched
 * run. Requires Bearer + X-Umbrella-Node-Id headers. Returns the full run plus
 * the planned DAG so the CLI can execute it locally and stream events back
 * through POST /events.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const node = await verifyBearerNode(req.headers);
  if (!node) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await claimRun(id, node.nodeId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(
    {
      run: result.run,
      plan: result.plan,
      blueprint: result.blueprint,
    },
    { status: 200 },
  );
}
