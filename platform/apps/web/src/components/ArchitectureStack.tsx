"use client";

import { motion } from "framer-motion";
import type { Accent, ArchitectureLayer } from "@/lib/demo-data";

const ACCENT_BAR: Record<Accent, string> = {
  blue: "from-signal-blue/60 to-transparent",
  green: "from-signal-green/60 to-transparent",
  amber: "from-signal-amber/60 to-transparent",
  red: "from-signal-red/60 to-transparent",
};

type Props = {
  layers: ArchitectureLayer[];
};

export function ArchitectureStack({ layers }: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">System architecture</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          desktop → api → inference → settlement
        </span>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {layers.map((layer, i) => (
          <motion.div
            key={layer.id}
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, amount: 0.4 }}
            className="relative flex flex-col gap-1 rounded-xl border border-zinc-800/70 bg-ink-850/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl bg-gradient-to-b ${ACCENT_BAR[layer.accent]}`}
            />
            <div className="pl-3">
              <div className="text-sm font-semibold text-zinc-100">{layer.title}</div>
              <div className="text-xs text-zinc-500">{layer.role}</div>
            </div>
            <div className="pl-3 font-mono text-[11px] text-zinc-400 sm:pl-0">
              {layer.stack}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
