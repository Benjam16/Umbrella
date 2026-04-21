"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveDag, type NodeStatus } from "./LiveDag";
import { EjectButton } from "./EjectButton";
import { getLocalNodeUrl, LocalNodeStatus } from "./LocalNodeStatus";
import type { PlannedNode, RunEvent, RunRecord } from "@umbrella/runner/types";

export type BlueprintSummary = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  sampleGoal: string;
  estimatedSeconds: number;
  maxRisk: number;
  inputs: Array<{
    key: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    type?: "text" | "url" | "textarea";
    helper?: string;
  }>;
};

type Props = {
  blueprints: BlueprintSummary[];
  initialBlueprintId?: string;
};

type LogLine = {
  id: number;
  kind: "sys" | "out" | "err" | "node";
  text: string;
};

type Artifact = {
  id: string;
  name: string;
  mime: string;
  content: string;
};

/**
 * The cloud-sandbox entry point. Lets a visitor pick a blueprint, run it
 * against the hosted API, and stream the resulting DAG live. When the mission
 * hits a risk / capability wall, the Eject affordance renders the matching
 * `umbrella pull` command for the local CLI.
 */
export function WebRunner({ blueprints, initialBlueprintId }: Props) {
  const [blueprintId, setBlueprintId] = useState(
    initialBlueprintId ?? blueprints[0]?.id ?? "",
  );
  const blueprint = useMemo(
    () => blueprints.find((b) => b.id === blueprintId),
    [blueprints, blueprintId],
  );

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [goal, setGoal] = useState("");
  const [riskThreshold, setRiskThreshold] = useState(5);

  const [run, setRun] = useState<RunRecord | null>(null);
  const [plan, setPlan] = useState<PlannedNode[]>([]);
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [ejectPayload, setEjectPayload] = useState<{
    reason?: string;
    blockingNodes?: string[];
  } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const logIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  // Reset form state when user swaps blueprints before starting a run.
  useEffect(() => {
    if (run) return;
    setInputs({});
    setGoal("");
  }, [blueprintId, run]);

  const pushLog = useCallback((kind: LogLine["kind"], text: string) => {
    setLogs((prev) => {
      const id = ++logIdRef.current;
      return [...prev, { id, kind, text }];
    });
  }, []);

  const applyEvent = useCallback(
    (event: RunEvent) => {
      if (event.kind === "plan") {
        const nodes = (event.payload.nodes as PlannedNode[]) ?? [];
        setPlan(nodes);
        setStatuses(Object.fromEntries(nodes.map((n) => [n.id, "idle" as NodeStatus])));
        pushLog("sys", `plan: ${nodes.length} nodes`);
        return;
      }
      if (event.kind === "node.start") {
        const id = String(event.payload.id ?? "");
        setStatuses((s) => ({ ...s, [id]: "running" }));
        pushLog("node", `→ ${id} ${event.payload.label ?? ""}`);
        return;
      }
      if (event.kind === "node.log") {
        const id = String(event.payload.id ?? "");
        const line = String(event.payload.line ?? "");
        pushLog("out", `  [${id}] ${line}`);
        return;
      }
      if (event.kind === "node.finish") {
        const id = String(event.payload.id ?? "");
        const ok = Boolean(event.payload.ok);
        setStatuses((s) => ({ ...s, [id]: ok ? "done" : "error" }));
        pushLog(ok ? "out" : "err", `${ok ? "✓" : "✗"} ${id}`);
        return;
      }
      if (event.kind === "artifact") {
        setArtifacts((a) => [
          ...a,
          {
            id: String(event.payload.id ?? Math.random()),
            name: String(event.payload.name ?? "artifact.md"),
            mime: String(event.payload.mime ?? "text/plain"),
            content: String(event.payload.content ?? ""),
          },
        ]);
        pushLog("sys", `artifact sealed: ${event.payload.name}`);
        return;
      }
      if (event.kind === "eject.requested") {
        const blocking = (event.payload.blockingNodes as string[]) ?? [];
        setEjectPayload({
          reason: String(event.payload.reason ?? ""),
          blockingNodes: blocking,
        });
        setStatuses((s) => {
          const next = { ...s };
          for (const id of blocking) next[id] = "blocked";
          return next;
        });
        pushLog("err", `eject requested: ${event.payload.reason}`);
        return;
      }
      if (event.kind === "run.finish") {
        setSummary(String(event.payload.summary ?? ""));
        pushLog("sys", "run complete");
        return;
      }
      if (event.kind === "run.error") {
        setError(String(event.payload.error ?? "unknown error"));
        pushLog("err", String(event.payload.error ?? "unknown error"));
      }
    },
    [pushLog],
  );

  const start = useCallback(async () => {
    if (!blueprint) return;
    setConnecting(true);
    setError(null);
    setSummary(null);
    setArtifacts([]);
    setStatuses({});
    setPlan([]);
    setLogs([]);
    setEjectPayload(null);
    logIdRef.current = 0;

    const localUrl = typeof window !== "undefined" ? getLocalNodeUrl() : null;
    const endpoint = localUrl ? `${localUrl}/v1/runs` : "/api/v1/runs";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprintId: blueprint.id,
          goal: goal || blueprint.sampleGoal,
          inputs,
          riskThreshold,
          mode: localUrl ? "remote" : "cloud",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `http ${res.status}`);
      }
      const data = (await res.json()) as { run: RunRecord; eventsUrl: string };
      setRun(data.run);
      pushLog("sys", `mission ${data.run.id.slice(0, 8)} queued — ${blueprint.title}`);
      const url = localUrl
        ? `${localUrl}${data.eventsUrl}`
        : data.eventsUrl;
      const es = new EventSource(url);
      esRef.current = es;
      setConnected(false);

      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
      };

      const handle = (ev: MessageEvent) => {
        try {
          const event = JSON.parse(ev.data) as RunEvent;
          applyEvent(event);
        } catch {
          /* ignore non-json heartbeats */
        }
      };

      for (const kind of [
        "plan",
        "node.start",
        "node.log",
        "node.finish",
        "artifact",
        "eject.requested",
        "run.finish",
        "run.error",
      ]) {
        es.addEventListener(kind, handle as EventListener);
      }
      es.addEventListener("done", () => {
        es.close();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      pushLog("err", msg);
    } finally {
      setConnecting(false);
    }
  }, [applyEvent, blueprint, goal, inputs, pushLog, riskThreshold]);

  const reset = () => {
    esRef.current?.close();
    esRef.current = null;
    setRun(null);
    setPlan([]);
    setStatuses({});
    setLogs([]);
    setArtifacts([]);
    setSummary(null);
    setError(null);
    setEjectPayload(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <LocalNodeStatus />

        <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
          <label className="block text-[11px] uppercase tracking-wider text-zinc-500">
            Blueprint
          </label>
          <select
            value={blueprintId}
            onChange={(e) => setBlueprintId(e.target.value)}
            disabled={Boolean(run)}
            className="mt-2 w-full rounded-md border border-zinc-800 bg-ink-950 px-2 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-signal-blue disabled:opacity-50"
          >
            {blueprints.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          {blueprint && (
            <p className="mt-2 text-sm text-zinc-400">{blueprint.description}</p>
          )}
          {blueprint && blueprint.maxRisk >= 7 && (
            <p className="mt-2 rounded-md border border-signal-amber/40 bg-signal-amber/5 px-2 py-1 text-[11px] text-signal-amber">
              High-risk blueprint — will request eject to local CLI.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4 space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-500">
              Goal
            </label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={Boolean(run)}
              placeholder={blueprint?.sampleGoal ?? ""}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-ink-950 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-signal-blue disabled:opacity-50"
            />
          </div>
          {blueprint?.inputs.map((field) => (
            <div key={field.key}>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500">
                {field.label}
                {field.required ? " *" : ""}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  value={inputs[field.key] ?? ""}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  disabled={Boolean(run)}
                  rows={3}
                  placeholder={field.placeholder}
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-ink-950 px-2 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-signal-blue disabled:opacity-50"
                />
              ) : (
                <input
                  type={field.type === "url" ? "url" : "text"}
                  value={inputs[field.key] ?? ""}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  disabled={Boolean(run)}
                  placeholder={field.placeholder}
                  className="mt-1 w-full rounded-md border border-zinc-800 bg-ink-950 px-2 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-signal-blue disabled:opacity-50"
                />
              )}
              {field.helper && (
                <p className="mt-1 text-[11px] text-zinc-500">{field.helper}</p>
              )}
            </div>
          ))}
          <div>
            <label className="flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
              <span>Risk policy</span>
              <span className="font-mono text-zinc-300">{riskThreshold}/10</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={riskThreshold}
              onChange={(e) => setRiskThreshold(Number(e.target.value))}
              disabled={Boolean(run)}
              className="mt-1 w-full accent-signal-blue"
            />
          </div>
          {!run ? (
            <button
              type="button"
              onClick={start}
              disabled={connecting || !blueprint}
              className="w-full rounded-md border border-signal-blue/50 bg-signal-blue/10 px-3 py-2 text-sm font-semibold uppercase tracking-wider text-signal-blue transition hover:border-signal-blue disabled:opacity-50"
            >
              {connecting ? "spinning up…" : "Run mission"}
            </button>
          ) : (
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-md border border-zinc-800 px-3 py-2 text-sm uppercase tracking-wider text-zinc-300 hover:border-signal-blue hover:text-signal-blue"
            >
              New mission
            </button>
          )}
        </div>
      </aside>

      <section className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-ink-900/70 px-3 py-2 text-[11px] font-mono">
          <StatusBadge run={run} connected={connected} />
          <span className="ml-auto text-zinc-500">
            {run ? `run ${run.id.slice(0, 8)}` : "idle"}
          </span>
        </div>

        {plan.length > 0 ? (
          <LiveDag plan={plan} statuses={statuses} />
        ) : (
          <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-zinc-800/80 bg-ink-900/40 text-sm text-zinc-500">
            {run ? "Awaiting plan…" : "Pick a blueprint and run a mission to see the DAG build live."}
          </div>
        )}

        {ejectPayload && run && (
          <EjectButton
            runId={run.id}
            reason={ejectPayload.reason}
            blockingNodes={ejectPayload.blockingNodes}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800/80 bg-ink-950/80 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                Live log
              </span>
              <span className="font-mono text-[10px] text-zinc-600">
                {logs.length} lines
              </span>
            </div>
            <div className="h-[220px] overflow-auto font-mono text-[12px] leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-zinc-600">waiting for events…</p>
              ) : (
                logs.map((l) => (
                  <div
                    key={l.id}
                    className={
                      l.kind === "err"
                        ? "text-signal-red"
                        : l.kind === "sys"
                          ? "text-signal-blue"
                          : l.kind === "node"
                            ? "text-signal-green"
                            : "text-zinc-400"
                    }
                  >
                    {l.text}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                Artifacts
              </span>
              <span className="font-mono text-[10px] text-zinc-600">
                {artifacts.length}
              </span>
            </div>
            <div className="h-[220px] overflow-auto space-y-3">
              {artifacts.length === 0 ? (
                <p className="text-sm text-zinc-600">no artifacts yet</p>
              ) : (
                artifacts.map((a) => (
                  <details
                    key={a.id + a.name}
                    className="rounded-md border border-zinc-800 bg-ink-950 p-2"
                  >
                    <summary className="cursor-pointer font-mono text-[11px] text-zinc-300">
                      {a.name}
                    </summary>
                    <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-300">
                      {a.content}
                    </pre>
                  </details>
                ))
              )}
            </div>
          </div>
        </div>

        {summary && (
          <div className="rounded-2xl border border-signal-green/30 bg-signal-green/5 p-4">
            <p className="text-[11px] uppercase tracking-wider text-signal-green">
              Mission summary
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-sm text-zinc-200">
              {summary}
            </pre>
          </div>
        )}

        {error && !ejectPayload && (
          <div className="rounded-2xl border border-signal-red/40 bg-signal-red/5 p-4">
            <p className="font-semibold text-signal-red">Run failed</p>
            <p className="mt-1 font-mono text-sm text-zinc-300">{error}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({
  run,
  connected,
}: {
  run: RunRecord | null;
  connected: boolean;
}) {
  if (!run) {
    return <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">idle</span>;
  }
  const palette: Record<string, string> = {
    queued: "bg-zinc-700 text-zinc-100",
    running: "bg-signal-blue/20 text-signal-blue",
    succeeded: "bg-signal-green/20 text-signal-green",
    failed: "bg-signal-red/20 text-signal-red",
    ejected: "bg-signal-amber/20 text-signal-amber",
    canceled: "bg-zinc-800 text-zinc-400",
  };
  const status = palette[run.status] ?? "bg-zinc-800 text-zinc-400";
  return (
    <>
      <span className={`rounded-full px-2 py-0.5 uppercase ${status}`}>{run.status}</span>
      <span className="text-zinc-500">·</span>
      <span className={connected ? "text-signal-green" : "text-zinc-500"}>
        {connected ? "stream live" : "stream connecting…"}
      </span>
    </>
  );
}
