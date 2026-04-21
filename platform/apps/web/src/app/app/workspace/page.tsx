"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppTopBar } from "@/components/app/AppTopBar";
import { MissionComposer } from "@/components/app/MissionComposer";
import { RunArtifactsPanel } from "@/components/app/RunArtifactsPanel";
import { LiveDag } from "@/components/LiveDag";
import { LaunchReplayPanel } from "@/components/app/LaunchReplayPanel";
import { EjectButton } from "@/components/EjectButton";
import { useMissionRun } from "@/lib/useMissionRun";
import type { BlueprintSummary } from "@/components/WebRunner";

type StatusTone = "idle" | "running" | "success" | "error" | "blocked";

export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceView />
    </Suspense>
  );
}

function WorkspaceView() {
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const mission = useMissionRun();
  const searchParams = useSearchParams();
  const initialBlueprintId = searchParams?.get("blueprint") ?? undefined;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/blueprints")
      .then((r) => r.json())
      .then((data: { blueprints: BlueprintSummary[] }) => {
        if (!cancelled) setBlueprints(data.blueprints);
      })
      .catch(() => {
        /* empty blueprints — composer will show its own empty state */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
      if (e.key === "Escape") setShowShortcuts(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const running = mission.run?.status === "running" || mission.connecting;
  const tone: StatusTone = toneFor(mission);
  const label = labelFor(mission);

  const counts = useMemo(() => {
    const out = { total: mission.plan.length, running: 0, success: 0, error: 0 };
    for (const node of mission.plan) {
      const status = mission.statuses[node.id];
      if (status === "running") out.running += 1;
      else if (status === "done") out.success += 1;
      else if (status === "error") out.error += 1;
    }
    return out;
  }, [mission.plan, mission.statuses]);

  return (
    <>
      <AppTopBar statusLabel={label} statusTone={tone} runId={mission.run?.id ?? null} />

      <div className="flex items-center gap-4 border-b border-zinc-800/70 bg-ink-900/60 px-4 py-2">
        <StatusChip tone={tone} label={label} />
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          nodes {counts.total}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
          running {counts.running}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-signal-green">
          success {counts.success}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-signal-red">
          error {counts.error}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowShortcuts((v) => !v)}
            className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
            title="Toggle shortcut cheatsheet (⌘/)"
          >
            ⌘/
          </button>
          <Link
            href="/docs/os/workspace"
            className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
          >
            Docs
          </Link>
        </div>
      </div>

      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <LaunchReplayPanel />
          <div className="relative flex-1 overflow-hidden rounded-2xl border border-zinc-800/80 bg-ink-900/70">
            {mission.plan.length > 0 ? (
              <LiveDag plan={mission.plan} statuses={mission.statuses} />
            ) : (
              <EmptyStage running={running} />
            )}
          </div>

          {mission.eject && mission.run && (
            <EjectButton
              runId={mission.run.id}
              reason={mission.eject.reason}
              blockingNodes={mission.eject.blockingNodes}
            />
          )}

          <MissionComposer
            blueprints={blueprints}
            disabled={running}
            onStart={mission.start}
            initialBlueprintId={initialBlueprintId}
          />
        </div>

        <div className="hidden w-[400px] flex-none lg:flex">
          <RunArtifactsPanel
            logs={mission.logs}
            artifacts={mission.artifacts}
            summary={mission.summary}
            error={mission.error}
          />
        </div>
      </main>

      {showShortcuts && <ShortcutCheatsheet onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

function StatusChip({ tone, label }: { tone: StatusTone; label: string }) {
  const dot: Record<StatusTone, string> = {
    idle: "bg-zinc-500",
    running: "bg-signal-blue animate-pulse",
    success: "bg-signal-green",
    error: "bg-signal-red",
    blocked: "bg-signal-amber",
  };
  return (
    <span className="flex items-center gap-2 rounded-full border border-zinc-800 bg-ink-950/70 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-zinc-300">
      <span className={`h-2 w-2 rounded-full ${dot[tone]}`} />
      {label}
    </span>
  );
}

function ShortcutCheatsheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/80 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-ink-900 p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            Workspace Shortcuts
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
          >
            Esc
          </button>
        </div>
        <h2 className="mt-1 text-lg font-semibold text-zinc-100">Move fast without losing state</h2>
        <ul className="mt-4 space-y-2 text-sm">
          <Shortcut combo="⌘ / Ctrl + Enter" desc="Run the current mission" />
          <Shortcut combo="⌘ / Ctrl + /" desc="Toggle this shortcut panel" />
          <Shortcut combo="Esc" desc="Close any open panel or drawer" />
          <Shortcut combo="Tab" desc="Move between wizard steps and fields" />
        </ul>
        <p className="mt-4 text-xs text-zinc-500">
          These shortcuts work anywhere in the workspace. Launchpad and docs surfaces
          keep their own, simpler shortcut set.
        </p>
      </div>
    </div>
  );
}

function Shortcut({ combo, desc }: { combo: string; desc: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-ink-950/60 px-3 py-2">
      <span className="font-mono text-[11px] text-signal-blue">{combo}</span>
      <span className="text-zinc-300">{desc}</span>
    </li>
  );
}

function EmptyStage({ running }: { running: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
        Agentic Workspace · Engine Room
      </p>
      <h2 className="max-w-xl text-2xl font-semibold text-zinc-100">
        {running ? "Supervisor is planning..." : "What should Umbrella do?"}
      </h2>
      <p className="max-w-xl text-sm text-zinc-400">
        Pick a blueprint below, compose a goal, and hit ⌘ + Enter. Missions that need
        local filesystem, shell, or secrets will surface an Eject affordance.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
        <Link
          href="/app"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
        >
          Back to launchpad
        </Link>
        <Link
          href="/docs/os/workspace"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-signal-blue hover:text-signal-blue"
        >
          Workspace docs
        </Link>
      </div>
    </div>
  );
}

function toneFor(mission: ReturnType<typeof useMissionRun>): StatusTone {
  if (mission.eject) return "blocked";
  if (mission.error) return "error";
  if (mission.summary) return "success";
  if (mission.run?.status === "running" || mission.connecting) return "running";
  return "idle";
}

function labelFor(mission: ReturnType<typeof useMissionRun>): string {
  if (mission.eject) return "eject requested";
  if (mission.error) return "failed";
  if (mission.summary) return "succeeded";
  if (mission.connecting) return "spinning up";
  if (mission.run?.status === "running") return mission.connected ? "streaming" : "running";
  return "idle";
}
