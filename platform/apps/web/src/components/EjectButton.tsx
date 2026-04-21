"use client";

import { useState } from "react";
import { useToast } from "@/components/Toaster";

type Props = {
  runId: string;
  reason?: string;
  blockingNodes?: string[];
};

/**
 * Renders the "Eject to Local Workstation" affordance. When the cloud sandbox
 * can't complete a mission (too high risk, requires local fs, etc.) the user
 * copies `umbrella pull <run_id>` into their CLI and the mission resumes
 * locally with the originally-planned DAG.
 */
export function EjectButton({ runId, reason, blockingNodes }: Props) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const cmd = `umbrella pull ${runId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.push({
        title: "Command copied",
        body: "Paste it into a terminal with the Umbrella CLI installed. The run will hydrate into ./research/ with full local tool access.",
        command: cmd,
        tone: "success",
        duration: 6000,
      });
    } catch {
      toast.push({
        title: "Copy failed",
        body: "Your browser blocked clipboard access. Select the command manually and copy it.",
        command: cmd,
        tone: "warn",
      });
    }
  }

  return (
    <div className="rounded-2xl border border-signal-amber/40 bg-signal-amber/5 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2 w-2 flex-none rounded-full bg-signal-amber" />
        <div className="flex-1">
          <p className="font-semibold text-signal-amber">Eject to local workstation</p>
          <p className="mt-1 text-sm text-zinc-300">
            {reason ??
              "This mission needs capabilities the cloud sandbox doesn't grant (filesystem, shell, or secrets). Resume it on your machine with full tool access."}
          </p>
          {blockingNodes && blockingNodes.length > 0 && (
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              blocked: {blockingNodes.join(", ")}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-ink-950 px-3 py-2">
            <span className="font-mono text-signal-green">$</span>
            <code className="flex-1 font-mono text-sm text-zinc-100 select-all">{cmd}</code>
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] uppercase tracking-wider text-zinc-300 transition hover:border-signal-blue hover:text-signal-blue"
            >
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            The CLI will fetch this run&apos;s DAG, inputs, and intermediate state, then execute the
            blocked nodes locally.
          </p>
        </div>
      </div>
    </div>
  );
}
