"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type Props = {
  command: string;
  logs: string[];
};

export function HeroTerminal({ command, logs }: Props) {
  const [cmdShown, setCmdShown] = useState("");
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);

  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setCmdShown(command.slice(0, i));
      if (i >= command.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
  }, [command]);

  useEffect(() => {
    if (cmdShown.length < command.length) return;
    setVisibleLogs([]);
    let idx = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled || idx >= logs.length) return;
      setVisibleLogs((prev) => [...prev, logs[idx]!]);
      idx += 1;
      window.setTimeout(step, 420 + idx * 90);
    };
    const t = window.setTimeout(step, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [cmdShown, command.length, logs]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-ink-900/90 shadow-2xl shadow-signal-blue/5 terminal-scan">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 bg-ink-850 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-signal-red/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-signal-green/80" />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
          umbrella — simulated runner
        </span>
      </div>
      <div className="relative space-y-3 p-5 font-mono text-[13px] leading-relaxed text-zinc-300">
        <div>
          <span className="text-signal-green">➜</span>{" "}
          <span className="text-zinc-500">~</span>{" "}
          <span className="text-zinc-100">{cmdShown}</span>
          {cmdShown.length < command.length ? (
            <motion.span
              className="ml-0.5 inline-block h-4 w-2 align-[-2px] bg-signal-blue"
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.9 }}
            />
          ) : null}
        </div>
        <div className="space-y-1.5 border-t border-zinc-800/60 pt-3">
          {visibleLogs.map((line, i) => (
            <motion.div
              key={`${line}-${i}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="text-[12px] text-zinc-400"
            >
              <span className="text-zinc-600">{String(i + 1).padStart(2, "0")}</span> {line}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
