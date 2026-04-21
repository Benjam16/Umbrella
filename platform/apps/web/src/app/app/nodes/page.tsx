"use client";

import { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { LocalNodeStatus } from "@/components/LocalNodeStatus";
import { NodePairing } from "@/components/app/NodePairing";

/**
 * Pulse monitor for Umbrella Remote Nodes. Three sections:
 *
 *  1. This browser         — LocalNodeStatus (probes a local http daemon)
 *  2. Paired CLIs          — NodePairing (reads/writes `umbrella.pairedNodes`)
 *  3. Bridge instructions  — how to run `umbrella connect` / `umbrella pull`
 *
 * Designed to stop being a stub and start being a live dashboard — the green
 * dots update in real time as the local daemon comes up, goes down, or you
 * pair new machines via the CLI.
 */
export default function NodesPage() {
  const [uptime, setUptime] = useState(0);
  const [webOrigin, setWebOrigin] = useState<string>("");

  useEffect(() => {
    const start = Date.now();
    const tick = () => setUptime(Math.floor((Date.now() - start) / 1000));
    const i = setInterval(tick, 1000);
    tick();
    if (typeof window !== "undefined") setWebOrigin(window.location.origin);
    return () => clearInterval(i);
  }, []);

  return (
    <>
      <AppTopBar statusLabel="Nodes" statusTone="idle" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <header>
            <h1 className="text-2xl font-semibold text-zinc-100">Nodes</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Local machines you&apos;ve paired with this Umbrella deployment.
              High-risk missions route here automatically — the cloud sandbox
              never touches your filesystem, shell, or secrets.
            </p>
          </header>

          <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                This browser
              </h2>
              <p className="font-mono text-[10px] text-zinc-500">
                session {formatUptime(uptime)}
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              The local daemon URL is probed every 15s. When you&apos;re running{" "}
              <code className="font-mono text-zinc-300">umbrella up</code> on
              this machine, the dot goes green.
            </p>
            <div className="mt-3">
              <LocalNodeStatus />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Paired CLIs
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Run{" "}
              <code className="font-mono text-zinc-300">umbrella connect</code>{" "}
              on another machine — it prints a <b>6-character pairing code</b>.
              Paste it below to register that machine as a remote executor.
            </p>
            <div className="mt-3">
              <NodePairing />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Bridge instructions
            </h2>
            <ol className="mt-3 space-y-3 text-sm text-zinc-300">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-signal-blue/20 text-[10px] font-semibold text-signal-blue">
                  1
                </span>
                <div className="flex-1">
                  <p>Install the CLI (once per machine):</p>
                  <code className="mt-1 block rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-[12px] text-signal-green">
                    $ npm i -g @benjam16/umbrella
                  </code>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-signal-blue/20 text-[10px] font-semibold text-signal-blue">
                  2
                </span>
                <div className="flex-1">
                  <p>
                    Generate a pairing code (pointed at{" "}
                    <code className="font-mono text-zinc-300">
                      {webOrigin || "this deployment"}
                    </code>
                    ):
                  </p>
                  <code className="mt-1 block rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-[12px] text-signal-green">
                    $ umbrella connect{webOrigin ? ` --web ${webOrigin}` : ""}
                  </code>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-signal-blue/20 text-[10px] font-semibold text-signal-blue">
                  3
                </span>
                <div className="flex-1">
                  <p>
                    Paste the pairing code into <b>Paired CLIs</b> above. When
                    a cloud run ejects, pull it locally:
                  </p>
                  <code className="mt-1 block rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-[12px] text-signal-green">
                    $ umbrella pull &lt;runId&gt;
                  </code>
                  <p className="mt-2 text-xs text-zinc-500">
                    The CLI fetches{" "}
                    <code className="font-mono">
                      /api/v1/runs/&lt;runId&gt;
                    </code>
                    , hydrates the DAG, and writes the plan, logs, and artifacts
                    into <code className="font-mono">./research/&lt;runId&gt;/</code>.
                  </p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </main>
    </>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}
