"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AgentMarketCard } from "@/components/app/AgentMarketCard";
import { AppTopBar } from "@/components/app/AppTopBar";
import {
  CATEGORIES,
  SORTS,
  formatUsd,
  formatNumber,
  seedMarketplace,
  sortListings,
  type AgentCategory,
  type AgentListing,
  type SortKey,
} from "@/lib/marketplace";

/**
 * The Umbrella Marketplace — a Bloomberg-style grid of labor-backed agent
 * tokens. Each card's price is moved by real Umbrella missions via the v4
 * Performance Hook.
 *
 * Data flow (Phase 1): `/api/v1/marketplace` serves a deterministic seed.
 * Data flow (Phase 2): the RelayerService anchors `recordSuccess` on-chain,
 * this page pulls live hook state + mission events from Supabase. The shape
 * is identical — `AgentListing` is already the final schema.
 */
export default function MarketplacePage() {
  const router = useRouter();
  const [listings, setListings] = useState<AgentListing[]>(() =>
    seedMarketplace(),
  );
  const [category, setCategory] = useState<AgentCategory | "all">("all");
  const [sort, setSort] = useState<SortKey>("momentum");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/marketplace", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { listings: AgentListing[] };
        if (cancelled) return;
        if (Array.isArray(data.listings)) setListings(data.listings);
      } catch {
        /* fall back to seeded */
      }
    };
    load();
    const t = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byQuery = q
      ? listings.filter(
          (l) =>
            l.name.toLowerCase().includes(q) ||
            l.symbol.toLowerCase().includes(q) ||
            l.tagline.toLowerCase().includes(q),
        )
      : listings;
    const byCategory =
      category === "all" ? byQuery : byQuery.filter((l) => l.category === category);
    return sortListings(byCategory, sort);
  }, [listings, category, sort, query]);

  const aggregates = useMemo(() => {
    const agg = {
      tvl: 0,
      rev24h: 0,
      missions24h: 0,
      activeAgents: 0,
      burned: 0,
    };
    for (const l of listings) {
      agg.tvl += l.pool.tvlUsd;
      agg.rev24h += l.performance.revenue24hUsd;
      agg.missions24h += l.performance.missions24h;
      agg.burned += l.performance.burnedTokens;
      if (l.performance.active) agg.activeAgents += 1;
    }
    return agg;
  }, [listings]);

  const launch = (listing: AgentListing) => {
    router.push(
      `/app?blueprint=${encodeURIComponent(listing.blueprintId)}&agent=${encodeURIComponent(listing.id)}`,
    );
  };

  return (
    <>
      <AppTopBar statusLabel="Marketplace" statusTone="idle" />
      <main className="flex-1 overflow-y-auto">
        {/* --- Swarm Pulse header strip --- */}
        <section className="border-b border-zinc-800/60 bg-gradient-to-b from-signal-blue/[0.04] to-transparent">
          <div className="mx-auto max-w-[1280px] px-6 py-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-zinc-100">
                  Agent Marketplace
                </h1>
                <p className="mt-1 max-w-xl text-sm text-zinc-400">
                  Labor-backed tokens on Base. Every swap routes through the
                  Umbrella Performance Hook — agents earn a slice of every
                  trade, then buy and burn their own supply.
                </p>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                <span className="mr-1">☂</span> uniswap v4 · ERC-8004 · base
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Vital
                label="Swarm TVL"
                value={formatUsd(aggregates.tvl, { compact: true })}
              />
              <Vital
                label="Revenue 24h"
                value={formatUsd(aggregates.rev24h, { compact: true })}
                tone="good"
              />
              <Vital
                label="Missions 24h"
                value={formatNumber(aggregates.missions24h)}
              />
              <Vital
                label="Active now"
                value={String(aggregates.activeAgents)}
                pulse={aggregates.activeAgents > 0}
              />
              <Vital
                label="Burned"
                value={formatNumber(aggregates.burned)}
                tone="good"
              />
            </div>
          </div>
        </section>

        {/* --- filters --- */}
        <section className="sticky top-0 z-10 border-b border-zinc-800/60 bg-ink-950/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-6 py-3">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition ${
                      active
                        ? "border-signal-blue bg-signal-blue/10 text-signal-blue"
                        : "border-zinc-800 bg-ink-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
                    }`}
                    title={c.hint}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="search agent or ticker…"
                className="w-[220px] rounded-md border border-zinc-800 bg-ink-900 px-3 py-1.5 font-mono text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-signal-blue"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-zinc-800 bg-ink-900 px-2 py-1.5 font-mono text-[11px] text-zinc-300 outline-none focus:border-signal-blue"
                aria-label="Sort agents"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    sort · {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* --- cards grid --- */}
        <section className="mx-auto max-w-[1280px] px-6 py-6">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800/80 bg-ink-900/40 p-10 text-center">
              <p className="text-zinc-400">No agents match that filter.</p>
              <button
                type="button"
                onClick={() => {
                  setCategory("all");
                  setQuery("");
                }}
                className="mt-3 rounded-md border border-zinc-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {filtered.map((l) => (
                  <AgentMarketCard key={l.id} listing={l} onLaunch={launch} />
                ))}
              </AnimatePresence>
            </div>
          )}

          <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            relayer anchoring · uniswap v4 performance hook · coinbase paymaster sponsored
          </p>
        </section>
      </main>
    </>
  );
}

function Vital({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
  pulse?: boolean;
}) {
  const toneCls =
    tone === "good"
      ? "text-signal-green"
      : tone === "warn"
        ? "text-signal-amber"
        : "text-zinc-100";
  return (
    <div className="relative rounded-lg border border-zinc-800/80 bg-ink-900/60 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
        {pulse && (
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full bg-signal-green"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}
      </div>
      <div className={`mt-1 font-mono text-[15px] ${toneCls}`}>{value}</div>
    </div>
  );
}
