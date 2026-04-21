"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppTopBar } from "@/components/app/AppTopBar";
import { TokenLaunchWizard, type WizardResult } from "@/components/app/TokenLaunchWizard";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import {
  markLaunchError,
  markLaunchReady,
  newLaunchId,
  upsertPendingLaunch,
} from "@/lib/recent-launches";

type HookRow = {
  id: string;
  wallet_address: string;
  tx_hash: string;
  model: string;
  created_at: string;
  solidity_code: string;
};

type ForkTemplate = {
  id: string;
  prompt: string;
  model: string;
};

export default function ForgePage() {
  return (
    <Suspense fallback={null}>
      <ForgeView />
    </Suspense>
  );
}

function ForgeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams?.get("template") ?? null;
  const [wallet, setWallet] = useState("");
  const [hooks, setHooks] = useState<HookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [template, setTemplate] = useState<ForkTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const normalizedWallet = useMemo(() => wallet.trim().toLowerCase(), [wallet]);

  // Resolve a `?template=<hookId>` into the initial wizard seed values.
  // The endpoint returns 404 for private rows, so we just surface a soft
  // message and let the wizard render empty if that happens.
  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      setTemplateError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/forge/templates/${encodeURIComponent(templateId)}`,
        );
        if (!res.ok) {
          if (!cancelled) setTemplateError("template not found or no longer public");
          return;
        }
        const data = (await res.json()) as { template: ForkTemplate };
        if (!cancelled) {
          setTemplate(data.template);
          setTemplateError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTemplateError(
            err instanceof Error ? err.message : "failed to load template",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

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

  async function handleSubmit(result: WizardResult) {
    setWallet(result.walletAddress);

    // Stash an optimistic "Initializing..." card and jump to the workspace
    // immediately — the user shouldn't have to wait on Kimi to feel progress.
    const launchId = newLaunchId();
    upsertPendingLaunch({
      id: launchId,
      walletAddress: result.walletAddress,
      name: result.identity.name,
      symbol: result.identity.symbol,
      category: result.mission.category,
      prompt: result.mission.prompt,
      status: "initializing",
      createdAt: Date.now(),
    });
    router.push("/app/workspace");

    try {
      const res = await fetch("/api/v1/forge/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "launch failed" }));
        throw new Error(err?.error ?? "launch failed");
      }
      const data = (await res.json()) as {
        hook?: { id?: string; model?: string };
      };
      markLaunchReady(launchId, {
        hookId: data.hook?.id,
        model: data.hook?.model,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "launch failed";
      markLaunchError(launchId, msg);
      throw err instanceof Error ? err : new Error(msg);
    }
  }

  return (
    <>
      <AppTopBar statusLabel="forge" statusTone="idle" />
      <main className="flex-1 overflow-y-auto">
        <section className="border-b border-zinc-800/60 bg-gradient-to-b from-signal-blue/[0.06] to-transparent">
          <div className="mx-auto max-w-[1180px] px-6 py-8">
            <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
              Umbrella · Forge
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-100">
              Launch your agent token in 3 steps
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-zinc-400">
              The guided wizard keeps launching simple. Umbrella handles payment
              verification, Solidity generation, and artifact streaming automatically.
              Advanced users can expand the technical panel at any step.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-[1180px] space-y-6 px-6 py-6">
          {templateError && (
            <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/5 px-3 py-2 font-mono text-[11px] text-signal-amber">
              {templateError}
            </div>
          )}
          <TokenLaunchWizard
            key={template?.id ?? "blank"}
            onSubmit={handleSubmit}
            initial={
              template
                ? {
                    mission: {
                      prompt: template.prompt,
                      category: "research",
                    },
                  }
                : undefined
            }
            contextNotice={
              template
                ? {
                    label: `Forked from ${template.id.slice(0, 8)}…`,
                    detail: `Model: ${template.model}. Prompt copied — edit any step before launching.`,
                  }
                : undefined
            }
          />

          <section className="rounded-xl border border-zinc-800 bg-ink-900/60 p-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Generated Artifacts</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Live stream via Supabase Realtime. Enter or launch with a wallet to see
                  artifacts appear here.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  placeholder="0x wallet to track"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  className="w-60 rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none focus:border-signal-blue"
                />
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
                >
                  {showRaw ? "Hide source" : "View source"}
                </button>
              </div>
            </header>

            {loading && <p className="mt-4 text-sm text-zinc-400">Loading...</p>}

            {!loading && hooks.length === 0 && (
              <p className="mt-4 rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
                No artifacts yet. Complete a launch to populate this feed.
              </p>
            )}

            <div className="mt-4 space-y-3">
              {hooks.map((h) => (
                <article
                  key={h.id}
                  className="rounded-lg border border-zinc-800 bg-ink-950/80 p-3"
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                    <span>{h.model}</span>
                    <span className="font-mono">{h.tx_hash.slice(0, 12)}...</span>
                  </div>
                  {showRaw && (
                    <pre className="mt-3 max-h-[360px] overflow-auto rounded-md bg-ink-900 p-3 text-xs text-zinc-200">
                      {h.solidity_code}
                    </pre>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
