"use client";

import { motion } from "framer-motion";
import type { Accent, CapabilityDemo } from "@/lib/demo-data";

const ACCENT_RING: Record<Accent, string> = {
  blue: "hover:border-signal-blue/40 hover:shadow-signal-blue/10",
  green: "hover:border-signal-green/40 hover:shadow-signal-green/10",
  amber: "hover:border-signal-amber/40 hover:shadow-signal-amber/10",
  red: "hover:border-signal-red/40 hover:shadow-signal-red/10",
};

const ACCENT_DOT: Record<Accent, string> = {
  blue: "bg-signal-blue",
  green: "bg-signal-green",
  amber: "bg-signal-amber",
  red: "bg-signal-red",
};

type Props = {
  items: CapabilityDemo[];
};

export function CapabilitiesGrid({ items }: Props) {
  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {items.map((c, i) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, amount: 0.25 }}
          className={`col-span-12 md:col-span-6 lg:col-span-4 rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-5 shadow-xl shadow-black/20 transition ${ACCENT_RING[c.accent]}`}
        >
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${ACCENT_DOT[c.accent]}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {c.id}
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-zinc-100">{c.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{c.summary}</p>
        </motion.div>
      ))}
    </div>
  );
}
