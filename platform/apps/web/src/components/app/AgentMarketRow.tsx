"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketSparkline } from "@/components/app/MarketSparkline";
import { TradeDrawer } from "@/components/app/TradeDrawer";
import {
  formatNumber,
  formatPct,
  formatUsd,
  type AgentListing,
} from "@/lib/marketplace";

type Props = {
  listing: AgentListing;
  onLaunch?: (listing: AgentListing) => void;
};

/**
 * Dense Bloomberg-style row: identity · price · 24h · 7d · FDV · rev · missions ·
 * success · fee · spark · actions. One line per agent so operators can scan
 * 40 agents without scrolling through cards.
 */
export function AgentMarketRow({ listing, onLaunch }: Props) {
  const [tradeOpen, setTradeOpen] = useState(false);
  const positive24 = listing.price.change24h >= 0;
  const positive7 = listing.price.change7d >= 0;
  const isElite = listing.performance.successRate >= 0.95;
  const isWeak = listing.performance.successRate < 0.8;
  // User-forged agents don't yet have a real on-chain pool, so "Back" routes
  // to the Forge wizard seeded with their public template instead of opening
  // a TradeDrawer (which would resolve to a 0x0 pool).
  const isUserForged = listing.blueprintId === "user-forged";

  const rowTone = listing.performance.active
    ? "border-l-signal-green/70"
    : isElite
      ? "border-l-signal-blue/60"
      : isWeak
        ? "border-l-signal-amber/70"
        : "border-l-zinc-800";

  return (
    <div
      className={`grid grid-cols-12 items-center gap-3 border-b border-l-2 ${rowTone} border-b-zinc-800/60 bg-ink-900/40 px-3 py-2 text-[12px] hover:bg-ink-900/80`}
    >
      <div className="col-span-3 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-zinc-100">{listing.name}</span>
          <span className="font-mono text-[10px] text-zinc-500">${listing.symbol}</span>
          {listing.performance.active && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-green" />
          )}
          {typeof listing.forksCount === "number" && listing.forksCount > 0 && (
            <span
              title={`Forked ${listing.forksCount} time${listing.forksCount === 1 ? "" : "s"}`}
              className="rounded-full border border-signal-blue/40 bg-signal-blue/10 px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-widest text-signal-blue"
            >
              {listing.forksCount}×
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-zinc-500">{listing.tagline}</p>
      </div>

      <div className="col-span-1 text-right font-mono text-zinc-100">
        {formatUsd(listing.price.usd)}
      </div>
      <div
        className={`col-span-1 text-right font-mono ${positive24 ? "text-signal-green" : "text-signal-red"}`}
      >
        {formatPct(listing.price.change24h)}
      </div>
      <div
        className={`col-span-1 text-right font-mono ${positive7 ? "text-signal-green" : "text-signal-red"}`}
      >
        {formatPct(listing.price.change7d)}
      </div>
      <div className="col-span-1 text-right font-mono text-zinc-300">
        {formatUsd(listing.performance.revenue24hUsd, { compact: true })}
      </div>
      <div className="col-span-1 text-right font-mono text-zinc-300">
        {formatNumber(listing.performance.missions24h)}
      </div>
      <div className="col-span-1 text-right font-mono">
        <span
          className={
            isElite
              ? "text-signal-green"
              : isWeak
                ? "text-signal-amber"
                : "text-zinc-200"
          }
        >
          {Math.round(listing.performance.successRate * 100)}%
        </span>
      </div>

      <div className="col-span-1">
        <MarketSparkline
          spark={listing.spark}
          missions={listing.missions}
          tone={positive24 ? "up" : "down"}
          width={120}
          height={28}
        />
      </div>

      <div className="col-span-2 flex items-center justify-end gap-1.5">
        {isUserForged ? (
          <Link
            href={`/app/forge?template=${encodeURIComponent(listing.id)}`}
            className="rounded-md border border-signal-blue/40 bg-signal-blue/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-signal-blue transition hover:border-signal-blue"
            title="Fork this public agent into the Forge wizard"
          >
            Fork
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setTradeOpen(true)}
            className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
              positive24
                ? "border-signal-green/40 bg-signal-green/10 text-signal-green hover:border-signal-green"
                : "border-signal-blue/40 bg-signal-blue/10 text-signal-blue hover:border-signal-blue"
            }`}
          >
            Back
          </button>
        )}
        {onLaunch && !isUserForged && (
          <button
            type="button"
            onClick={() => onLaunch(listing)}
            className="rounded-md border border-zinc-800 bg-ink-950 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
          >
            Launch
          </button>
        )}
        <Link
          href={`/app/marketplace/${listing.id}`}
          className="rounded-md border border-zinc-800 bg-ink-950 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
        >
          Profile
        </Link>
      </div>

      {!isUserForged && (
        <TradeDrawer
          listing={listing}
          open={tradeOpen}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </div>
  );
}
