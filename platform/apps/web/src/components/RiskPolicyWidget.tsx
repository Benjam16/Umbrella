"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { ToolActionDemo } from "@/lib/demo-data";
import { isActionAllowed } from "@/lib/demo-data";

type Props = {
  actions: ToolActionDemo[];
};

export function RiskPolicyWidget({ actions }: Props) {
  const [maxAllowed, setMaxAllowed] = useState(7);

  const label = useMemo(() => {
    if (maxAllowed <= 3) return "Safe";
    if (maxAllowed <= 6) return "Balanced";
    return "Aggressive";
  }, [maxAllowed]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Risk governance</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Slide max allowed risk (1–10). Actions above the line are blocked — same idea as platform policy gates.
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Threshold</span>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-signal-amber"
          >
            {label} · allow ≤{maxAllowed}
          </motion.span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={maxAllowed}
          onChange={(e) => setMaxAllowed(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-signal-blue"
          aria-label="Maximum allowed tool risk score"
        />
        <div className="flex justify-between font-mono text-[10px] text-zinc-600">
          <span>strict</span>
          <span>permissive</span>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-2 overflow-auto">
        {actions.map((a) => {
          const ok = isActionAllowed(a.risk, maxAllowed);
          return (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-zinc-800/60 bg-ink-850/80 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-signal-blue">{a.tool}</div>
                <div className="truncate text-[11px] text-zinc-500">{a.detail}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-[10px] text-zinc-500">risk {a.risk}/10</span>
                <motion.span
                  layout
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    ok ? "bg-signal-green/15 text-signal-green" : "bg-signal-red/15 text-signal-red"
                  }`}
                >
                  {ok ? "Approved" : "Blocked"}
                </motion.span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
