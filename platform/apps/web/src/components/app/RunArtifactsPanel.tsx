"use client";

import { useState } from "react";
import type { Artifact, LogLine } from "@/lib/useMissionRun";

type Tab = "log" | "artifacts" | "summary";

type Props = {
  logs: LogLine[];
  artifacts: Artifact[];
  summary: string | null;
  error: string | null;
};

export function RunArtifactsPanel({ logs, artifacts, summary, error }: Props) {
  const [tab, setTab] = useState<Tab>("log");

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-ink-900/70">
      <div className="flex items-center gap-1 border-b border-zinc-800/70 px-3 py-2">
        <Pill active={tab === "log"} onClick={() => setTab("log")} count={logs.length}>
          log
        </Pill>
        <Pill
          active={tab === "artifacts"}
          onClick={() => setTab("artifacts")}
          count={artifacts.length}
        >
          artifacts
        </Pill>
        <Pill active={tab === "summary"} onClick={() => setTab("summary")}>
          summary
        </Pill>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === "log" && (
          <div className="font-mono text-[12px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-zinc-600">waiting for events…</p>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  className={
                    l.kind === "err"
                      ? "text-signal-red"
                      : l.kind === "sys"
                        ? "text-signal-blue"
                        : l.kind === "node"
                          ? "text-signal-green"
                          : "text-zinc-400"
                  }
                >
                  {l.text}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "artifacts" && (
          <div className="space-y-3">
            {artifacts.length === 0 ? (
              <p className="text-sm text-zinc-600">no artifacts yet</p>
            ) : (
              artifacts.map((a) => (
                <details
                  key={a.id + a.name}
                  open
                  className="rounded-md border border-zinc-800 bg-ink-950 p-2"
                >
                  <summary className="cursor-pointer font-mono text-[11px] text-zinc-300">
                    {a.name}
                    <span className="ml-2 text-zinc-600">{a.mime}</span>
                  </summary>
                  <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-300">
                    {a.content}
                  </pre>
                </details>
              ))
            )}
          </div>
        )}

        {tab === "summary" && (
          <div className="space-y-3">
            {summary ? (
              <pre className="whitespace-pre-wrap rounded-md border border-signal-green/30 bg-signal-green/5 p-3 font-mono text-[12px] text-zinc-100">
                {summary}
              </pre>
            ) : error ? (
              <pre className="whitespace-pre-wrap rounded-md border border-signal-red/40 bg-signal-red/5 p-3 font-mono text-[12px] text-signal-red">
                {error}
              </pre>
            ) : (
              <p className="text-sm text-zinc-600">no summary yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition ${
        active
          ? "bg-signal-blue/10 text-signal-blue"
          : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
    >
      {children}
      {typeof count === "number" && count > 0 && (
        <span className="ml-1 text-[10px] text-zinc-500">{count}</span>
      )}
    </button>
  );
}
