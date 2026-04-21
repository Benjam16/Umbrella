import { listUnanchoredCompletedRuns } from "@umbrella/runner/supervisor";
import { verifyRelayerSecret } from "@/lib/relayer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/relayer/pending
 *
 * Platform-only endpoint. Returns completed runs (`succeeded` | `failed`)
 * that have not yet been anchored on-chain, most-recent-first.
 *
 * Auth: `Authorization: Bearer ${UMBRELLA_RELAYER_SECRET}`.
 */
export async function GET(req: Request) {
  const auth = verifyRelayerSecret(req.headers);
  if (!auth.ok) {
    return Response.json(
      { error: "unauthorized", reason: auth.reason },
      { status: auth.reason === "missing_config" ? 503 : 401 },
    );
  }

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 25) || 25));
  const runs = await listUnanchoredCompletedRuns(limit);
  return Response.json({ runs, count: runs.length });
}
