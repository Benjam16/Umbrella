"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearLaunch,
  markLaunchVisibility,
  type PendingLaunch,
  type PendingLaunchStatus,
} from "@/lib/recent-launches";

type Props = {
  launch: PendingLaunch;
};

/**
 * A single agent card in the /app/workspace "Instant Replay" row.
 *
 * Shows the status chip (Initializing → Forging → Ready → Failed) and, when
 * the agent is Ready, reveals the "Broadcast to Marketplace" toggle that
 * flips `is_public` on the matching `generated_hooks` row.
 *
 * Persistence:
 *  - `launch.isPublic` mirrors the server row and is cached in localStorage
 *    via markLaunchVisibility, so the Public badge survives refresh.
 *  - On mount (when a hookId is known) we re-hydrate visibility from
 *    /api/v1/forge/hooks in case the user toggled it from another device.
 */
export function WorkspaceAgentCard({ launch }: Props) {
  const [broadcast, setBroadcast] = useState<boolean>(!!launch.isPublic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hookId = launch.hookId;
  const ready = launch.status === "ready";
  const canToggle = ready && !!hookId && !saving;

  // Keep local state in sync if another tab flipped the toggle.
  useEffect(() => {
    setBroadcast(!!launch.isPublic);
  }, [launch.isPublic]);

  // On first resolution of hookId, ask the API whether this row is already
  // public so the badge doesn't lie after a refresh.
  useEffect(() => {
    if (!ready || !hookId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/forge/hooks?wallet=${encodeURIComponent(launch.walletAddress.toLowerCase())}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          hooks?: Array<{ id: string; is_public: boolean }>;
        };
        const match = data.hooks?.find((h) => h.id === hookId);
        if (!match || cancelled) return;
        if (match.is_public !== broadcast) {
          setBroadcast(match.is_public);
          markLaunchVisibility(launch.id, match.is_public);
        }
      } catch {
        /* best-effort hydration */
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally omit `broadcast` so we don't chase our own tail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hookId, launch.id, launch.walletAddress]);

  const toggle = useCallback(async () => {
    if (!canToggle || !hookId) return;
    const next = !broadcast;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/forge/hooks/${hookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: launch.walletAddress,
          isPublic: next,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `http ${res.status}`);
      }
      setBroadcast(next);
      markLaunchVisibility(launch.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update visibility");
    } finally {
      setSaving(false);
    }
  }, [broadcast, canToggle, hookId, launch.id, launch.walletAddress]);

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
        <div className="flex shrink-0 items-center gap-1.5">
          {broadcast && ready && <PublicBadge />}
          <StatusChip status={launch.status} />
        </div>
      </div>

      <p className="line-clamp-2 text-xs text-zinc-400">{launch.prompt}</p>

      {ready && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-ink-900/50 px-2 py-1.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Broadcast to Marketplace
            </p>
            <p className="text-[11px] text-zinc-400">
              {broadcast
                ? "Public — others can discover and back this agent."
                : "Private — only visible in your workspace."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={!canToggle}
            aria-pressed={broadcast}
            aria-label="Toggle public broadcast"
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
              broadcast
                ? "border-signal-green/60 bg-signal-green/30"
                : "border-zinc-700 bg-zinc-800/70"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full transition ${
                broadcast
                  ? "translate-x-4 bg-signal-green"
                  : "translate-x-1 bg-zinc-300"
              }`}
            />
          </button>
        </div>
      )}

      {error && <p className="font-mono text-[10px] text-signal-red">{error}</p>}

      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
        <span>{launch.walletAddress.slice(0, 10)}…</span>
        {ready ? (
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

function PublicBadge() {
  return (
    <span
      title="Broadcast to Marketplace"
      className="flex items-center gap-1 rounded-full border border-signal-green/40 bg-signal-green/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-signal-green"
    >
      <span className="h-1 w-1 rounded-full bg-signal-green" />
      Public
    </span>
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
