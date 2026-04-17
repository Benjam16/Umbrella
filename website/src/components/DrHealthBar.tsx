"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type HealthPayload = {
  status: string;
  integrity: string;
  lastSnapshotIso: string;
  source: string;
};

export function DrHealthBar() {
  const [data, setData] = useState<HealthPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch("/api/health-demo", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as HealthPayload;
        if (!cancelled) setData(json);
      } catch {
        /* demo: leave previous */
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const snapshotLabel = data?.lastSnapshotIso
    ? new Date(data.lastSnapshotIso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      })
    : "…";

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800/90 bg-ink-950/95 px-4 py-2.5 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <motion.span
              className="relative flex h-2.5 w-2.5"
              aria-hidden
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-green opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal-green" />
            </motion.span>
            <span className="font-semibold uppercase tracking-wide text-zinc-300">System integrity</span>
          </div>
          <span className="hidden text-zinc-600 sm:inline">|</span>
          <span className="font-mono text-[11px] text-zinc-500">
            Last snapshot: <span className="text-zinc-300">{snapshotLabel}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
          <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-zinc-400">{data?.integrity ?? "—"}</span>
          <span className="text-zinc-600">GET /v1/health/dr</span>
          <span className="text-zinc-600">·</span>
          <span>{data?.source ?? "edge-demo"}</span>
        </div>
      </div>
    </footer>
  );
}
