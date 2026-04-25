"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type Row = {
  id: string;
  side: string;
  price_usd: number | null;
  size_usd: number | null;
  hook_id: string;
  traded_at: string;
  source_chain_id: number | null;
  log_index: number | null;
};

/**
 * Global market heartbeat from live trade inserts.
 */
export function GlobalTicker() {
  const [rows, setRows] = useState<Row[]>([]);
  const [supabaseOk, setSupabaseOk] = useState(false);

  const line = useMemo(() => {
    if (rows.length === 0) return "";
    return rows
      .map((r) => {
        const price = r.price_usd != null ? `$${Number(r.price_usd).toFixed(4)}` : "market";
        const size = r.size_usd != null ? `$${Number(r.size_usd).toLocaleString()}` : "liquidity";
        const hook = (r.hook_id ?? "").slice(0, 6);
        const verb = r.side === "buy" ? "bought" : "sold";
        return `Someone ${verb} ${size} at ${price} · agent ${hook}…`;
      })
      .join("   ·   ");
  }, [rows]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setSupabaseOk(false);
      return;
    }
    setSupabaseOk(true);

    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("market_trades")
        .select(
          "id, side, price_usd, size_usd, hook_id, traded_at, source_chain_id, log_index",
        )
        .order("traded_at", { ascending: false })
        .limit(24);
      if (cancelled || !data) return;
      setRows(data as Row[]);
    })();

    const channel = supabase.channel("umbrella-global-ticker");
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "market_trades" },
      (payload) => {
        const n = payload.new as Row;
        setRows((prev) => {
          const next = [n, ...prev.filter((r) => r.id !== n.id)];
          return next.slice(0, 40);
        });
      },
    );
    void channel.subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="flex h-8 w-full shrink-0 items-center border-b border-zinc-800/60 bg-ink-900/90 px-4 text-[10px] text-zinc-400">
      <span className="shrink-0 font-mono uppercase tracking-widest text-signal-blue">
        Live
      </span>
      <div className="relative ml-3 min-h-[1.25rem] min-w-0 flex-1 overflow-hidden">
        {!supabaseOk ? (
          <p className="truncate text-zinc-500">Live trade feed connecting…</p>
        ) : line ? (
          <div className="flex w-max animate-ticker-marquee">
            <span className="whitespace-nowrap pr-16 font-mono text-zinc-300" aria-hidden={false}>
              {line}
            </span>
            <span className="whitespace-nowrap pr-16 font-mono text-zinc-300" aria-hidden>
              {line}
            </span>
          </div>
        ) : (
          <p className="truncate text-zinc-500">Waiting for the next Umbrella trade…</p>
        )}
      </div>
    </div>
  );
}
