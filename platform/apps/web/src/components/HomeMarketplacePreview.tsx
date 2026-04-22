"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type AgentListing } from "@/lib/marketplace";

/**
 * Public-homepage marketplace strip.
 *
 * Fetches `/api/v1/marketplace` and renders a compact grid of the most
 * recent broadcast agents so a first-time visitor sees live activity — and
 * can click straight through to Forge or the full marketplace. We keep the
 * card deliberately lightweight (no TradeDrawer, no sparklines) because the
 * heavier cards used on /app/marketplace pull in framer-motion and would
 * balloon the landing-page bundle.
 */
export function HomeMarketplacePreview({ limit = 6 }: { limit?: number }) {
  const [listings, setListings] = useState<AgentListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/marketplace", { cache: "no-store" });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = (await res.json()) as { listings?: AgentListing[] };
        if (cancelled) return;
        setListings((data.listings ?? []).slice(0, limit));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to load");
          setListings([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const loading = listings === null;
  const empty = !loading && (listings?.length ?? 0) === 0;

  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-ink-900/50 p-5 backdrop-blur-sm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            Live Marketplace · Real agents
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-zinc-100">
            Agents currently broadcasting on Umbrella
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/forge"
            className="rounded-md bg-signal-green px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-950 transition hover:bg-signal-green/90"
          >
            Launch a Token or Agent →
          </Link>
          <Link
            href="/app/marketplace"
            className="rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-300 transition hover:border-signal-blue hover:text-signal-blue"
          >
            View all →
          </Link>
        </div>
      </header>

      {loading && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[120px] animate-pulse rounded-xl border border-zinc-800/60 bg-ink-950/60"
            />
          ))}
        </div>
      )}

      {empty && <EmptyMarket error={error} />}

      {!loading && !empty && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings!.map((l) => (
            <li key={l.id}>
              <HomeListingCard listing={l} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HomeListingCard({ listing }: { listing: AgentListing }) {
  const shortCreator = `${listing.identity.contract.slice(0, 6)}…${listing.identity.contract.slice(-4)}`;
  return (
    <Link
      href={`/app/marketplace/${listing.id}`}
      className="group flex h-full flex-col justify-between rounded-xl border border-zinc-800/80 bg-ink-950/60 p-3 transition hover:border-signal-blue/60"
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-100">
            {listing.name}
          </span>
          <span className="font-mono text-[10px] text-zinc-500">
            ${listing.symbol}
          </span>
          {typeof listing.forksCount === "number" && listing.forksCount > 0 && (
            <span
              className="rounded-full border border-signal-blue/40 bg-signal-blue/10 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-widest text-signal-blue"
              title={`Forked ${listing.forksCount} time${listing.forksCount === 1 ? "" : "s"}`}
            >
              {listing.forksCount}×
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
          {listing.tagline}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <span>{listing.category}</span>
        <span className="text-zinc-600">{shortCreator}</span>
      </div>
    </Link>
  );
}

function EmptyMarket({ error }: { error: string | null }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-zinc-800 bg-ink-950/40 p-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
        Open floor
      </p>
      <h3 className="mt-1 text-base font-semibold text-zinc-100">
        No public agents yet — be the first to broadcast.
      </h3>
      <p className="mx-auto mt-2 max-w-md text-xs text-zinc-400">
        {error
          ? "Marketplace API unreachable from this deploy. Try again in a moment."
          : "Once a creator flips a launch to public, it shows up here in real time."}
      </p>
      <Link
        href="/app/forge"
        className="mt-4 inline-block rounded-md bg-signal-blue px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-950 transition hover:bg-signal-blue/90"
      >
        Launch the first agent →
      </Link>
    </div>
  );
}
