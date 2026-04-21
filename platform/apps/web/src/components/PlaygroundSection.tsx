"use client";

import { motion } from "framer-motion";
import { useRef } from "react";
import { PlaygroundTerminal, type PlaygroundTerminalHandle } from "./PlaygroundTerminal";
import { Reveal } from "./Reveal";

type Probe = {
  cmd: string;
  hint: string;
};

const PROBES: Probe[] = [
  { cmd: "help", hint: "list every command" },
  { cmd: 'umbrella plan "refactor the auth layer"', hint: "DAG decomposition" },
  { cmd: "umbrella status", hint: "current mission + lanes" },
  { cmd: "umbrella actions", hint: "tool calls vs. policy" },
  { cmd: "umbrella risk 4", hint: "tighten the policy gate" },
  { cmd: "umbrella self-heal", hint: "fail → fix → pass" },
  { cmd: "umbrella capabilities", hint: "what the agent can do" },
  { cmd: "umbrella health", hint: "DR / integrity snapshot" },
];

export function PlaygroundSection() {
  const terminalRef = useRef<PlaygroundTerminalHandle>(null);

  const fire = (cmd: string) => {
    terminalRef.current?.run(cmd);
  };

  return (
    <div className="mt-8 grid grid-cols-12 gap-4 lg:gap-5">
      <Reveal className="col-span-12 lg:col-span-8">
        <PlaygroundTerminal ref={terminalRef} />
      </Reveal>
      <Reveal className="col-span-12 lg:col-span-4">
        <div className="flex h-full flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-ink-900/60 p-5 text-sm text-zinc-400">
          <h3 className="text-sm font-semibold text-zinc-100">Capability probes</h3>
          <p className="text-xs text-zinc-500">
            Click any probe to run it inside the terminal on the left.
          </p>
          <ul className="mt-1 flex flex-col gap-1.5 font-mono text-[12px]">
            {PROBES.map((p, i) => (
              <motion.li
                key={p.cmd}
                initial={{ opacity: 0, x: 8 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                viewport={{ once: true, amount: 0.2 }}
              >
                <button
                  type="button"
                  onClick={() => fire(p.cmd)}
                  className="group block w-full rounded border border-zinc-800/60 bg-ink-850/60 px-2.5 py-1.5 text-left transition hover:border-signal-blue/40 hover:bg-ink-850 focus:border-signal-blue/60 focus:outline-none"
                  aria-label={`Run ${p.cmd}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-zinc-200 group-hover:text-white">{p.cmd}</span>
                    <span
                      aria-hidden
                      className="shrink-0 text-zinc-600 transition group-hover:text-signal-blue"
                    >
                      ▸
                    </span>
                  </div>
                  <div className="text-[10.5px] text-zinc-500">{p.hint}</div>
                </button>
              </motion.li>
            ))}
          </ul>
          <p className="mt-auto pt-2 text-[10.5px] text-zinc-600">
            Tip: use <span className="font-mono text-zinc-400">↑ / ↓</span> for history,
            <span className="font-mono text-zinc-400"> ⌘L </span>to clear.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
