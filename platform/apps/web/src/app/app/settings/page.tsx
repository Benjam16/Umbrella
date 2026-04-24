"use client";

import { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { LocalNodeStatus } from "@/components/LocalNodeStatus";

const RISK_KEY = "umbrella.defaultRisk";

export default function SettingsPage() {
  const [defaultRisk, setDefaultRisk] = useState(5);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(RISK_KEY);
    if (raw) setDefaultRisk(Number(raw));
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(t);
  }, [saved]);

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
        if (!cancelled) {
          setStatusError(err instanceof Error ? err.message : "status failed");
        }
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
      <AppTopBar statusLabel="Settings" statusTone="idle" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Configuration is local to this browser. Accounts + cloud sync arrive with
              Supabase Auth.
            </p>
          </div>

          <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Local node bridge
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Connect your local <code className="font-mono text-signal-blue">umbrella api</code>{" "}
              daemon. When reachable, missions dispatch to your CLI instead of the cloud
              sandbox.
            </p>
            <div className="mt-3">
              <LocalNodeStatus />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Default risk policy
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Initial value of the risk slider when composing new missions. Nodes exceeding
              the threshold trigger the Eject flow.
            </p>
            <label className="mt-3 flex items-center gap-3 font-mono text-[12px] text-zinc-400">
              <input
                type="range"
                min={1}
                max={10}
                value={defaultRisk}
                onChange={(e) => {
                  setDefaultRisk(Number(e.target.value));
                  localStorage.setItem(RISK_KEY, e.target.value);
                  setSaved(true);
                }}
                className="flex-1 accent-signal-blue"
              />
              <span className="w-16 text-right text-zinc-200">{defaultRisk}/10</span>
            </label>
            {saved && <p className="mt-2 text-[11px] text-signal-green">saved</p>}
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              System status
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Live diagnostics for forge chain config, session, Supabase, and indexer lag.
            </p>
            {statusError && (
              <p className="mt-3 rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
                {statusError}
              </p>
            )}
            {status && (
              <div className="mt-3 space-y-3 text-xs">
                <div className="grid gap-2 sm:grid-cols-2">
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

                <div className="rounded-md border border-zinc-800 bg-ink-950/70 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Deployer hot wallet
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <StatusRow
                      label="Deployer key"
                      value={status.deployer?.configured ? "configured" : "missing"}
                      tone={status.deployer?.configured ? "ok" : "warn"}
                    />
                    <StatusRow
                      label="Deployer address"
                      value={status.deployer?.address ?? "–"}
                    />
                    <StatusRow
                      label="Launch chain"
                      value={status.deployer?.chainId ? String(status.deployer.chainId) : "–"}
                    />
                    <StatusRow
                      label="Balance"
                      value={
                        status.deployer?.balanceEth
                          ? `${Number(status.deployer.balanceEth).toFixed(4)} ETH`
                          : "–"
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
                    {status.deployer?.error && (
                      <StatusRow label="Deployer error" value={status.deployer.error} tone="warn" />
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-zinc-800 bg-ink-950/70 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Indexer lag by chain
                  </p>
                  <ul className="mt-2 space-y-1">
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
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Data
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Runs executed in the cloud sandbox are kept anonymously in your browser and,
              when configured, in Supabase.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/api/v1/blueprints"
                target="_blank"
                className="rounded-md border border-zinc-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
              >
                inspect blueprints
              </a>
              <a
                href="/api/health-demo"
                target="_blank"
                className="rounded-md border border-zinc-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
              >
                health
              </a>
            </div>
          </section>
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
