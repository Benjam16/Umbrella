"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LocalNodeStatus } from "@/components/LocalNodeStatus";
import { loadRecentRuns, type RecentRun } from "@/lib/recent-runs";

const NAV: Array<{ href: string; label: string; key: string }> = [
  { href: "/app", label: "Launchpad", key: "launchpad" },
  { href: "/app/marketplace", label: "Marketplace", key: "marketplace" },
  { href: "/app/workspace", label: "Workspace", key: "workspace" },
  { href: "/app/runs", label: "Runs", key: "runs" },
  { href: "/app/forge", label: "Forge", key: "forge" },
  { href: "/app/nodes", label: "Nodes", key: "nodes" },
  { href: "/docs", label: "Docs", key: "docs" },
  { href: "/app/settings", label: "Settings", key: "settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [runs, setRuns] = useState<RecentRun[]>([]);

  useEffect(() => {
    const sync = () => setRuns(loadRecentRuns());
    sync();
    window.addEventListener("umbrella:recent-runs-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("umbrella:recent-runs-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-zinc-800/70 bg-ink-900/90">
      <div className="flex items-center gap-2 border-b border-zinc-800/70 px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-signal-blue">☂</span>
          <span>Umbrella</span>
        </Link>
        <span className="ml-auto rounded-full bg-signal-blue/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-signal-blue">
          v0.1
        </span>
      </div>

      <nav className="px-2 py-3">
        {NAV.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
                active
                  ? "bg-signal-blue/10 text-signal-blue"
                  : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100"
              }`}
            >
              <span>{item.label}</span>
              {active && (
                <span className="h-1.5 w-1.5 rounded-full bg-signal-blue" aria-hidden />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto border-t border-zinc-800/60 px-3 py-3">
        <p className="mb-2 px-1 text-[10px] font-mono uppercase tracking-widest text-zinc-600">
          Recent missions
        </p>
        {runs.length === 0 ? (
          <p className="px-1 text-[11px] text-zinc-600">
            No missions yet. Run one from the Terminal.
          </p>
        ) : (
          <ul className="space-y-1">
            {runs.slice(0, 12).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/runs/${r.id}`}
                  className="block rounded-md px-2 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800/40 hover:text-signal-blue"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 flex-none rounded-full ${
                        r.origin === "remote" ? "bg-signal-green" : "bg-signal-blue"
                      }`}
                      aria-hidden
                    />
                    <span className="truncate font-mono">
                      {r.blueprintTitle}
                    </span>
                  </div>
                  <div className="ml-3.5 truncate text-[10px] text-zinc-500">
                    {r.goal || r.id.slice(0, 8)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-800/70 p-3">
        <LocalNodeStatus />
      </div>
    </aside>
  );
}
