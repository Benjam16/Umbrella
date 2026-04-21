"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalNodeUrl } from "@/components/LocalNodeStatus";
import type { OnchainAnchor, PlannedNode, RunEvent, RunRecord } from "@umbrella/runner";
import type { NodeStatus } from "@/components/LiveDag";
import { rememberRecentRun } from "@/lib/recent-runs";

export type LogLine = {
  id: number;
  kind: "sys" | "out" | "err" | "node";
  text: string;
};

export type Artifact = {
  id: string;
  name: string;
  mime: string;
  content: string;
};

export type EjectPayload = {
  reason?: string;
  blockingNodes?: string[];
};

export type MissionRunState = {
  run: RunRecord | null;
  plan: PlannedNode[];
  statuses: Record<string, NodeStatus>;
  logs: LogLine[];
  artifacts: Artifact[];
  eject: EjectPayload | null;
  summary: string | null;
  error: string | null;
  connecting: boolean;
  connected: boolean;
  /**
   * On-chain anchor populated either live (via `run.onchain` SSE event) or on
   * replay (via `GET /api/v1/runs/:id/anchor`). The BaseScan link in the run
   * replay page reads from here.
   */
  anchor: OnchainAnchor | null;
};

export type StartMissionInput = {
  blueprintId: string;
  goal?: string;
  inputs: Record<string, string>;
  riskThreshold?: number;
  blueprintTitle?: string;
  /**
   * If set, dispatch the run to the named paired CLI node (via the server's
   * dispatch queue — the CLI claims it via its heartbeat loop). Takes
   * precedence over the local HTTP daemon. When null/undefined, runs in the
   * cloud sandbox (or local daemon if configured).
   */
  targetNodeId?: string | null;
};

/**
 * Shared mission lifecycle hook used by WebRunner and the /app terminal.
 *
 * Handles:
 * - routing the POST to /api/v1/runs or the local node depending on
 *   `LOCAL_UMBRELLA_URL`
 * - opening an SSE stream and translating events into UI state
 * - persisting run metadata to the localStorage "recent runs" list so it
 *   appears in sidebars and /app/runs history
 */
export function useMissionRun(): MissionRunState & {
  start: (input: StartMissionInput) => Promise<void>;
  reset: () => void;
  replay: (runId: string) => Promise<void>;
} {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [plan, setPlan] = useState<PlannedNode[]>([]);
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>({});
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [eject, setEject] = useState<EjectPayload | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [anchor, setAnchor] = useState<OnchainAnchor | null>(null);

  const logIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => () => esRef.current?.close(), []);

  const pushLog = useCallback((kind: LogLine["kind"], text: string) => {
    setLogs((prev) => {
      const id = ++logIdRef.current;
      return [...prev, { id, kind, text }];
    });
  }, []);

  const clear = useCallback(() => {
    setRun(null);
    setPlan([]);
    setStatuses({});
    setLogs([]);
    setArtifacts([]);
    setEject(null);
    setSummary(null);
    setError(null);
    setConnected(false);
    setAnchor(null);
    logIdRef.current = 0;
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
        setEject({
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
        return;
      }
      if (event.kind === "run.onchain") {
        // Partial — the SSE payload is a lean summary; the full anchor comes
        // from GET /api/v1/runs/:id/anchor, but this lets us flash the badge
        // immediately. `replay` will hydrate the rest.
        const p = event.payload as {
          tokenAddress?: string;
          chainId?: number;
          txHash?: string;
          attester?: string;
          paymasterSponsored?: boolean;
          successScore?: number;
          revenueCents?: number;
        };
        if (p.txHash && p.tokenAddress && p.chainId && p.attester) {
          setAnchor((prev) => ({
            runId: prev?.runId ?? "",
            tokenAddress: p.tokenAddress!,
            chainId: p.chainId!,
            txHash: p.txHash!,
            attester: p.attester!,
            signature: prev?.signature ?? "0x",
            paymasterSponsored: Boolean(p.paymasterSponsored),
            proof:
              prev?.proof ??
              ({
                version: 1,
                runId: "",
                blueprintId: "",
                ownerFingerprint: null,
                successScore: p.successScore ?? 0,
                revenueCents: p.revenueCents ?? 0,
                nodesExecuted: 0,
                durationMs: 0,
                status: "succeeded",
                mintedAt: Date.now(),
              } as OnchainAnchor["proof"]),
            anchoredAt: new Date().toISOString(),
          }));
          pushLog("sys", `anchored on-chain · tx ${p.txHash.slice(0, 12)}…`);
        }
      }
    },
    [pushLog],
  );

  const subscribe = useCallback(
    (runId: string, baseUrl: string | null) => {
      const streamUrl = baseUrl
        ? `${baseUrl}/api/v1/runs/${runId}/events`
        : `/api/v1/runs/${runId}/events`;
      const es = new EventSource(streamUrl);
      esRef.current = es;
      setConnected(false);

      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);

      const handle = (ev: MessageEvent) => {
        try {
          applyEvent(JSON.parse(ev.data) as RunEvent);
        } catch {
          /* heartbeats are plain strings — ignore */
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
        "run.onchain",
      ]) {
        es.addEventListener(kind, handle as EventListener);
      }
      es.addEventListener("done", () => es.close());
    },
    [applyEvent],
  );

  const start = useCallback(
    async (input: StartMissionInput) => {
      esRef.current?.close();
      clear();
      setConnecting(true);

      // Dispatch priority:
      //   1. explicit paired CLI via dispatch queue (targetNodeId)
      //   2. legacy local HTTP daemon (getLocalNodeUrl, localhost)
      //   3. cloud sandbox
      const localUrl =
        !input.targetNodeId && typeof window !== "undefined" ? getLocalNodeUrl() : null;
      const endpoint = localUrl ? `${localUrl}/api/v1/runs` : "/api/v1/runs";
      const mode: "cloud" | "remote" =
        input.targetNodeId || localUrl ? "remote" : "cloud";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blueprintId: input.blueprintId,
            goal: input.goal,
            inputs: input.inputs,
            riskThreshold: input.riskThreshold ?? 5,
            mode,
            nodeId: input.targetNodeId ?? undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `http ${res.status}`);
        }
        const data = (await res.json()) as { run: RunRecord };
        setRun(data.run);
        pushLog(
          "sys",
          `mission ${data.run.id.slice(0, 8)} queued — ${input.blueprintTitle ?? data.run.blueprintId}`,
        );
        rememberRecentRun({
          id: data.run.id,
          blueprintId: data.run.blueprintId,
          blueprintTitle: input.blueprintTitle ?? data.run.blueprintId,
          goal: data.run.goal,
          mode: data.run.mode,
          createdAt: data.run.createdAt,
          origin: input.targetNodeId
            ? "remote"
            : localUrl
              ? "remote"
              : "cloud",
        });
        subscribe(data.run.id, localUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        pushLog("err", msg);
      } finally {
        setConnecting(false);
      }
    },
    [clear, pushLog, subscribe],
  );

  const replay = useCallback(
    async (runId: string) => {
      esRef.current?.close();
      clear();
      setConnecting(true);
      const localUrl = typeof window !== "undefined" ? getLocalNodeUrl() : null;
      const base = localUrl ? localUrl : "";
      try {
        const res = await fetch(`${base}/api/v1/runs/${runId}`);
        if (!res.ok) throw new Error(`http ${res.status}`);
        const { run: r, events } = (await res.json()) as {
          run: RunRecord;
          events: RunEvent[];
        };
        setRun(r);
        for (const ev of events) applyEvent(ev);
        if (r.status === "running" || r.status === "queued") {
          subscribe(runId, localUrl);
        } else {
          setConnected(false);
        }

        // Completed runs might already be anchored — fetch the full anchor
        // payload so the BaseScan badge and attester fields are populated
        // regardless of whether we saw the live `run.onchain` event.
        if (r.status === "succeeded" || r.status === "failed") {
          try {
            const anchorRes = await fetch(`${base}/api/v1/runs/${runId}/anchor`);
            if (anchorRes.ok) {
              const { anchor: a } = (await anchorRes.json()) as {
                anchor: OnchainAnchor;
              };
              setAnchor(a);
            }
          } catch {
            /* anchor is optional */
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setConnecting(false);
      }
    },
    [applyEvent, clear, subscribe],
  );

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    clear();
  }, [clear]);

  return {
    run,
    plan,
    statuses,
    logs,
    artifacts,
    eject,
    summary,
    error,
    connecting,
    connected,
    anchor,
    start,
    reset,
    replay,
  };
}
