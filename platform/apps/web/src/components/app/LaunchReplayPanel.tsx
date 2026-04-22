"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  markLaunchReady,
  usePendingLaunches,
  type PendingLaunch,
} from "@/lib/recent-launches";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { WorkspaceAgentCard } from "@/components/app/WorkspaceAgentCard";

type ServerHook = {
  id: string;
  wallet_address: string;
  model: string;
  prompt: string | null;
  is_public: boolean;
  created_at: string;
};

/**
 * "Your Agents" row in the workspace.
 *
 * Two data sources are merged here:
 *  1. Local optimistic pending launches (localStorage) — so the Forge → Workspace
 *     redirect shows a card before Kimi even finishes generating the code.
 *  2. Server-side `generated_hooks` for the currently connected wallet — so
 *     the moment a user connects their wallet on any device they see every
 *     agent they have ever forged, not just the ones from this browser.
 *
 * Local entries win on id collisions so the optimistic status/progress chip
 * keeps animating until the server row lands.
 */
export function LaunchReplayPanel() {
  const pending = usePendingLaunches();
  const { address, isConnected } = useAccount();
  const [serverHooks, setServerHooks] = useState<ServerHook[]>([]);

  // Realtime upgrade for pending launches: flip "initializing" → "ready" the
  // moment Supabase streams in the matching row.
  useEffect(() => {
    if (pending.length === 0) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channels = pending
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
  }, [pending]);

  // Hydrate "Your Agents" from the server for the connected wallet. Kept in
  // an effect with a polling follow-up so new launches from other devices
  // surface here without a manual refresh.
  useEffect(() => {
    if (!isConnected || !address) {
      setServerHooks([]);
      return;
    }
    let cancelled = false;
    const wallet = address.toLowerCase();
    const load = async () => {
      try {
        const res = await fetch(
          `/api/v1/forge/hooks?wallet=${encodeURIComponent(wallet)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { hooks?: ServerHook[] };
        if (!cancelled) setServerHooks(data.hooks ?? []);
      } catch {
        /* best-effort */
      }
    };
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [address, isConnected]);

  const cards = useMemo(
    () => mergeLaunches(pending, serverHooks),
    [pending, serverHooks],
  );

  if (cards.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            Your Agents · Workspace Replay
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            {isConnected
              ? "Every agent your wallet has forged, plus anything you launch in this session."
              : "Your freshly minted agents from this session. Connect your wallet to see everything you've ever forged."}
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {cards.length} agent{cards.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((launch) => (
          <WorkspaceAgentCard key={launch.id} launch={launch} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Merge the optimistic localStorage list with the server-side rows. If a
 * pending entry already has a `hookId` that matches a server row, we prefer
 * the local copy (it carries the user's friendly name/symbol).
 */
function mergeLaunches(
  pending: PendingLaunch[],
  server: ServerHook[],
): PendingLaunch[] {
  const known = new Set(
    pending.map((p) => p.hookId).filter((v): v is string => !!v),
  );
  const fromServer: PendingLaunch[] = server
    .filter((row) => !known.has(row.id))
    .map((row) => ({
      id: row.id,
      hookId: row.id,
      walletAddress: row.wallet_address,
      name: deriveName(row.prompt) ?? "Agent",
      symbol: deriveSymbol(row.prompt),
      category: "execution",
      prompt: row.prompt ?? "",
      model: row.model,
      status: "ready" as const,
      isPublic: row.is_public,
      createdAt: new Date(row.created_at).getTime() || Date.now(),
    }));
  return [...pending, ...fromServer].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The server row only stores the composed prompt (with `Agent: Name (SYM)` at
 * the top). Parse it back out so the card reads correctly. Falls back to a
 * generic label when the prompt is missing.
 */
function deriveName(prompt: string | null): string | null {
  if (!prompt) return null;
  const match = prompt.match(/^Agent:\s*([^(\n]+?)\s*\(/);
  return match?.[1]?.trim() || null;
}

function deriveSymbol(prompt: string | null): string {
  if (!prompt) return "AGENT";
  const match = prompt.match(/^Agent:\s*[^(]+\(([A-Z0-9]{2,16})\)/);
  return match?.[1] ?? "AGENT";
}
