"use client";

import { useEffect, useMemo, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type HookRow = {
  id: string;
  wallet_address: string;
  tx_hash: string;
  model: string;
  created_at: string;
  solidity_code: string;
};

export default function ForgePage() {
  const [wallet, setWallet] = useState("");
  const [hooks, setHooks] = useState<HookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const normalizedWallet = useMemo(() => wallet.trim().toLowerCase(), [wallet]);

  async function load() {
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/forge/hooks?wallet=${normalizedWallet}`);
      const data = (await res.json()) as { hooks?: HookRow[] };
      setHooks(data.hooks ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedWallet]);

  useEffect(() => {
    if (!/^0x[a-f0-9]{40}$/.test(normalizedWallet)) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`generated-hooks-${normalizedWallet}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "generated_hooks",
          filter: `wallet_address=eq.${normalizedWallet}`,
        },
        (payload) => {
          const row = payload.new as HookRow;
          setHooks((prev) => [row, ...prev.filter((x) => x.id !== row.id)]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [normalizedWallet]);

  return (
    <>
      <AppTopBar statusLabel="forge" statusTone="idle" />
      <main className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <h1 className="text-lg font-semibold text-zinc-100">Serverless Forge Output</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Enter a wallet to watch generated hook code stream in via Supabase Realtime.
            </p>
            <input
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 outline-none"
              placeholder="0x..."
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
            />
          </section>

          {loading && <p className="text-sm text-zinc-400">Loading...</p>}

          {hooks.map((h) => (
            <article key={h.id} className="rounded-xl border border-zinc-800 bg-ink-900/60 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                <span>{new Date(h.created_at).toLocaleString()}</span>
                <span>{h.model}</span>
                <span className="font-mono">{h.tx_hash.slice(0, 12)}...</span>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-200">
                {h.solidity_code}
              </pre>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}

