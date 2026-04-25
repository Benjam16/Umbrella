"use client";

import { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";

export default function DebugPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/system/status", { cache: "no-store" });
        const data = (await res.json()) as SystemStatus;
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "status failed");
        if (!cancelled) {
          setStatus(data);
          setStatusError(null);
        }
      } catch (err) {
        if (!cancelled) setStatusError(err instanceof Error ? err.message : "status failed");
      }
    };
    void load();
    const timer = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <>
      <AppTopBar statusLabel="Debug" statusTone="idle" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Debug</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Internal diagnostics for chain config, deployer health, data reachability, and indexer lag.
            </p>
          </div>

          {statusError && (
            <p className="rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
              {statusError}
            </p>
          )}

          {status && (
            <div className="space-y-3 text-xs">
              <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Runtime
                </h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <StatusRow label="Session wallet" value={status.walletSession.wallet ?? "none"} />
                  <StatusRow label="Session active" value={status.walletSession.hasSession ? "yes" : "no"} />
                  <StatusRow label="Forge chain" value={String(status.forge.chainId)} />
                  <StatusRow
                    label="Forge treasury"
                    value={status.forge.treasuryAddress ?? "missing"}
                    tone={status.forge.treasuryAddress ? "ok" : "warn"}
                  />
                  <StatusRow
                    label="Forge min wei"
                    value={status.forge.minPaymentWei ?? "missing"}
                    tone={status.forge.minPaymentWei ? "ok" : "warn"}
                  />
                  <StatusRow label="Kimi key" value={status.forge.kimiConfigured ? "configured" : "missing"} tone={status.forge.kimiConfigured ? "ok" : "warn"} />
                  <StatusRow label="Supabase" value={status.supabase.reachable ? "reachable" : status.supabase.configured ? "configured, unreachable" : "not configured"} tone={status.supabase.reachable ? "ok" : "warn"} />
                  <StatusRow label="Relayer secret" value={status.relayer.relayerSecretConfigured ? "configured" : "missing"} tone={status.relayer.relayerSecretConfigured ? "ok" : "warn"} />
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Deployer hot wallet
                </h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <StatusRow
                    label="Deployer key"
                    value={status.deployer?.configured ? "configured" : "missing"}
                    tone={status.deployer?.configured ? "ok" : "warn"}
                  />
                  <StatusRow label="Deployer address" value={status.deployer?.address ?? "-"} />
                  <StatusRow
                    label="Launch chain"
                    value={status.deployer?.chainId ? String(status.deployer.chainId) : "-"}
                  />
                  <StatusRow
                    label="Balance"
                    value={
                      status.deployer?.balanceEth
                        ? `${Number(status.deployer.balanceEth).toFixed(4)} ETH`
                        : "-"
                    }
                    tone={
                      status.deployer?.balanceEth
                        ? status.deployer.lowBalance
                          ? "warn"
                          : "ok"
                        : undefined
                    }
                  />
                  <StatusRow
                    label="Basescan key"
                    value={status.deployer?.basescanKeyConfigured ? "configured" : "missing"}
                    tone={status.deployer?.basescanKeyConfigured ? "ok" : "warn"}
                  />
                  <StatusRow
                    label="Active RPC"
                    value={status.deployer?.rpcUrl ?? "-"}
                    tone={status.deployer?.primaryRpcLooksLikePlaceholder ? "warn" : undefined}
                  />
                  {status.deployer?.primaryRpcLooksLikePlaceholder && (
                    <StatusRow
                      label="RPC warning"
                      value="BASE_SEPOLIA_RPC_URL still contains <placeholder>. Replace it with your real provider key."
                      tone="warn"
                    />
                  )}
                  {status.deployer?.error && (
                    <StatusRow label="Deployer error" value={status.deployer.error} tone="warn" />
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Indexer lag by chain
                </h2>
                <ul className="mt-3 space-y-1">
                  {status.marketIndexer.chains.map((c) => (
                    <li key={c.cursorId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/80 px-2 py-1">
                      <span className="font-mono text-zinc-300">chain {c.chainId}</span>
                      <span className="text-zinc-500">latest {c.latestBlock ?? "n/a"}</span>
                      <span className="text-zinc-500">cursor {c.cursorBlock ?? "n/a"}</span>
                      <span className={c.lagBlocks !== null && c.lagBlocks < 300 ? "text-signal-green" : "text-signal-amber"}>
                        lag {c.lagBlocks ?? "n/a"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

type SystemStatus = {
  walletSession: { hasSession: boolean; wallet: string | null };
  forge: {
    chainId: number;
    treasuryAddress: string | null;
    minPaymentWei: string | null;
    kimiConfigured: boolean;
  };
  supabase: { configured: boolean; reachable: boolean };
  relayer: { relayerSecretConfigured: boolean };
  deployer?: {
    configured: boolean;
    address: string | null;
    chainId: number | null;
    balanceEth: string | null;
    lowBalance: boolean;
    basescanKeyConfigured: boolean;
    rpcUrl?: string | null;
    rpcCandidates?: string[];
    primaryRpcLooksLikePlaceholder?: boolean;
    error: string | null;
  };
  marketIndexer: {
    chainIds: number[];
    chains: Array<{
      chainId: number;
      cursorId: string;
      latestBlock: number | null;
      cursorBlock: number | null;
      lagBlocks: number | null;
    }>;
  };
};

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-ink-950/70 px-2 py-1.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={tone === "ok" ? "text-signal-green" : tone === "warn" ? "text-signal-amber" : "text-zinc-200"}>
        {value}
      </p>
    </div>
  );
}
