"use client";

import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef } from "react";

type Stat = {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  caption: string;
};

const STATS: Stat[] = [
  { id: "checkpoints", label: "checkpoints / run", value: 14, caption: "every risky step is journaled" },
  { id: "heal", label: "self-heal bound", value: 5, caption: "retry ceiling before human gate" },
  { id: "lanes", label: "parallel lanes", value: 3, caption: "swarm workers in flight" },
  { id: "uptime", label: "DR integrity", value: 99.98, suffix: "%", caption: "snapshot + hash trail" },
];

function Counter({ value, suffix }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const mv = useMotionValue(0);
  const isFloat = !Number.isInteger(value);
  const display = useTransform(mv, (latest) =>
    isFloat ? latest.toFixed(2) : Math.round(latest).toLocaleString(),
  );

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [inView, mv, value]);

  return (
    <span ref={ref} className="tabular-nums">
      <motion.span>{display}</motion.span>
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}

export function StatsTicker() {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-zinc-800/70 bg-ink-900/50 p-4 md:grid-cols-4 md:gap-4">
      {STATS.map((s) => (
        <div
          key={s.id}
          className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-ink-850/40 p-4"
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {s.label}
          </div>
          <div className="mt-2 font-sans text-3xl font-semibold text-zinc-100">
            <Counter value={s.value} suffix={s.suffix} />
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">{s.caption}</div>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-signal-blue/10 blur-2xl"
          />
        </div>
      ))}
    </div>
  );
}
