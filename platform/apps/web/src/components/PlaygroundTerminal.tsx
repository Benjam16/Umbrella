"use client";

import { motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { demoData, isActionAllowed } from "@/lib/demo-data";

export type PlaygroundTerminalHandle = {
  /** Execute a command as if typed by the user (no submit needed). */
  run: (command: string) => void;
  /** Focus the prompt input. */
  focus: () => void;
};

type Props = {
  ref?: Ref<PlaygroundTerminalHandle>;
};

type Line = {
  id: number;
  kind: "in" | "out" | "err" | "sys";
  text: string;
};

const BANNER = [
  "Umbrella playground v0.2 — Base / AgentFi focus (simulated; no chain here).",
  "Type  help  for commands. Try:  umbrella swarm launch 0x… 10",
];

const HELP_LINES = [
  "help                          list commands",
  "clear                         clear the screen",
  'umbrella plan "<task>"        emit a demo DAG (legacy demo)',
  "umbrella swarm launch <addr> [n]   simulate N smart-account buyers + burn cadence",
  "umbrella swarm help           POST /v1/swarm/plan · /dispatch · /launch",
  "umbrella status               show demo mission & lanes",
  "umbrella risk <n>             set policy threshold (1-10)",
  "umbrella actions              show tool actions vs policy",
  "umbrella self-heal            demo fail → fix → pass",
  "umbrella brief                print demo briefing",
  "umbrella health               DR / integrity snapshot (demo)",
  "umbrella capabilities         list agent capabilities (demo)",
];

type CommandResult = {
  lines: Array<{ kind: Line["kind"]; text: string }>;
  clear?: boolean;
};

function splitArgs(input: string): string[] {
  const re = /"([^"]*)"|(\S+)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? "");
  return out;
}

function planFor(task: string): string[] {
  const base = task.trim() || "generic mission";
  return [
    `[plan] mission: ${base}`,
    "[plan] lanes=3 parallel · checkpoint=after-verify · policy=default",
    "  t1 SUPERVISOR  plan           ─┐",
    "  t2 SCRAPER     gather_context  ├─▶ t4 CODER     patch",
    "  t3 SCRAPER     gather_context B┘        │",
    "                                           ▼",
    "                                  t5 AUDITOR   verify",
    "                                           │",
    "                                           ▼",
    "                                  t6 SUPERVISOR seal",
  ];
}

export function PlaygroundTerminal({ ref }: Props) {
  const [lines, setLines] = useState<Line[]>(() =>
    BANNER.map((text, i) => ({ id: i, kind: "sys", text })),
  );
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState<number>(-1);
  const [riskThreshold, setRiskThreshold] = useState(7);
  const idRef = useRef(BANNER.length);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const push = useCallback((next: Array<{ kind: Line["kind"]; text: string }>) => {
    setLines((prev) => {
      const start = idRef.current;
      idRef.current = start + next.length;
      return [
        ...prev,
        ...next.map((n, i) => ({ id: start + i, kind: n.kind, text: n.text })),
      ];
    });
  }, []);

  const runCommand = useCallback(
    (raw: string): CommandResult => {
      const input = raw.trim();
      if (!input) return { lines: [] };
      if (input === "clear") return { lines: [], clear: true };
      if (input === "help") {
        return { lines: HELP_LINES.map((l) => ({ kind: "out" as const, text: l })) };
      }
      const args = splitArgs(input);
      if (args[0] !== "umbrella") {
        return {
          lines: [
            {
              kind: "err",
              text: `unknown command: ${args[0]} — try  help`,
            },
          ],
        };
      }
      const sub = args[1] ?? "";

      if (sub === "plan") {
        const task = args.slice(2).join(" ").replace(/^"|"$/g, "");
        if (!task) {
          return {
            lines: [
              { kind: "err", text: 'usage: umbrella plan "<task>"' },
              { kind: "out", text: 'example: umbrella plan "audit my repo and propose refactors"' },
            ],
          };
        }
        return {
          lines: planFor(task).map((text) => ({ kind: "out" as const, text })),
        };
      }

      if (sub === "swarm") {
        const swarmSub = args[2] ?? "help";
        if (swarmSub === "help") {
          return {
            lines: [
              {
                kind: "sys",
                text: "Swarm = N Coinbase Smart Accounts (HD paths) + sponsored UserOps.",
              },
              {
                kind: "out",
                text: "POST /v1/swarm/plan — Gemma → JSON tool steps (spawn, transfer, set_hook_burn, custom…).",
              },
              {
                kind: "out",
                text: "POST /v1/swarm/dispatch — same steps executed as sponsored UserOps (per-agent batches).",
              },
              {
                kind: "out",
                text: "POST /v1/swarm/launch — raw uniformCalls or callsPerAgent when you already encoded calldata.",
              },
              {
                kind: "out",
                text: "Mnemonic server-side (UMBRELLA_SWARM_MNEMONIC). Hook owner can set burnOperator to a swarm address.",
              },
            ],
          };
        }
        if (swarmSub === "launch") {
          const token = args[3] ?? "";
          const n = Math.min(32, Math.max(1, Number(args[4]) || 10));
          const ok = /^0x[a-fA-F0-9]{40}$/.test(token);
          if (!ok) {
            return {
              lines: [
                { kind: "err", text: "usage: umbrella swarm launch <tokenAddress> [agentCount]" },
                { kind: "out", text: "example: umbrella swarm launch 0xabc… 10" },
              ],
            };
          }
          const lines: Array<{ kind: Line["kind"]; text: string }> = [
            { kind: "sys", text: `[swarm] simulated launch · ${n} agents · target ${token.slice(0, 10)}…` },
            { kind: "out", text: "[swarm] stagger: 30s between UserOps (configure staggerMs in API)" },
            { kind: "out", text: "[swarm] intent: acquire ~80% supply across agents; hook emits burn bps on swaps" },
            { kind: "out", text: "[swarm] next: replace callData with real v4 swap + fund agents / policy in CDP" },
          ];
          for (let i = 0; i < Math.min(n, 5); i++) {
            lines.push({
              kind: "out",
              text: `  agent ${i + 1}/${n}  smartAccount=0x${(i + 1).toString(16).padStart(4, "0")}…  userOp=0x…`,
            });
          }
          if (n > 5) {
            lines.push({ kind: "out", text: `  … ${n - 5} more agents (truncated in playground)` });
          }
          return { lines };
        }
        return {
          lines: [
            { kind: "err", text: `unknown swarm subcommand: ${swarmSub}` },
            { kind: "out", text: "try: umbrella swarm help" },
          ],
        };
      }

      if (sub === "status") {
        return {
          lines: [
            { kind: "out", text: `mission: ${demoData.mission.title}` },
            { kind: "out", text: `objective: ${demoData.mission.objective}` },
            ...demoData.heroLogs.map((l) => ({ kind: "out" as const, text: l })),
          ],
        };
      }

      if (sub === "risk") {
        const n = Number(args[2]);
        if (!Number.isFinite(n) || n < 1 || n > 10) {
          return {
            lines: [
              { kind: "err", text: "usage: umbrella risk <1-10>" },
              { kind: "out", text: `current threshold: ${riskThreshold}` },
            ],
          };
        }
        setRiskThreshold(Math.floor(n));
        return {
          lines: [
            { kind: "sys", text: `policy: max allowed risk set to ${Math.floor(n)}/10` },
          ],
        };
      }

      if (sub === "actions") {
        const rows = demoData.toolActions.map((a) => {
          const ok = isActionAllowed(a.risk, riskThreshold);
          return {
            kind: "out" as const,
            text: `  ${(a.tool + " ".repeat(20)).slice(0, 20)}  risk ${a.risk
              .toString()
              .padStart(2, " ")}/10   ${ok ? "APPROVED" : "BLOCKED "}   ${a.detail}`,
          };
        });
        return {
          lines: [
            { kind: "sys", text: `threshold = ${riskThreshold}/10` },
            ...rows,
          ],
        };
      }

      if (sub === "self-heal") {
        return {
          lines: [
            { kind: "err", text: demoData.selfHealSnippet.fail },
            { kind: "sys", text: "[auditor] retry with patch proposal" },
            { kind: "out", text: demoData.selfHealSnippet.fix },
            { kind: "out", text: demoData.selfHealSnippet.pass },
          ],
        };
      }

      if (sub === "brief") {
        return {
          lines: demoData.ceoBriefing
            .split("\n")
            .map((text) => ({ kind: "out" as const, text })),
        };
      }

      if (sub === "health") {
        const now = new Date().toISOString();
        return {
          lines: [
            { kind: "sys", text: "GET /v1/health/dr (simulated)" },
            { kind: "out", text: `status: healthy  integrity: ok` },
            { kind: "out", text: `lastSnapshotIso: ${now}` },
            { kind: "out", text: "source: edge-demo" },
          ],
        };
      }

      if (sub === "capabilities") {
        return {
          lines: [
            { kind: "sys", text: "capabilities (read-only demo)" },
            ...demoData.capabilities.map((c) => ({
              kind: "out" as const,
              text: `  • ${c.title} — ${c.summary}`,
            })),
          ],
        };
      }

      return {
        lines: [
          { kind: "err", text: `unknown subcommand: umbrella ${sub} — try  help` },
        ],
      };
    },
    [riskThreshold],
  );

  const execute = useCallback(
    (raw: string) => {
      const cmd = raw.trim();
      if (!cmd) return;
      setHistory((h) => [...h, cmd]);
      setHIndex(-1);
      push([{ kind: "in", text: cmd }]);
      const res = runCommand(cmd);
      if (res.clear) {
        setLines([]);
        idRef.current = 0;
        return;
      }
      if (res.lines.length) push(res.lines);
    },
    [push, runCommand],
  );

  const submit = useCallback(() => {
    const cmd = value;
    setValue("");
    execute(cmd);
  }, [value, execute]);

  useImperativeHandle(
    ref,
    () => ({
      run: (command: string) => {
        setValue("");
        execute(command);
        // Next frame, make sure the terminal scroll + focus feel connected.
        window.requestAnimationFrame(() => inputRef.current?.focus());
      },
      focus: () => inputRef.current?.focus(),
    }),
    [execute],
  );

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "ArrowUp") {
      if (!history.length) return;
      e.preventDefault();
      const next = hIndex < 0 ? history.length - 1 : Math.max(0, hIndex - 1);
      setHIndex(next);
      setValue(history[next] ?? "");
      return;
    }
    if (e.key === "ArrowDown") {
      if (hIndex < 0) return;
      e.preventDefault();
      const next = hIndex + 1;
      if (next >= history.length) {
        setHIndex(-1);
        setValue("");
      } else {
        setHIndex(next);
        setValue(history[next] ?? "");
      }
      return;
    }
    if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setLines([]);
      idRef.current = 0;
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const styleFor = useMemo(
    () => ({
      in: "text-zinc-100",
      out: "text-zinc-400",
      err: "text-signal-red",
      sys: "text-signal-blue",
    }),
    [],
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-ink-900/90 shadow-2xl shadow-signal-blue/5 terminal-scan">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 bg-ink-850 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-signal-red/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-signal-green/80" />
        </div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
          umbrella — playground
        </span>
        <span className="ml-auto font-mono text-[10px] text-zinc-600">
          policy ≤ {riskThreshold}/10
        </span>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className="block w-full cursor-text bg-transparent text-left"
        aria-label="Focus terminal input"
      >
        <div
          ref={scrollRef}
          className="max-h-[360px] min-h-[260px] overflow-auto p-5 font-mono text-[12.5px] leading-relaxed"
        >
          {lines.map((l) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className={styleFor[l.kind]}
            >
              {l.kind === "in" ? (
                <>
                  <span className="text-signal-green">➜</span>{" "}
                  <span className="text-zinc-500">~</span>{" "}
                  <span>{l.text}</span>
                </>
              ) : (
                <span>{l.text}</span>
              )}
            </motion.div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <span className="text-signal-green">➜</span>
            <span className="text-zinc-500">~</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className="flex-1 bg-transparent text-zinc-100 caret-signal-blue outline-none"
              placeholder='type: help'
            />
          </div>
        </div>
      </button>
    </div>
  );
}
