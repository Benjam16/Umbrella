"use client";

import { motion } from "framer-motion";
import type { PricingTier } from "@/lib/demo-data";

type Props = {
  tiers: PricingTier[];
};

export function PricingTiers({ tiers }: Props) {
  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {tiers.map((tier, i) => (
        <motion.div
          key={tier.id}
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: false, amount: 0.35 }}
          className={`relative col-span-12 md:col-span-4 rounded-2xl border p-6 ${
            tier.highlight
              ? "border-signal-blue/40 bg-ink-900/80 shadow-2xl shadow-signal-blue/10"
              : "border-zinc-800/80 bg-ink-900/50"
          }`}
        >
          {tier.highlight ? (
            <span className="absolute right-4 top-4 rounded-full border border-signal-blue/40 bg-signal-blue/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-signal-blue">
              recommended
            </span>
          ) : null}
          <div className="text-xs uppercase tracking-widest text-zinc-500">{tier.name}</div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold text-zinc-100">{tier.price}</span>
          </div>
          <p className="mt-2 text-sm text-zinc-400">{tier.tagline}</p>
          <ul className="mt-5 space-y-2 text-sm text-zinc-300">
            {tier.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-green/80" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`mt-6 w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tier.highlight
                ? "bg-signal-blue text-ink-950 hover:bg-signal-blue/90"
                : "border border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:border-signal-blue/40"
            }`}
          >
            {tier.cta}
          </button>
        </motion.div>
      ))}
    </div>
  );
}
