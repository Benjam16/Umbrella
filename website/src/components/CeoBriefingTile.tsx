"use client";

import { motion } from "framer-motion";
import { useState } from "react";

type Props = {
  text: string;
};

export function CeoBriefingTile({ text }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text.replace(/•/g, "-"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">CEO briefing</h3>
          <p className="mt-1 text-xs text-zinc-500">Outcome synthesis — what ships after the swarm finishes.</p>
        </div>
        <motion.button
          type="button"
          onClick={() => void copy()}
          whileTap={{ scale: 0.97 }}
          className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:border-signal-blue/50 hover:bg-zinc-800"
        >
          {copied ? "Copied" : "Copy briefing"}
        </motion.button>
      </div>
      <pre className="mt-4 flex-1 whitespace-pre-wrap rounded-xl border border-zinc-800/50 bg-black/25 p-4 font-sans text-[13px] leading-relaxed text-zinc-300">
        {text}
      </pre>
    </div>
  );
}
