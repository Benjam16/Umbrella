"use client";

import { useEffect } from "react";
import { markLaunchReady, usePendingLaunches } from "@/lib/recent-launches";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { WorkspaceAgentCard } from "@/components/app/WorkspaceAgentCard";

/**
 * Instant Workspace Replay.
 *
 * Mounted on /app/workspace so that when a user finishes the Forge wizard we
 * have an immediate, visible artifact in the engine room — even before the
 * Kimi response and Supabase insert land. A pending launch starts as
 * "Initializing..." and flips to "Ready" the moment Supabase Realtime streams
 * the matching `generated_hooks` row in.
 */
export function LaunchReplayPanel() {
  const launches = usePendingLaunches();

  useEffect(() => {
    if (launches.length === 0) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channels = launches
      .filter((l) => l.status !== "ready")
      .map((l) => {
        const channel = supabase
          .channel(`launch-replay-${l.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "generated_hooks",
              filter: `wallet_address=eq.${l.walletAddress.toLowerCase()}`,
            },
            (payload) => {
              const row = payload.new as { id?: string; model?: string };
              markLaunchReady(l.id, {
                hookId: row?.id,
                model: row?.model,
              });
            },
          )
          .subscribe();
        return channel;
      });

    return () => {
      for (const ch of channels) void supabase.removeChannel(ch);
    };
  }, [launches]);

  if (launches.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            Instant Replay · New Launches
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Your freshly minted agents are booting in the engine room.
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {launches.length} active
        </span>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {launches.map((launch) => (
          <WorkspaceAgentCard key={launch.id} launch={launch} />
        ))}
      </ul>
    </section>
  );
}
