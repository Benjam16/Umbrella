"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PlannedNode } from "@umbrella/runner/types";

export type NodeStatus = "idle" | "running" | "done" | "error" | "blocked";

type Props = {
  plan: PlannedNode[];
  statuses: Record<string, NodeStatus>;
};

type NodeData = {
  label: string;
  worker: string;
  risk: number;
  status: NodeStatus;
};

// Simple deterministic layout: group nodes by "depth" (longest path from a
// root), spread horizontally by order within the depth.
function layout(plan: PlannedNode[]): Node<NodeData>[] {
  const depthById = new Map<string, number>();
  const byId = new Map(plan.map((n) => [n.id, n]));

  function depthOf(id: string, seen = new Set<string>()): number {
    if (depthById.has(id)) return depthById.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const n = byId.get(id);
    if (!n || n.deps.length === 0) {
      depthById.set(id, 0);
      return 0;
    }
    const d = 1 + Math.max(...n.deps.map((p) => depthOf(p, seen)));
    depthById.set(id, d);
    return d;
  }
  plan.forEach((n) => depthOf(n.id));

  const byDepth = new Map<number, PlannedNode[]>();
  for (const n of plan) {
    const d = depthById.get(n.id) ?? 0;
    const list = byDepth.get(d) ?? [];
    list.push(n);
    byDepth.set(d, list);
  }

  const COL = 220;
  const ROW = 110;
  const nodes: Node<NodeData>[] = [];
  for (const [d, list] of byDepth) {
    list.forEach((n, i) => {
      nodes.push({
        id: n.id,
        type: "umbrella",
        position: { x: d * COL, y: i * ROW - ((list.length - 1) * ROW) / 2 },
        data: { label: n.label, worker: n.worker, risk: n.risk, status: "idle" },
      });
    });
  }
  return nodes;
}

const workerPalette: Record<string, string> = {
  supervisor: "ring-signal-blue/60 bg-signal-blue/10 text-signal-blue",
  scraper: "ring-signal-sepia/60 bg-signal-sepia/10 text-signal-sepia",
  coder: "ring-signal-green/60 bg-signal-green/10 text-signal-green",
  auditor: "ring-signal-amber/60 bg-signal-amber/10 text-signal-amber",
  writer: "ring-zinc-400/60 bg-zinc-400/10 text-zinc-300",
};

function UmbrellaNode({ data }: NodeProps) {
  const d = data as unknown as NodeData;
  const base =
    "relative rounded-xl border px-3 py-2 font-mono text-[11px] min-w-[160px] shadow-ink transition-all";
  const palette = workerPalette[d.worker] ?? workerPalette.writer;
  const statusBorder =
    d.status === "running"
      ? "border-signal-blue animate-pulse"
      : d.status === "done"
        ? "border-signal-green/60"
        : d.status === "error"
          ? "border-signal-red/80"
          : d.status === "blocked"
            ? "border-signal-amber/80"
            : "border-zinc-800";
  return (
    <div className={`${base} ${statusBorder} bg-ink-900/90`}>
      <Handle type="target" position={Position.Left} style={{ background: "#38bdf8" }} />
      <div className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1 ${palette}`}>
        <span className="uppercase tracking-wider text-[9px]">{d.worker}</span>
      </div>
      <div className="mt-1 text-zinc-100">{d.label}</div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>risk {d.risk}/10</span>
        <StatusDot status={d.status} />
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "#38bdf8" }} />
    </div>
  );
}

function StatusDot({ status }: { status: NodeStatus }) {
  const map: Record<NodeStatus, string> = {
    idle: "bg-zinc-700",
    running: "bg-signal-blue animate-pulse",
    done: "bg-signal-green",
    error: "bg-signal-red",
    blocked: "bg-signal-amber",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[status]}`} />;
}

const nodeTypes = { umbrella: UmbrellaNode };

export function LiveDag({ plan, statuses }: Props) {
  const nodes = useMemo<Node<NodeData>[]>(() => {
    const laid = layout(plan);
    return laid.map((n) => ({
      ...n,
      data: { ...n.data, status: statuses[n.id] ?? "idle" },
    }));
  }, [plan, statuses]);

  const edges = useMemo<Edge[]>(
    () =>
      plan.flatMap((n) =>
        n.deps.map((d) => ({
          id: `${d}->${n.id}`,
          source: d,
          target: n.id,
          animated: statuses[n.id] === "running",
          style: { stroke: "#38bdf880" },
        })),
      ),
    [plan, statuses],
  );

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-zinc-800/80 bg-ink-900/70">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        panOnDrag
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background color="#1f2937" gap={20} />
      </ReactFlow>
    </div>
  );
}
