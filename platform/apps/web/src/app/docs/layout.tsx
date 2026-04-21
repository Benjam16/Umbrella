import type { Metadata } from "next";
import Link from "next/link";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export const metadata: Metadata = {
  title: "Umbrella Docs",
  description:
    "Complete documentation for Umbrella: the autonomous launchpad for agent tokens and swarm operations.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800/70 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-signal-blue">☂</span>
            <span>Umbrella Docs</span>
          </Link>
          <nav className="ml-auto flex items-center gap-3 text-xs">
            <Link
              href="/app"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
            >
              Launchpad
            </Link>
            <Link
              href="/app/marketplace"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
            >
              Marketplace
            </Link>
            <Link
              href="https://github.com/Benjam16/Umbrella"
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
            >
              GitHub
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl gap-8 px-6 py-8">
        <DocsSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
