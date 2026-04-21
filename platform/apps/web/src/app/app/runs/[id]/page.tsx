"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppTopBar } from "@/components/app/AppTopBar";
import { LiveDag } from "@/components/LiveDag";
import { RunArtifactsPanel } from "@/components/app/RunArtifactsPanel";
import { EjectButton } from "@/components/EjectButton";
import { OnchainProofBadge } from "@/components/OnchainProofBadge";
import { useMissionRun } from "@/lib/useMissionRun";

export default function RunDetailPage() {
  const params = useParams();
  const runId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const mission = useMissionRun();

  useEffect(() => {
    if (runId) mission.replay(runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const tone = mission.error
    ? "error"
    : mission.eject
      ? "blocked"
      : mission.summary
        ? "success"
        : mission.run?.status === "running" || mission.connecting
          ? "running"
          : "idle";

  return (
    <>
      <AppTopBar
        statusLabel={mission.run?.status ?? "loading"}
        statusTone={tone}
        runId={runId}
      />
      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-ink-900/70 px-4 py-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                Mission
              </p>
              <p className="mt-1 text-sm text-zinc-100">
                {mission.run?.goal ?? "(loading)"}
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                blueprint {mission.run?.blueprintId ?? "—"} · mode {mission.run?.mode ?? "—"}
              </p>
            </div>
            <Link
              href="/app"
              className="rounded-md border border-zinc-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:border-signal-blue hover:text-signal-blue"
            >
              new mission
            </Link>
          </div>

          <div className="relative flex-1 overflow-hidden rounded-2xl border border-zinc-800/80 bg-ink-900/70">
            {mission.plan.length > 0 ? (
              <LiveDag plan={mission.plan} statuses={mission.statuses} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                {mission.connecting ? "loading run…" : "no DAG"}
              </div>
            )}
          </div>

          {mission.eject && (
            <EjectButton
              runId={runId}
              reason={mission.eject.reason}
              blockingNodes={mission.eject.blockingNodes}
            />
          )}

          {mission.anchor && <OnchainProofBadge anchor={mission.anchor} />}
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
