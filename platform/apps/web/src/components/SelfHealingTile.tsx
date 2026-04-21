"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type Props = {
  fail: string;
  fix: string;
  pass: string;
};

export function SelfHealingTile({ fail, fix, pass }: Props) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % 3);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const glow =
    phase === 0
      ? "0 0 28px rgba(251,113,133,0.28)"
      : phase === 1
        ? "0 0 22px rgba(251,191,36,0.22)"
        : "0 0 26px rgba(34,211,166,0.24)";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-5">
      <h3 className="text-sm font-semibold text-zinc-100">Self-healing</h3>
      <p className="mt-1 text-xs text-zinc-500">Red-to-green verify loop — bounded retries in the real runner.</p>
      <motion.div
        className="mt-4 flex flex-1 flex-col justify-center gap-2 rounded-xl border border-zinc-800/60 bg-black/30 p-4 font-mono text-[11px] leading-relaxed"
        animate={{ boxShadow: glow }}
        transition={{ duration: 0.5 }}
      >
        <div className={phase === 0 ? "text-signal-red" : "text-zinc-600"}>{fail}</div>
        <div className={phase === 1 ? "text-signal-amber" : "text-zinc-600 opacity-60"}>{fix}</div>
        <div className={phase === 2 ? "text-signal-green" : "text-zinc-600 opacity-50"}>{pass}</div>
      </motion.div>
    </div>
  );
}
