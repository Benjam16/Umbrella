"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

type TradeIntent = {
  id: string;
  hook_id: string;
  side: "buy" | "sell";
  amount_usd: number;
  token_amount: number | null;
  status: "queued" | "submitted" | "confirmed" | "failed";
  tx_hash: string | null;
  created_at: string;
};

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [intents, setIntents] = useState<TradeIntent[] | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setIntents([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/v1/trades/intents?wallet=${encodeURIComponent(address.toLowerCase())}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { intents?: TradeIntent[] };
        if (!cancelled) setIntents(data.intents ?? []);
      } catch {
        if (!cancelled) setIntents([]);
      }
    };
    void load();
    const timer = setInterval(load, 8_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isConnected, address]);

  const totals = useMemo(() => {
    const all = intents ?? [];
    const buyUsd = all
      .filter((t) => t.side === "buy")
      .reduce((acc, t) => acc + Number(t.amount_usd || 0), 0);
    const sellUsd = all
      .filter((t) => t.side === "sell")
      .reduce((acc, t) => acc + Number(t.amount_usd || 0), 0);
    return { buyUsd, sellUsd, net: buyUsd - sellUsd };
  }, [intents]);

  return (
    <main className="flex-1 overflow-y-auto">
      <section className="mx-auto max-w-[1100px] px-6 py-8">
        <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
          Portfolio
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Trades & Position History</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Wallet-linked trade intents captured from the marketplace buy/sell flow.
        </p>

        {!isConnected && (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-ink-900/50 p-4 text-sm text-zinc-300">
            Connect your wallet from the top-right to view your history.
          </div>
        )}

        {isConnected && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Stat label="Buy volume" value={`$${totals.buyUsd.toFixed(2)}`} tone="good" />
              <Stat label="Sell volume" value={`$${totals.sellUsd.toFixed(2)}`} />
              <Stat
                label="Net flow"
                value={`$${totals.net.toFixed(2)}`}
                tone={totals.net >= 0 ? "good" : "warn"}
              />
            </div>

            <section className="mt-5 rounded-xl border border-zinc-800 bg-ink-900/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Recent intents
                </h2>
                <Link
                  href="/app/marketplace"
                  className="font-mono text-[10px] uppercase tracking-widest text-signal-blue hover:underline"
                >
                  Trade more →
                </Link>
              </div>
              <ul className="space-y-2">
                {(intents ?? []).length === 0 && (
                  <li className="rounded-md border border-dashed border-zinc-800 p-4 text-center text-sm text-zinc-500">
                    No trades yet.
                  </li>
                )}
                {(intents ?? []).map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800/80 bg-ink-950/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                          t.side === "buy"
                            ? "border border-signal-green/40 bg-signal-green/10 text-signal-green"
                            : "border border-signal-red/40 bg-signal-red/10 text-signal-red"
                        }`}
                      >
                        {t.side}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-400">
                        ${Number(t.amount_usd).toFixed(2)}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-600">
                        {new Date(t.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                        {t.status}
                      </span>
                      <Link
                        href={`/app/marketplace/${t.hook_id}`}
                        className="font-mono text-[10px] uppercase tracking-widest text-signal-blue hover:underline"
                      >
                        token →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </section>
    </main>
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
  const cls =
    tone === "good"
      ? "text-signal-green"
      : tone === "warn"
        ? "text-signal-amber"
        : "text-zinc-100";
  return (
    <div className="rounded-lg border border-zinc-800 bg-ink-900/50 px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-lg ${cls}`}>{value}</p>
    </div>
  );
}

