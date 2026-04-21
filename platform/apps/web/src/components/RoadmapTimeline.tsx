"use client";

import { motion } from "framer-motion";
import type { RoadmapStage } from "@/lib/demo-data";

type Props = {
  stages: RoadmapStage[];
};

export function RoadmapTimeline({ stages }: Props) {
  return (
    <div className="relative grid grid-cols-12 gap-4 lg:gap-5">
      {stages.map((s, i) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, amount: 0.3 }}
          className="col-span-12 md:col-span-4 rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-5"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
              {s.phase}
            </span>
            <span className="text-sm font-semibold text-zinc-100">{s.label}</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">
            {s.items.map((it) => (
              <li key={it} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-blue/80" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      ))}
    </div>
  );
}
