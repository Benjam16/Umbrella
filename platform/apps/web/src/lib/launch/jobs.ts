import { getServerSupabase } from "@umbrella/runner/supabase";

/**
 * Thin wrapper around the `launch_jobs` audit table. Each row represents one
 * step in the pump.fun-style launch flow; the orchestrator in `orchestrator.ts`
 * records progress here so the UI's LaunchStatusPanel can render timers and
 * error messages in real time.
 */

export type LaunchJobStep =
  | "verify_factory_tx"
  | "generate_hook"
  | "upload_source"
  | "deploy_mission_record"
  | "create_curve"
  | "mark_active"
  | "verify_basescan"
  | "verify_curve_basescan";

export type LaunchJobStatus = "pending" | "running" | "completed" | "failed";

export type LaunchJobRow = {
  id: string;
  hook_id: string | null;
  step: LaunchJobStep;
  status: LaunchJobStatus;
  error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function recordLaunchStep(args: {
  hookId: string | null;
  step: LaunchJobStep;
  status: LaunchJobStatus;
  payload?: Record<string, unknown>;
  error?: string | null;
}): Promise<LaunchJobRow | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const insert = {
    hook_id: args.hookId,
    step: args.step,
    status: args.status,
    payload: args.payload ?? {},
    error: args.error ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("launch_jobs")
    .insert(insert)
    .select("*")
    .single();
  if (error || !data) return null;
  return data as LaunchJobRow;
}

export async function listLaunchJobs(hookId: string): Promise<LaunchJobRow[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("launch_jobs")
    .select("*")
    .eq("hook_id", hookId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as LaunchJobRow[];
}

export async function updateHookRow(
  hookId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) return;
  await supabase.from("generated_hooks").update(patch).eq("id", hookId);
}
