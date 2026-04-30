import { NextResponse } from "next/server";

import { getServerSupabase } from "@umbrella/runner/supabase";
import { listLaunchJobs } from "@/lib/launch/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/forge/launch/status/[hookId]
 *
 * Returns both the current `generated_hooks` row snapshot (curve_stage,
 * verified_at, deploy_error, …) and the ordered `launch_jobs` audit trail.
 * The wizard's LaunchStatusPanel polls this endpoint on a 2s interval to
 * render per-step progress + error messages.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ hookId: string }> },
) {
  const { hookId } = await context.params;
  if (!/^[0-9a-fA-F-]{32,40}$/.test(hookId)) {
    return NextResponse.json({ error: "invalid hook id" }, { status: 400 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("generated_hooks")
    .select(
      "id, wallet_address, chain_id, model, token_address, curve_address, hook_address, pool_address, curve_stage, verify_guid, verified_at, curve_verified_at, deploy_error, created_at",
    )
    .eq("id", hookId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
  }

  const jobs = await listLaunchJobs(hookId);
  return NextResponse.json({
    hook: data,
    jobs,
  });
}
