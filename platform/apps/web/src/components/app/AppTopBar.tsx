"use client";

import { useState } from "react";

type Props = {
  statusLabel?: string;
  statusTone?: "idle" | "running" | "success" | "error" | "blocked";
  runId?: string | null;
};

const TONE_CLASSES: Record<NonNullable<Props["statusTone"]>, string> = {
  idle: "bg-zinc-800 text-zinc-300",
  running: "bg-signal-blue/20 text-signal-blue",
  success: "bg-signal-green/20 text-signal-green",
  error: "bg-signal-red/20 text-signal-red",
  blocked: "bg-signal-amber/20 text-signal-amber",
};

/**
 * Thin top strip of the /app shell. Multi-tenant workspace switcher is
 * intentionally mocked in Phase 1 — the "Personal" entry is the only real
 * option. Swap for a real list when Supabase Auth lands.
 */
export function AppTopBar({ statusLabel = "Idle", statusTone = "idle", runId }: Props) {
  const [workspace, setWorkspace] = useState("Personal");

  return (
    <header className="flex h-14 items-center gap-3 border-b border-zinc-800/70 bg-ink-900/80 px-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          workspace
        </span>
        <select
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          className="rounded-md border border-zinc-800 bg-ink-950 px-2 py-1 font-mono text-[12px] text-zinc-200 outline-none focus:border-signal-blue"
        >
          <option>Personal</option>
          <option disabled>+ New workspace (coming soon)</option>
        </select>
      </div>

      <div className="ml-4 flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase ${TONE_CLASSES[statusTone]}`}
        >
          {statusLabel}
        </span>
        {runId && (
          <span className="font-mono text-[11px] text-zinc-500">
            run {runId.slice(0, 8)}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled
          className="rounded-md border border-zinc-800 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-500 disabled:cursor-not-allowed"
          title="Share link — coming soon"
        >
          share
        </button>
        <button
          type="button"
          disabled
          className="rounded-md border border-zinc-800 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-500 disabled:cursor-not-allowed"
          title="Deploy — coming soon"
        >
          deploy
        </button>
      </div>
    </header>
  );
}
