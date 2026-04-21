"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";

/**
 * Primary tab nav for every page inside `/app` and `/docs`.
 *
 * Bankr-style: horizontal tabs on top, ConnectButton on the right. The
 * overflow menu holds the "operator" destinations (Runs / Nodes / Settings)
 * so the top bar stays clean for the most common journeys.
 */

type Tab = { href: string; label: string; match: (path: string) => boolean };

const startsWith = (prefix: string) => (path: string) => path === prefix || path.startsWith(prefix + "/");

const PRIMARY: Tab[] = [
  { href: "/app", label: "Launchpad", match: (p) => p === "/app" },
  { href: "/app/marketplace", label: "Marketplace", match: startsWith("/app/marketplace") },
  { href: "/app/workspace", label: "Workspace", match: startsWith("/app/workspace") },
  { href: "/app/forge", label: "Forge", match: startsWith("/app/forge") },
  { href: "/docs", label: "Docs", match: startsWith("/docs") },
];

const OVERFLOW: Tab[] = [
  { href: "/app/runs", label: "Runs", match: startsWith("/app/runs") },
  { href: "/app/nodes", label: "Nodes", match: startsWith("/app/nodes") },
  { href: "/app/settings", label: "Settings", match: startsWith("/app/settings") },
];

export function AppTopNav() {
  const pathname = usePathname() ?? "/app";
  const [overflowOpen, setOverflowOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOverflowOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-zinc-800/70 bg-ink-950/85 px-5 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <span className="text-signal-blue">☂</span>
        <span>Umbrella</span>
        <span className="ml-1 rounded-full bg-signal-blue/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-signal-blue">
          v0.1
        </span>
      </Link>

      <nav className="flex items-center gap-0.5 overflow-x-auto">
        {PRIMARY.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex items-center px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                active
                  ? "text-signal-blue"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {tab.label}
              {active && (
                <span className="pointer-events-none absolute inset-x-3 -bottom-[12px] h-[2px] rounded-full bg-signal-blue" />
              )}
            </Link>
          );
        })}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOverflowOpen((v) => !v)}
            aria-expanded={overflowOpen}
            className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
              OVERFLOW.some((t) => t.match(pathname))
                ? "text-signal-blue"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            More ▾
          </button>
          {overflowOpen && (
            <div className="absolute left-0 z-50 mt-1 w-[180px] overflow-hidden rounded-md border border-zinc-800 bg-ink-950/95 shadow-xl backdrop-blur">
              <ul>
                {OVERFLOW.map((tab) => {
                  const active = tab.match(pathname);
                  return (
                    <li key={tab.href}>
                      <Link
                        href={tab.href}
                        onClick={() => setOverflowOpen(false)}
                        className={`block px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition ${
                          active
                            ? "bg-signal-blue/10 text-signal-blue"
                            : "text-zinc-300 hover:bg-zinc-800/40 hover:text-zinc-100"
                        }`}
                      >
                        {tab.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <ConnectWalletButton />
      </div>
    </header>
  );
}
