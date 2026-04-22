"use client";

import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MarketSparkline } from "@/components/app/MarketSparkline";
import { TradeDrawer } from "@/components/app/TradeDrawer";
import {
  formatNumber,
  formatPct,
  formatUsd,
  timeAgo,
  type AgentListing,
} from "@/lib/marketplace";

/**
 * Dedicated profile page for a single agent. This is the "resume" view —
 * ERC-8004 identity, full mission log, treasury details, liquidity depth.
 * Phase 2 will swap in live data from the relayer + v4 pool.
 */
export default function AgentProfilePage() {
  const params = useParams<{ agentId: string }>();
  const searchParams = useSearchParams();
  const [listing, setListing] = useState<AgentListing | null | undefined>(
    undefined,
  );
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tickIndex, setTickIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/marketplace", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setListing(null);
          return;
        }
        const data = (await res.json()) as { listings: AgentListing[] };
        const match = data.listings.find((l) => l.id === params.agentId) ?? null;
        if (!cancelled) setListing(match);
      } catch {
        if (!cancelled) setListing(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.agentId]);

  useEffect(() => {
    const trade = searchParams?.get("trade");
    if (trade === "buy" || trade === "sell") {
      setTradeSide(trade);
      setTradeOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    setTickIndex(0);
    if (!listing?.spark.length) return;
    const timer = setInterval(() => {
      setTickIndex((prev) => (prev + 1) % listing.spark.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [listing?.id, listing?.spark.length]);

  const liveSpark = useMemo(() => {
    if (!listing) return [];
    if (listing.spark.length <= 2) return listing.spark;
    const minWindow = 24;
    const end = Math.max(2, tickIndex + 1);
    const start = Math.max(0, end - minWindow);
    return listing.spark.slice(start, end);
  }, [listing, tickIndex]);

  const livePrice = liveSpark[liveSpark.length - 1]?.price ?? listing?.price.usd ?? 0;
  const prevPrice = liveSpark[liveSpark.length - 2]?.price ?? livePrice;
  const liveDelta = prevPrice ? (livePrice - prevPrice) / prevPrice : 0;
  const isPositive = liveDelta >= 0;
  const tradeTape = useMemo(() => {
    if (!listing) return [];
    const out: Array<{ id: string; side: "BUY" | "SELL"; price: number; size: number; ts: number }> = [];
    for (let i = 1; i < listing.spark.length; i++) {
      const prev = listing.spark[i - 1]!;
      const curr = listing.spark[i]!;
      const delta = curr.price - prev.price;
      const pct = prev.price > 0 ? Math.abs(delta / prev.price) : 0.001;
      out.push({
        id: `${listing.id}-${i}`,
        side: delta >= 0 ? "BUY" : "SELL",
        price: curr.price,
        size: Math.max(15, Math.round(pct * 22000)),
        ts: curr.t,
      });
    }
    return out.reverse().slice(0, 18);
  }, [listing]);

  if (listing === null) notFound();
  if (!listing) return null;

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] px-6 py-6">
          <Link
            href="/app/marketplace"
            className="font-mono text-[11px] uppercase tracking-widest text-zinc-500 hover:text-signal-blue"
          >
            ← marketplace
          </Link>

          <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold text-zinc-100">
                {listing.name}
                <span className="ml-3 font-mono text-[14px] text-zinc-500">
                  ${listing.symbol}
                </span>
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] text-zinc-400">
                {listing.tagline}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                <span className="rounded-full border border-zinc-800 px-2 py-0.5">
                  ERC-8004 #{listing.identity.tokenId}
                </span>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5">
                  blueprint · {listing.blueprintId}
                </span>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5">
                  category · {listing.category}
                </span>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5">
                  chain · base
                </span>
                {typeof listing.forksCount === "number" && listing.forksCount > 0 && (
                  <span
                    title={`Forked ${listing.forksCount} time${listing.forksCount === 1 ? "" : "s"}`}
                    className="rounded-full border border-signal-blue/40 bg-signal-blue/10 px-2 py-0.5 text-signal-blue"
                  >
                    {listing.forksCount} fork{listing.forksCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="text-[24px] font-mono font-semibold text-zinc-100">
                {formatUsd(livePrice)}
              </div>
              <div
                className={`font-mono text-[12px] ${
                  isPositive ? "text-signal-green" : "text-signal-red"
                }`}
              >
                {formatPct(liveDelta)} · live tick ·{" "}
                {formatPct(listing.price.change24h)} · 24h
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTradeSide("buy");
                    setTradeOpen(true);
                  }}
                  className="rounded-md border border-signal-green/40 bg-signal-green/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-signal-green hover:border-signal-green"
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTradeSide("sell");
                    setTradeOpen(true);
                  }}
                  className="rounded-md border border-signal-red/40 bg-signal-red/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-signal-red hover:border-signal-red"
                >
                  Sell
                </button>
              </div>
            </div>
          </header>

          {/* Big spark */}
          <section className="mt-6 rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <span>Price chart · green dots = missions complete</span>
              <span>updated {timeAgo(listing.updatedAt)}</span>
            </div>
            <MarketSparkline
              spark={liveSpark}
              missions={listing.missions}
              tone={isPositive ? "up" : "down"}
              width={1040}
              height={220}
            />
          </section>

          {/* Metrics grid */}
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="FDV" value={formatUsd(listing.price.fdvUsd, { compact: true })} />
            <Metric
              label="Pool TVL"
              value={formatUsd(listing.pool.tvlUsd, { compact: true })}
            />
            <Metric
              label="Volume 24h"
              value={formatUsd(listing.pool.volume24hUsd, { compact: true })}
            />
            <Metric
              label="Hook fee (dynamic)"
              value={`${(listing.performance.dynamicFeeBps / 100).toFixed(2)}%`}
            />
            <Metric
              label="Revenue 24h"
              value={formatUsd(listing.performance.revenue24hUsd, { compact: true })}
              tone="good"
            />
            <Metric
              label="Missions 24h"
              value={formatNumber(listing.performance.missions24h)}
            />
            <Metric
              label="Success rate"
              value={`${(listing.performance.successRate * 100).toFixed(1)}%`}
              tone={listing.performance.successRate >= 0.95 ? "good" : undefined}
            />
            <Metric
              label="Runway"
              value={`${listing.performance.runwayHours}h`}
              tone={listing.performance.runwayHours < 24 ? "warn" : undefined}
            />
          </section>

          {/* Mission log + trade tape */}
          <section className="mt-6 grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4">
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Proof of Work log
              </h2>
              <ul className="divide-y divide-zinc-800/80 font-mono text-[12px]">
                {listing.missions.map((m) => (
                  <li
                    key={m.runId}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <span className="truncate text-zinc-200">
                      <span className="mr-2 text-signal-green">▸</span>
                      {m.label}
                    </span>
                    <span className="shrink-0 text-zinc-500">
                      +${m.revenueUsd.toFixed(2)} ·{" "}
                      {(m.success * 100).toFixed(0)}% · {timeAgo(m.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4 font-mono text-[11px] text-zinc-300">
                <h3 className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
                  Live tape
                </h3>
                <ul className="max-h-[220px] space-y-1 overflow-auto">
                  {tradeTape.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded border border-zinc-800/70 bg-ink-950/60 px-2 py-1"
                    >
                      <span
                        className={
                          t.side === "BUY" ? "text-signal-green" : "text-signal-red"
                        }
                      >
                        {t.side}
                      </span>
                      <span>${t.price.toFixed(4)}</span>
                      <span className="text-zinc-500">{t.size.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4 font-mono text-[11px] text-zinc-300">
                <h3 className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
                  On-chain
                </h3>
                <Row label="Token">
                  <span className="truncate">{listing.token.address.slice(0, 14)}…</span>
                </Row>
                <Row label="Pool id">
                  <span>{listing.pool.id.slice(0, 14)}…</span>
                </Row>
                <Row label="Hook">
                  <span>{listing.pool.hookAddress.slice(0, 14)}…</span>
                </Row>
                <Row label="Chain">base</Row>
              </div>

              <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4 font-mono text-[11px] text-zinc-300">
                <h3 className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">
                  Deflation
                </h3>
                <Row label="Burned">
                  {formatNumber(listing.performance.burnedTokens)} {listing.symbol}
                </Row>
                <Row label="All-time revenue">
                  {formatUsd(listing.performance.revenueAllTimeUsd, { compact: true })}
                </Row>
                <Row label="Treasury cut">0.50% afterSwap</Row>
              </div>
            </div>
          </section>

          <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            labor-backed · relayed on every mission.completed · paymaster sponsored
          </p>
        </div>
      </main>

      <TradeDrawer
        listing={listing}
        open={tradeOpen}
        onClose={() => setTradeOpen(false)}
        initialSide={tradeSide}
      />
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  const toneCls =
    tone === "good"
      ? "text-signal-green"
      : tone === "warn"
        ? "text-signal-amber"
        : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-ink-900/60 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 font-mono text-[16px] ${toneCls}`}>{value}</div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{label}</span>
      <span className="truncate text-zinc-200">{children}</span>
    </div>
  );
}
