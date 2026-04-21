"use client";

import { motion } from "framer-motion";
import type { DagEdge, DagNode } from "@/lib/demo-data";

type Props = {
  nodes: DagNode[];
  edges: DagEdge[];
};

export function ShadowDag({ nodes, edges }: Props) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="relative flex h-full min-h-[220px] flex-col rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Shadow DAG
        </span>
        <span className="rounded-full bg-signal-blue/15 px-2 py-0.5 font-mono text-[10px] text-signal-blue">
          live layout
        </span>
      </div>
      <div className="relative flex flex-1 items-center justify-center">
        <svg viewBox="0 0 100 100" className="h-full max-h-[200px] w-full text-zinc-500">
          {edges.map((e, i) => {
            const a = byId[e.from];
            const b = byId[e.to];
            if (!a || !b) return null;
            return (
              <motion.line
                key={`${e.from}-${e.to}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                strokeWidth={0.6}
                strokeOpacity={0.45}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.12, duration: 0.4 }}
              />
            );
          })}
          {nodes.map((n, i) => (
            <motion.g key={n.id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 + i * 0.08 }}>
              <circle cx={n.x} cy={n.y} r={4.2} className="fill-signal-blue/30 stroke-signal-blue" strokeWidth={0.5} />
              <text x={n.x} y={n.y + 10} textAnchor="middle" className="fill-zinc-400 font-mono" style={{ fontSize: "3.2px" }}>
                {n.label}
              </text>
            </motion.g>
          ))}
        </svg>
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-xl"
          animate={{ boxShadow: ["0 0 0 0 rgba(56,189,248,0)", "0 0 40px 0 rgba(56,189,248,0.12)", "0 0 0 0 rgba(56,189,248,0)"] }}
          transition={{ duration: 3.2, repeat: Infinity }}
        />
      </div>
      <p className="mt-1 text-center font-mono text-[10px] text-zinc-600">
        Mirrors desktop React Flow DAG — supervisor lanes + merge
      </p>
    </div>
  );
}
