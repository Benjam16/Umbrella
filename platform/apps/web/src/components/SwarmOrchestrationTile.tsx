"use client";

import { motion } from "framer-motion";

const nodes = [0, 1, 2, 3, 4];

export function SwarmOrchestrationTile() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Swarm orchestration</h3>
          <p className="mt-1 text-xs text-zinc-500">Five parallel workers — pulse traffic on the mesh.</p>
        </div>
        <span className="shrink-0 rounded-full bg-signal-green/15 px-2 py-1 font-mono text-[10px] text-signal-green">
          5 active
        </span>
      </div>
      <div className="relative mt-4 flex flex-1 items-center justify-center py-6">
        <svg viewBox="0 0 200 80" className="w-full max-w-[280px] text-zinc-600">
          {[0, 1, 2, 3].map((i) => (
            <motion.line
              key={i}
              x1={40 + i * 35}
              y1={40}
              x2={40 + (i + 1) * 35}
              y2={40}
              stroke="currentColor"
              strokeWidth={1}
              initial={{ opacity: 0.15 }}
              animate={{ opacity: [0.2, 0.85, 0.2] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
          {nodes.map((i) => (
            <motion.circle
              key={i}
              cx={40 + i * 35}
              cy={40}
              r={8}
              className="fill-signal-blue/25 stroke-signal-blue"
              strokeWidth={1}
              animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.22 }}
            />
          ))}
        </svg>
      </div>
      <p className="text-center font-mono text-[10px] text-zinc-600">SUPERVISOR → parallel workers → merge</p>
    </div>
  );
}
