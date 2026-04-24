"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { MarketSparkline } from "@/components/app/MarketSparkline";
import { TradeDrawer } from "@/components/app/TradeDrawer";
import {
  formatNumber,
  formatPct,
  formatUsd,
  timeAgo,
  type AgentListing,
} from "@/lib/marketplace";
import { getAgentImageUrl } from "@/lib/supabase-client";
import { SovereignProofBadge } from "@/components/app/SovereignProofBadge";

type Props = {
  listing: AgentListing;
  /** Launch the agent (opens a mission composer prefilled with the blueprint). */
  onLaunch?: (listing: AgentListing) => void;
};

/**
 * Single agent listing in the Umbrella Marketplace.
 *
 * The card is structured as a mini-terminal:
 *   ┌ header: identity (NFT) + metabolism pulse + active badge
 *   │ stats row: price · change · FDV · success rate · dynamic fee
 *   │ sparkline + mission-complete dots
 *   │ "Proof of Work" feed (latest missions, revenue)
 *   │ deflation row: burned tokens, runway, treasury
 *   └ actions: Trade (opens v4 swap drawer), Launch mission, Open profile
 *
 * Visual states:
 *   · successRate ≥ 0.95 → green glow ring + high-success discount badge
 *   · successRate < 0.80 → amber outline
 *   · active mission     → pulsing dot on the metabolism bar
 */
export function AgentMarketCard({ listing, onLaunch }: Props) {
  const [tradeOpen, setTradeOpen] = useState(false);
  const isPositive = listing.price.change24h >= 0;
  const isElite = listing.performance.successRate >= 0.95;
  const isWeak = listing.performance.successRate < 0.8;
  const tone: "up" | "down" = isPositive ? "up" : "down";
  // See AgentMarketRow: user-forged listings don't have a real pool yet, so
  // the primary action flips from "Back" (TradeDrawer) to "Fork" (Forge wizard).
  const isUserForged = listing.blueprintId === "user-forged";

  const glowRing = isElite
    ? "shadow-[0_0_48px_-14px_rgba(34,211,166,0.45)] border-signal-green/30"
    : isWeak
      ? "border-signal-amber/30"
      : "border-zinc-800/80";

  const headerStatus = listing.performance.active
    ? "executing"
    : listing.performance.missions24h > 0
      ? "idle"
      : "cooldown";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border ${glowRing} bg-ink-900/60 backdrop-blur-md`}
    >
      {/* Metabolism bar — speeds up when the agent is currently executing. */}
      <div className="relative h-[2px] w-full overflow-hidden bg-zinc-800/60">
        <motion.div
          className={`h-full ${
            listing.performance.active ? "bg-signal-green" : "bg-signal-blue/50"
          }`}
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{
            duration: listing.performance.active ? 2.2 : 6,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{ width: "40%" }}
        />
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* --- header --- */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            {listing.imageUrl ? (
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                <Image
                  src={getAgentImageUrl(listing.imageUrl)}
                  alt={listing.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 object-cover"
                  unoptimized
                />
              </div>
            ) : null}
            <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-zinc-100">
                {listing.name}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                ${listing.symbol}
              </span>
              <SovereignProofBadge
                chainId={listing.curve?.chainId ?? 8453}
                missionVerifiedAt={listing.curve?.missionVerifiedAt}
                curveVerifiedAt={listing.curve?.curveVerifiedAt}
                missionContractAddress={listing.pool.hookAddress}
                curveContractAddress={listing.curve?.address ?? null}
              />
              {isElite && (
                <span className="rounded-full bg-signal-green/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-signal-green">
                  elite · {Math.round(listing.performance.successRate * 100)}%
                </span>
              )}
              {isWeak && (
                <span className="rounded-full bg-signal-amber/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-signal-amber">
                  at risk
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-zinc-400">{listing.tagline}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-zinc-600">
              <span>
                ERC-8004 #{listing.identity.tokenId} · {listing.category}
              </span>
              {typeof listing.forksCount === "number" && listing.forksCount > 0 && (
                <span
                  title={`Forked ${listing.forksCount} time${listing.forksCount === 1 ? "" : "s"}`}
                  className="rounded-full border border-signal-blue/40 bg-signal-blue/10 px-1.5 py-[1px] uppercase tracking-widest text-signal-blue"
                >
                  {listing.forksCount} fork{listing.forksCount === 1 ? "" : "s"}
                </span>
              )}
            </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <div className="text-[18px] font-mono font-semibold text-zinc-100">
              {formatUsd(listing.price.usd)}
            </div>
            <div
              className={`font-mono text-[11px] ${
                isPositive ? "text-signal-green" : "text-signal-red"
              }`}
            >
              {formatPct(listing.price.change24h)} · 24h
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  listing.performance.active
                    ? "bg-signal-green"
                    : headerStatus === "cooldown"
                      ? "bg-zinc-600"
                      : "bg-signal-blue"
                }`}
                aria-hidden
              >
                {listing.performance.active && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-signal-green/60" />
                )}
              </span>
              {headerStatus}
            </div>
          </div>
        </div>

        {/* --- stats row --- */}
        <div className="grid grid-cols-4 gap-2 rounded-md border border-zinc-800/80 bg-ink-950/60 p-2 font-mono text-[11px]">
          <Stat label="FDV" value={formatUsd(listing.price.fdvUsd, { compact: true })} />
          <Stat
            label="Rev 24h"
            value={formatUsd(listing.performance.revenue24hUsd, { compact: true })}
            tone="good"
          />
          <Stat
            label="Missions 24h"
            value={formatNumber(listing.performance.missions24h)}
          />
          <Stat
            label="Hook fee"
            value={`${(listing.performance.dynamicFeeBps / 100).toFixed(2)}%`}
            tone={
              listing.performance.dynamicFeeBps <= 10
                ? "good"
                : listing.performance.dynamicFeeBps >= 80
                  ? "warn"
                  : undefined
            }
          />
        </div>

        {/* --- sparkline + mission dots --- */}
        <div className="relative">
          <MarketSparkline
            spark={listing.spark}
            missions={listing.missions}
            tone={tone}
            width={360}
            height={72}
          />
          <span className="pointer-events-none absolute right-1 top-1 rounded bg-ink-950/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
            24h · {listing.missions.length} missions
          </span>
        </div>

        {/* --- proof of work feed --- */}
        <div className="rounded-md border border-zinc-800/80 bg-ink-950/60 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Proof of Work
            </span>
            <span className="font-mono text-[9px] text-zinc-600">
              updated {timeAgo(listing.updatedAt)}
            </span>
          </div>
          <ul className="space-y-0.5 font-mono text-[11px] text-zinc-300">
            {listing.missions.slice(0, 3).map((m) => (
              <li
                key={m.runId}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  <span className="text-signal-green">▸</span> {m.label}
                </span>
                <span className="shrink-0 text-zinc-500">
                  +${m.revenueUsd.toFixed(2)} · {timeAgo(m.ts)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* --- deflation / runway row --- */}
        <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-zinc-500">
          <Micro label="Burned" value={`${formatNumber(listing.performance.burnedTokens)} ${listing.symbol}`} />
          <Micro
            label="TVL"
            value={formatUsd(listing.pool.tvlUsd, { compact: true })}
          />
          <Micro
            label="Runway"
            value={`${listing.performance.runwayHours}h`}
            tone={listing.performance.runwayHours < 24 ? "warn" : undefined}
          />
        </div>

        {/* --- actions --- */}
        <div className="mt-1 flex items-center gap-2">
          {isUserForged ? (
            <Link
              href={`/app/forge?template=${encodeURIComponent(listing.id)}`}
              className="flex-1 rounded-md border border-signal-blue/40 bg-signal-blue/10 py-2 text-center font-mono text-[11px] uppercase tracking-wider text-signal-blue transition hover:border-signal-blue"
              title="Fork this public agent into the Forge wizard"
            >
              Fork this agent
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setTradeOpen(true)}
              className={`flex-1 rounded-md border py-2 font-mono text-[11px] uppercase tracking-wider transition ${
                isPositive
                  ? "border-signal-green/40 bg-signal-green/10 text-signal-green hover:border-signal-green"
                  : "border-signal-blue/40 bg-signal-blue/10 text-signal-blue hover:border-signal-blue"
              }`}
            >
              Back this agent
            </button>
          )}
          {onLaunch && !isUserForged && (
            <button
              type="button"
              onClick={() => onLaunch(listing)}
              className="rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
              title={`Launch a mission using the ${listing.blueprintId} blueprint`}
            >
              Launch
            </button>
          )}
          <Link
            href={`/app/marketplace/${listing.id}`}
            className="rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
          >
            Profile
          </Link>
        </div>
      </div>

      {!isUserForged && (
        <TradeDrawer
          listing={listing}
          open={tradeOpen}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </motion.div>
  );
}

function Stat({
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
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span className={`mt-0.5 ${toneCls}`}>{value}</span>
    </div>
  );
}

function Micro({
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
        : "text-zinc-300";
  return (
    <div className="flex items-center justify-between rounded-sm bg-ink-950/40 px-2 py-1">
      <span className="uppercase tracking-widest text-zinc-600">{label}</span>
      <span className={toneCls}>{value}</span>
    </div>
  );
}
