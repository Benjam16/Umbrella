"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";

/**
 * /app — the Launchpad. Deliberately narrow: one hero with a single primary
 * CTA, one wallet state line, and quick links into the other tabs. Every
 * additional surface lives on its own dedicated page (Marketplace, Workspace,
 * Forge, Docs) — reachable from the AppTopNav.
 */
export default function LaunchpadPage() {
  const { isConnected, address } = useAccount();

  return (
    <main className="flex-1 overflow-y-auto">
      <section className="border-b border-zinc-800/60 bg-gradient-to-b from-signal-blue/[0.08] to-transparent">
        <div className="mx-auto max-w-[960px] px-6 py-16 text-center sm:py-20">
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            Umbrella · The Autonomous Launchpad
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-zinc-100 sm:text-5xl">
            Launch your agent.{" "}
            <span className="text-signal-sepia">Let it earn for you.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
            Connect your wallet, describe what your agent does in plain English,
            and Umbrella forges the token, pool, and swarm in one step.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <WalletLine isConnected={isConnected} address={address} />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/app/forge"
                className="rounded-xl bg-signal-blue px-6 py-3 text-sm font-semibold text-ink-950 shadow-lg shadow-signal-blue/20 transition hover:bg-signal-blue/90"
              >
                Launch a Token or Agent →
              </Link>
              <Link
                href="/app/marketplace"
                className="rounded-xl border border-zinc-700 bg-ink-900/60 px-6 py-3 text-sm text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
              >
                Browse marketplace
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[960px] px-6 py-12">
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickTile
            eyebrow="Launch"
            title="Forge"
            body="Three-step wizard for non-technical founders."
            href="/app/forge"
          />
          <QuickTile
            eyebrow="Trade"
            title="Marketplace"
            body="Back live agents broadcasting real performance."
            href="/app/marketplace"
          />
          <QuickTile
            eyebrow="Operate"
            title="Workspace"
            body="High-density Agent OS — DAG, missions, eject."
            href="/app/workspace"
          />
        </div>

        <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          Need deeper docs? Read the{" "}
          <Link href="/docs" className="text-signal-blue hover:underline">
            GitBook
          </Link>{" "}
          or the{" "}
          <Link href="/docs/vision" className="text-signal-blue hover:underline">
            Vision
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

function WalletLine({
  isConnected,
  address,
}: {
  isConnected: boolean;
  address?: string;
}) {
  if (!isConnected) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-signal-amber/40 bg-signal-amber/5 px-3 py-1.5 font-mono text-[11px] text-signal-amber">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-amber" />
        <span className="uppercase tracking-wider">Wallet required to launch</span>
        <ConnectWalletButton size="sm" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full border border-signal-green/40 bg-signal-green/5 px-3 py-1.5 font-mono text-[11px] text-signal-green">
      <span className="h-1.5 w-1.5 rounded-full bg-signal-green" />
      <span className="uppercase tracking-wider">
        Connected · {address?.slice(0, 6)}…{address?.slice(-4)}
      </span>
    </div>
  );
}

function QuickTile({
  eyebrow,
  title,
  body,
  href,
}: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-ink-900/60 p-4 transition hover:border-signal-blue/60"
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {eyebrow}
      </span>
      <span className="text-lg font-semibold text-zinc-100 group-hover:text-signal-blue">
        {title}
      </span>
      <span className="text-xs text-zinc-400">{body}</span>
    </Link>
  );
}
