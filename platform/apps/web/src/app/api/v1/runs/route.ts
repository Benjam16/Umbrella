import { z } from "zod";
import { listRunsForOwner, startRun } from "@umbrella/runner/supervisor";
import { ensureOwner, ownerOwnsNode } from "@/lib/node-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  blueprintId: z.string().min(1),
  goal: z.string().max(280).optional(),
  inputs: z.record(z.string(), z.string()).default({}),
  riskThreshold: z.number().int().min(1).max(10).optional(),
  mode: z.enum(["cloud", "remote"]).default("cloud"),
  // Human-readable id of the paired node to dispatch to (required when
  // mode=remote; ignored otherwise).
  nodeId: z.string().min(1).optional(),
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

  // `ensureOwner()` reads (and mints if needed) the umbrella_owner cookie.
  // That's the identity we pin the run to, so the /app/runs history works
  // across reloads for the same browser.
  const owner = await ensureOwner();

  // Remote mode requires a paired node the caller actually owns.
  if (parsed.data.mode === "remote") {
    if (!parsed.data.nodeId) {
      return Response.json(
        { error: "nodeId required for mode=remote" },
        { status: 400 },
      );
    }
    const owns = await ownerOwnsNode(owner, parsed.data.nodeId);
    if (!owns) {
      return Response.json(
        { error: "node not paired to this browser" },
        { status: 403 },
      );
    }
  }

  const result = await startRun({
    blueprintId: parsed.data.blueprintId,
    goal: parsed.data.goal,
    inputs: parsed.data.inputs,
    riskThreshold: parsed.data.riskThreshold,
    mode: parsed.data.mode,
    targetNodeId: parsed.data.mode === "remote" ? parsed.data.nodeId : null,
    ownerFingerprint: owner,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(
    {
      run: result.run,
      eventsUrl: `/api/v1/runs/${result.run.id}/events`,
    },
    { status: 201 },
  );
}

/**
 * Owner-scoped list of the current browser's runs (most recent first).
 * Cookie-gated; returns [] when no cookie is present yet.
 */
export async function GET() {
  const owner = await ensureOwner();
  const runs = await listRunsForOwner(owner, 50);
  return Response.json({ runs });
}
