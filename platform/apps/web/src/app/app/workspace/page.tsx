"use client";

import { useEffect, useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { MissionComposer } from "@/components/app/MissionComposer";
import { RunArtifactsPanel } from "@/components/app/RunArtifactsPanel";
import { LiveDag } from "@/components/LiveDag";
import { EjectButton } from "@/components/EjectButton";
import { useMissionRun } from "@/lib/useMissionRun";
import type { BlueprintSummary } from "@/components/WebRunner";

export default function WorkspacePage() {
  const [blueprints, setBlueprints] = useState<BlueprintSummary[]>([]);
  const mission = useMissionRun();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/blueprints")
      .then((r) => r.json())
      .then((data: { blueprints: BlueprintSummary[] }) => {
        if (!cancelled) setBlueprints(data.blueprints);
      })
      .catch(() => {
        /* leave empty — the composer will show "no blueprints" state */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const running = mission.run?.status === "running" || mission.connecting;
  const tone = toneFor(mission);
  const label = labelFor(mission);

  return (
    <>
      <AppTopBar statusLabel={label} statusTone={tone} runId={mission.run?.id ?? null} />
      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
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
    </>
  );
}

function EmptyStage({ running }: { running: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
        Agentic Terminal · v0.1
      </p>
      <h2 className="max-w-xl text-2xl font-semibold text-zinc-100">
        {running ? "Supervisor is planning…" : "What should Umbrella do?"}
      </h2>
      <p className="max-w-xl text-sm text-zinc-400">
        Pick a blueprint below. The cloud sandbox runs with a restricted tool allowlist -
        missions that need local filesystem, shell, or secrets surface an Eject affordance.
      </p>
    </div>
  );
}

function toneFor(
  mission: ReturnType<typeof useMissionRun>,
): "idle" | "running" | "success" | "error" | "blocked" {
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
