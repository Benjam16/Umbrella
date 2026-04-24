"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { GlobalTicker } from "@/components/app/GlobalTicker";

/**
 * Primary tab nav for every page inside `/app` and `/docs`.
 *
 * A global {@link GlobalTicker} runs above the bar (live `market_trades`). The
 * "More" menu uses Radix (shadcn-style) for Runs, Nodes, Settings, and Portfolio.
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
  { href: "/app/portfolio", label: "Portfolio", match: startsWith("/app/portfolio") },
  { href: "/app/runs", label: "Runs", match: startsWith("/app/runs") },
  { href: "/app/nodes", label: "Nodes", match: startsWith("/app/nodes") },
  { href: "/app/settings", label: "Settings", match: startsWith("/app/settings") },
];

export function AppTopNav() {
  const pathname = usePathname() ?? "/app";
  const overflowActive = OVERFLOW.some((t) => t.match(pathname));

  return (
    <div className="relative z-50 w-full shrink-0">
      <GlobalTicker />
      <header className="flex h-14 w-full items-center gap-4 border-b border-zinc-800/70 bg-ink-950/85 px-5 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <span className="text-signal-blue">☂</span>
          <span>Umbrella</span>
          <span className="ml-1 rounded-full bg-signal-blue/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            v0.1
          </span>
        </Link>

        <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
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

          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="More navigation"
                className={`shrink-0 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition outline-none hover:text-zinc-100 data-[state=open]:text-signal-blue ${
                  overflowActive
                    ? "text-signal-blue"
                    : "text-zinc-400"
                }`}
              >
                More ▾
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-[200] min-w-[200px] rounded-md border border-zinc-800 bg-ink-950/95 p-1 shadow-xl backdrop-blur"
                sideOffset={6}
                align="start"
                avoidCollisions
              >
                {OVERFLOW.map((tab) => {
                  const active = tab.match(pathname);
                  return (
                    <DropdownMenu.Item
                      key={tab.href}
                      asChild
                    >
                      <Link
                        href={tab.href}
                        className={`block cursor-pointer select-none rounded-sm px-3 py-2 font-mono text-[11px] uppercase tracking-wider outline-none ${
                          active
                            ? "bg-signal-blue/10 text-signal-blue"
                            : "text-zinc-300"
                        } data-[highlighted]:bg-zinc-800/60 data-[highlighted]:text-zinc-100`}
                      >
                        {tab.label}
                      </Link>
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ConnectWalletButton />
        </div>
      </header>
    </div>
  );
}
