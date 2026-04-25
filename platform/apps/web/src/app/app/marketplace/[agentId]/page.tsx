"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MarketSparkline } from "@/components/app/MarketSparkline";
import { TradeDrawer } from "@/components/app/TradeDrawer";
import {
  formatNumber,
  formatPct,
  formatUsd,
  timeAgo,
  type AgentListing,
} from "@/lib/marketplace";
import { ExternalLinkIcon } from "@/components/icons/ExternalLinkIcon";
import { addressExplorerUrl, contractCodeExplorerUrl } from "@/lib/chains/explorer";
import { getAgentImageUrl } from "@/lib/supabase-client";

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
  const [liveSpark, setLiveSpark] = useState<Array<{ t: number; price: number }>>([]);
  const [tradeTape, setTradeTape] = useState<
    Array<{ id: string; side: "BUY" | "SELL"; price: number; size: number; ts: number }>
  >([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveDelta, setLiveDelta] = useState<number | null>(null);
  const [liveState, setLiveState] = useState<"live" | "warmup" | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [liveCurve, setLiveCurve] = useState<{
    address: string | null;
    stage: "pending" | "deploying" | "active" | "graduated" | "failed";
    ethReserveWei: string;
    graduationThresholdWei: string;
    progress: number;
    chainId: number | null;
  } | null>(null);

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
    if (!listing?.id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/v1/marketplace/${encodeURIComponent(listing.id)}/live`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          state?: "live" | "warmup";
          message?: string;
          live?: { priceUsd?: number; delta?: number };
          spark?: Array<{ t: number; price: number }>;
          tape?: Array<{ id: string; side: "BUY" | "SELL"; price: number; size: number; ts: number }>;
          curve?: {
            address: string | null;
            stage: "pending" | "deploying" | "active" | "graduated" | "failed";
            ethReserveWei: string;
            graduationThresholdWei: string;
            progress: number;
            chainId: number | null;
          } | null;
        };
        if (cancelled) return;
        setLiveState(data.state ?? null);
        setLiveMessage(data.message ?? null);
        if (Array.isArray(data.spark)) setLiveSpark(data.spark);
        if (Array.isArray(data.tape)) setTradeTape(data.tape.slice(0, 18));
        if (typeof data.live?.priceUsd === "number") setLivePrice(data.live.priceUsd);
        if (typeof data.live?.delta === "number") setLiveDelta(data.live.delta);
        if (data.curve) setLiveCurve(data.curve);
      } catch {
        /* best-effort live stream */
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [listing?.id]);

  if (listing === null) notFound();
  if (!listing) return null;
  const explorerChainId = liveCurve?.chainId ?? listing.curve?.chainId ?? 8453;
  const chartSpark = liveSpark.length > 1 ? liveSpark : listing.spark;
  const shownPrice = livePrice ?? listing.price.usd;
  const shownDelta = liveDelta ?? listing.price.change24h;
  const isPositive = shownDelta >= 0;
  const shownTape = tradeTape.length > 0 ? tradeTape : [];
  const curveAddress = liveCurve?.address ?? listing.curve?.address ?? null;

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
            <div className="flex min-w-0 gap-4">
              {listing.imageUrl ? (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                  <Image
                    src={getAgentImageUrl(listing.imageUrl)}
                    alt={listing.name}
                    width={80}
                    height={80}
                    className="h-20 w-20 object-cover"
                    unoptimized
                  />
                </div>
              ) : null}
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
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="text-[24px] font-mono font-semibold text-zinc-100">
                {formatUsd(shownPrice)}
              </div>
              <div
                className={`font-mono text-[12px] ${
                  isPositive ? "text-signal-green" : "text-signal-red"
                }`}
              >
                {formatPct(shownDelta)} · live tick ·{" "}
                {formatPct(listing.price.change24h)} · 24h
              </div>
              {liveState === "warmup" && (
                <div className="font-mono text-[10px] uppercase tracking-widest text-signal-amber">
                  {liveMessage ?? "Awaiting first on-chain event"}
                </div>
              )}
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

          {liveCurve && liveCurve.stage !== "graduated" && (
            <section className="mt-6 rounded-2xl border border-signal-blue/30 bg-signal-blue/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-signal-blue">
                <span>Bonding curve · graduation powered by Umbrella liquidity</span>
                <span className="text-zinc-300">{liveCurve.progress.toFixed(1)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-signal-blue via-signal-green to-signal-green"
                  style={{ width: `${liveCurve.progress}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-zinc-500">
                <span>
                  {formatEthWei(liveCurve.ethReserveWei)} /{" "}
                  {formatEthWei(liveCurve.graduationThresholdWei)} ETH
                </span>
                <span className="uppercase tracking-widest">
                  stage · {liveCurve.stage}
                </span>
              </div>
            </section>
          )}

          {/* Big spark */}
          <section className="mt-6 rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <span>Price chart · green dots = missions complete</span>
              <span>updated {timeAgo(listing.updatedAt)}</span>
            </div>
            <MarketSparkline
              spark={chartSpark}
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
                  {shownTape.length === 0 && (
                    <li className="rounded border border-zinc-800/70 bg-ink-950/60 px-2 py-2 text-center text-zinc-500">
                      {liveState === "warmup"
                        ? (liveMessage ?? "Awaiting first on-chain event")
                        : "Waiting for trade prints..."}
                    </li>
                  )}
                  {shownTape.map((t) => (
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
                <AddressExplorerRow
                  label="Token contract"
                  chainId={explorerChainId}
                  address={listing.token.address}
                />
                <AddressExplorerRow
                  label="Bonding curve"
                  chainId={explorerChainId}
                  address={curveAddress}
                  verified={Boolean(listing.curve?.curveVerifiedAt)}
                />
                <AddressExplorerRow
                  label="Mission logic"
                  chainId={explorerChainId}
                  address={listing.pool.hookAddress}
                  verified={Boolean(listing.curve?.missionVerifiedAt)}
                />
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
        listing={{
          ...listing,
          curve: liveCurve
            ? {
                address: liveCurve.address,
                chainId: liveCurve.chainId,
                stage: liveCurve.stage,
                ethReserveWei: liveCurve.ethReserveWei,
                graduationThresholdWei: liveCurve.graduationThresholdWei,
                progress: liveCurve.progress,
                deployError: listing.curve?.deployError ?? null,
                missionVerifiedAt: listing.curve?.missionVerifiedAt ?? null,
                curveVerifiedAt: listing.curve?.curveVerifiedAt ?? null,
              }
            : listing.curve,
        }}
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

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function AddressExplorerRow({
  label,
  chainId,
  address,
  verified,
}: {
  label: string;
  chainId: number;
  address: string | null | undefined;
  verified?: boolean;
}) {
  const a = (address ?? "").trim();
  if (!a || a.toLowerCase() === ZERO_ADDR || !/^0x[a-fA-F0-9]{40}$/i.test(a)) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-500">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {verified && (
          <span className="shrink-0 rounded-full border border-signal-green/40 bg-signal-green/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-signal-green">
            Verified source
          </span>
        )}
        <a
          href={verified ? contractCodeExplorerUrl(chainId, a) : addressExplorerUrl(chainId, a)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 max-w-[min(100%,14rem)] items-center justify-end gap-1 font-mono text-signal-blue hover:underline"
        >
          <span className="truncate">
            {a.slice(0, 8)}…{a.slice(-4)}
          </span>
          <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
        </a>
      </div>
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

function formatEthWei(weiStr: string | undefined | null): string {
  if (!weiStr) return "0.000";
  try {
    const wei = BigInt(weiStr);
    const whole = wei / 10n ** 18n;
    const frac = ((wei % 10n ** 18n) / 10n ** 14n).toString().padStart(4, "0");
    return `${whole}.${frac}`;
  } catch {
    return "0.000";
  }
}
