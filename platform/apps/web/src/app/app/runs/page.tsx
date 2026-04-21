"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { clearRecentRuns, loadRecentRuns, type RecentRun } from "@/lib/recent-runs";

// Minimal shape we need from the server list. `runs` rows include more fields
// but these are the ones the table renders.
type ServerRun = {
  id: string;
  blueprintId: string;
  goal: string;
  mode: "cloud" | "remote";
  status: string;
  targetNodeId?: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  goal: string;
  blueprintTitle: string;
  origin: "cloud" | "remote";
  createdAt: string;
  status?: string;
  targetNodeId?: string | null;
  source: "server" | "local";
};

export default function RunsHistoryPage() {
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [server, setServer] = useState<ServerRun[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  // Local (per-browser) recents, synced from localStorage.
  useEffect(() => {
    const sync = () => setRecent(loadRecentRuns());
    sync();
    window.addEventListener("umbrella:recent-runs-updated", sync);
    return () =>
      window.removeEventListener("umbrella:recent-runs-updated", sync);
  }, []);

  // Owner-scoped server history — whichever browser cookie is set wins.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/runs", { cache: "no-store" });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = (await res.json()) as { runs: ServerRun[] };
        if (cancelled) return;
        setServer(Array.isArray(data.runs) ? data.runs : []);
        setServerError(null);
      } catch (err) {
        if (cancelled) return;
        setServerError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Merge: server wins on id collision because it has fresh status. Local
  // recents stay as a fallback for dev-without-cookies or legacy entries.
  const rows: Row[] = useMemo(() => {
    const byId = new Map<string, Row>();
    for (const r of recent) {
      byId.set(r.id, {
        id: r.id,
        goal: r.goal,
        blueprintTitle: r.blueprintTitle,
        origin: r.origin,
        createdAt: r.createdAt,
        source: "local",
      });
    }
    for (const r of server) {
      byId.set(r.id, {
        id: r.id,
        goal: r.goal,
        blueprintTitle: r.blueprintId,
        origin: r.mode === "remote" ? "remote" : "cloud",
        createdAt: r.createdAt,
        status: r.status,
        targetNodeId: r.targetNodeId,
        source: "server",
      });
    }
    return [...byId.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }, [recent, server]);

  return (
    <>
      <AppTopBar statusLabel="Runs" statusTone="idle" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100">
                Run history
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Owner-scoped server history + local recents, merged by id.
                {serverError && (
                  <span className="ml-1 text-signal-amber">
                    (server offline: {serverError})
                  </span>
                )}
              </p>
            </div>
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Clear local run history?")) clearRecentRuns();
                }}
                className="rounded-md border border-zinc-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:border-signal-red hover:text-signal-red"
              >
                Clear local
              </button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800/80 bg-ink-900/40 p-8 text-center">
              <p className="text-zinc-400">No missions yet.</p>
              <Link
                href="/app"
                className="mt-3 inline-block rounded-md border border-signal-blue/50 bg-signal-blue/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-signal-blue hover:border-signal-blue"
              >
                Open terminal
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-800/80">
              <table className="w-full font-mono text-[12px]">
                <thead className="bg-ink-900/70 text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left uppercase tracking-widest">
                      Mission
                    </th>
                    <th className="px-4 py-2 text-left uppercase tracking-widest">
                      Blueprint
                    </th>
                    <th className="px-4 py-2 text-left uppercase tracking-widest">
                      Target
                    </th>
                    <th className="px-4 py-2 text-left uppercase tracking-widest">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left uppercase tracking-widest">
                      Created
                    </th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 bg-ink-950">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-900/50">
                      <td className="px-4 py-3 text-zinc-200">
                        <div className="font-sans text-[13px]">
                          {r.goal || "(no goal)"}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {r.id.slice(0, 8)}
                          {r.source === "local" && (
                            <span className="ml-2 text-zinc-600">· local</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {r.blueprintTitle}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                            r.origin === "remote"
                              ? "bg-signal-green/15 text-signal-green"
                              : "bg-signal-blue/15 text-signal-blue"
                          }`}
                          title={r.targetNodeId ?? undefined}
                        >
                          {r.origin === "remote" && r.targetNodeId
                            ? r.targetNodeId.slice(0, 12)
                            : r.origin}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.status ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${statusTone(
                              r.status,
                            )}`}
                          >
                            {r.status}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/app/runs/${r.id}`}
                          className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
                        >
                          replay
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case "succeeded":
      return "bg-signal-green/15 text-signal-green";
    case "failed":
      return "bg-signal-red/15 text-signal-red";
    case "running":
      return "bg-signal-blue/15 text-signal-blue";
    case "ejected":
      return "bg-signal-amber/15 text-signal-amber";
    default:
      return "bg-zinc-800 text-zinc-400";
  }
}
