"use client";

import { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { LocalNodeStatus } from "@/components/LocalNodeStatus";

const RISK_KEY = "umbrella.defaultRisk";

export default function SettingsPage() {
  const [defaultRisk, setDefaultRisk] = useState(5);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(RISK_KEY);
    if (raw) setDefaultRisk(Number(raw));
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(t);
  }, [saved]);

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
