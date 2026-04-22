"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { AgentListing } from "@/lib/marketplace";
import { formatUsd } from "@/lib/marketplace";

type Side = "buy" | "sell";

type Props = {
  listing: AgentListing;
  open: boolean;
  onClose: () => void;
  initialSide?: Side;
};

/**
 * Mini-swap UI that sits inside the marketplace card. Built to match the
 * Umbrella Performance Hook v4 pool — the fee you see here is the *dynamic*
 * fee the hook applies based on the agent's success rate, not a static pool
 * fee, and the "Agent treasury cut" line surfaces the afterSwap redirect.
 *
 * The handler is intentionally a no-op: wire `wagmi.useWriteContract` +
 * Coinbase Paymaster capabilities in Phase 2. All state shown here
 * (dynamicFeeBps, treasuryBps, runway) is the same state the real
 * transaction will read from the hook.
 */
export function TradeDrawer({ listing, open, onClose, initialSide = "buy" }: Props) {
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (!open) return;
    setSide(initialSide);
  }, [open, initialSide]);

  const parsed = Number(amount);
  const feeBps = listing.performance.dynamicFeeBps;
  const treasuryBps = 50; // 0.5% afterSwap diversion to the agent treasury
  const output = useMemo(() => {
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    // Buy: USD in → tokens out. Sell: tokens in → USD out. We quote at spot,
    // then apply the hook fee + treasury cut so the user sees the real
    // economic impact of the v4 hook in the slippage card.
    const priceUsd = listing.price.usd;
    if (side === "buy") {
      const gross = parsed / priceUsd;
      const net = gross * (1 - (feeBps + treasuryBps) / 10_000);
      return { tokens: net, usd: parsed };
    }
    const gross = parsed * priceUsd;
    const net = gross * (1 - (feeBps + treasuryBps) / 10_000);
    return { tokens: parsed, usd: net };
  }, [parsed, side, listing.price.usd, feeBps]);

  const glow =
    listing.performance.successRate >= 0.95
      ? "border-signal-green/40 shadow-[0_0_40px_-10px_rgba(34,211,166,0.4)]"
      : "border-zinc-800";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="trade-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            key="trade-panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`absolute left-1/2 top-1/2 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border ${glow} bg-ink-900/95 p-5`}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Uniswap v4 · Umbrella Performance Hook
                </div>
                <div className="mt-1 text-lg font-semibold text-zinc-100">
                  {listing.name}
                  <span className="ml-2 font-mono text-[13px] text-zinc-500">
                    {listing.symbol}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-zinc-500">
                  {formatUsd(listing.price.usd)} · {listing.performance.missions24h} missions · 24h
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-100"
              >
                esc
              </button>
            </div>

            <div className="mb-4 flex gap-1 rounded-lg border border-zinc-800 p-1">
              {(["buy", "sell"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`flex-1 rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                    side === s
                      ? s === "buy"
                        ? "bg-signal-green/15 text-signal-green"
                        : "bg-signal-red/15 text-signal-red"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {side === "buy" ? "Pay (USDC)" : `Sell (${listing.symbol})`}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2.5 text-right font-mono text-[20px] text-zinc-100 outline-none focus:border-signal-blue"
              />
            </label>

            <div className="mt-3 rounded-md border border-zinc-800 bg-ink-950 p-3 font-mono text-[11px] text-zinc-400">
              <Row label="You receive">
                {output
                  ? side === "buy"
                    ? `${output.tokens.toFixed(2)} ${listing.symbol}`
                    : `$${output.usd.toFixed(2)}`
                  : "—"}
              </Row>
              <Row
                label="Hook fee (dynamic)"
                tone={feeBps <= 10 ? "good" : feeBps >= 80 ? "warn" : undefined}
              >
                {(feeBps / 100).toFixed(2)}%
                {feeBps <= 10 && <span className="ml-2 text-signal-green">◉ high-success discount</span>}
              </Row>
              <Row label="Agent treasury cut (afterSwap)">
                {(treasuryBps / 100).toFixed(2)}% → buy &amp; burn
              </Row>
              <Row label="Runway added">
                {output ? `+${Math.round((output.usd * (treasuryBps / 10_000)) / 0.0001)} gas units` : "—"}
              </Row>
            </div>

            <button
              type="button"
              disabled={!output || output.usd <= 0}
              onClick={() => {
                // Phase 2: wagmi.useWriteContract against the v4 PoolManager
                // with capabilities.paymasterService.url = UMBRELLA_PAYMASTER.
                alert(
                  `Simulated ${side} ${listing.symbol} via Uniswap v4 hook.\n\nPaymaster will sponsor gas via the Umbrella tank. Wire the real call in Phase 2 (wagmi + paymaster capabilities).`,
                );
              }}
              className={`mt-4 w-full rounded-md border py-2.5 font-mono text-[12px] uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-40 ${
                side === "buy"
                  ? "border-signal-green/40 bg-signal-green/10 text-signal-green hover:border-signal-green"
                  : "border-signal-red/40 bg-signal-red/10 text-signal-red hover:border-signal-red"
              }`}
            >
              {side === "buy" ? `Back ${listing.symbol}` : `Exit ${listing.symbol}`} · gas sponsored
            </button>

            <p className="mt-3 text-center text-[10px] text-zinc-600">
              Routed through Umbrella Performance Hook · afterSwap diverts{" "}
              {(treasuryBps / 100).toFixed(2)}% to the agent&apos;s Coinbase Smart Wallet
              for autonomous buy &amp; burn.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "good" | "warn";
}) {
  const toneCls =
    tone === "good" ? "text-signal-green" : tone === "warn" ? "text-signal-amber" : "text-zinc-200";
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{label}</span>
      <span className={toneCls}>{children}</span>
    </div>
  );
}
