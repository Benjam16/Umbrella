"use client";

import { useEffect } from "react";
import {
  clearLaunch,
  markLaunchReady,
  usePendingLaunches,
  type PendingLaunch,
  type PendingLaunchStatus,
} from "@/lib/recent-launches";
import { getBrowserSupabase } from "@/lib/supabase-browser";

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
          <LaunchCard key={launch.id} launch={launch} />
        ))}
      </ul>
    </section>
  );
}

function LaunchCard({ launch }: { launch: PendingLaunch }) {
  return (
    <li className="group flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-ink-950/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">
            {launch.name}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            ${launch.symbol} · {launch.category}
          </p>
        </div>
        <StatusChip status={launch.status} />
      </div>
      <p className="line-clamp-2 text-xs text-zinc-400">{launch.prompt}</p>
      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
        <span>{launch.walletAddress.slice(0, 10)}…</span>
        {launch.status === "ready" ? (
          <button
            type="button"
            onClick={() => clearLaunch(launch.id)}
            className="rounded-md border border-zinc-700 px-2 py-0.5 uppercase tracking-widest text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
          >
            Dismiss
          </button>
        ) : (
          <span>{relative(launch.createdAt)}</span>
        )}
      </div>
      {launch.status === "error" && launch.error && (
        <p className="font-mono text-[10px] text-signal-red">{launch.error}</p>
      )}
    </li>
  );
}

function StatusChip({ status }: { status: PendingLaunchStatus }) {
  const spec: Record<PendingLaunchStatus, { label: string; dot: string; text: string }> = {
    initializing: {
      label: "Initializing…",
      dot: "bg-signal-blue animate-pulse",
      text: "text-signal-blue",
    },
    generating: {
      label: "Forging code…",
      dot: "bg-signal-amber animate-pulse",
      text: "text-signal-amber",
    },
    ready: {
      label: "Ready",
      dot: "bg-signal-green",
      text: "text-signal-green",
    },
    error: {
      label: "Failed",
      dot: "bg-signal-red",
      text: "text-signal-red",
    },
  };
  const s = spec[status];
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-800 bg-ink-950/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function relative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
