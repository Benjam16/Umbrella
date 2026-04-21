"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "umbrella.localNodeUrl";

/**
 * Tiny settings control for the "Remote Node" bridge. The user pastes the URL
 * of their local `umbrella api` daemon here. When set, new runs POST with
 * `mode: "remote"` so the website dispatches missions to the local node
 * instead of the cloud sandbox.
 *
 * The actual handshake (JWT exchange) lives in the CLI — this Phase 1 UI only
 * persists the preference and reports reachability.
 */
export function LocalNodeStatus() {
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"unknown" | "reachable" | "offline">("unknown");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "";
    if (saved) setUrl(saved);
  }, []);

  useEffect(() => {
    if (!url) {
      setStatus("unknown");
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch(`${url.replace(/\/$/, "")}/v1/health/dr`, {
          method: "GET",
          mode: "cors",
        });
        if (!cancelled) setStatus(res.ok ? "reachable" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };
    void probe();
    const i = setInterval(probe, 15_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [url]);

  function save(next: string) {
    const trimmed = next.trim().replace(/\/$/, "");
    setUrl(trimmed);
    if (typeof window !== "undefined") {
      if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
      else localStorage.removeItem(STORAGE_KEY);
    }
    setEditing(false);
  }

  const dot =
    status === "reachable"
      ? "bg-signal-green"
      : status === "offline"
        ? "bg-signal-red"
        : "bg-zinc-600";
  const label =
    status === "reachable"
      ? "Local node online"
      : status === "offline"
        ? "Local node offline"
        : url
          ? "Probing local node…"
          : "Cloud sandbox (no local node)";

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-ink-900/70 p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="flex-1 text-sm text-zinc-200">{label}</span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-signal-blue"
        >
          {editing ? "close" : url ? "edit" : "connect"}
        </button>
      </div>

      {editing && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem("local-url") as HTMLInputElement)
              ?.value;
            save(input ?? "");
          }}
        >
          <input
            name="local-url"
            defaultValue={url}
            placeholder="http://127.0.0.1:8787"
            className="flex-1 rounded-md border border-zinc-800 bg-ink-950 px-2 py-1 font-mono text-sm text-zinc-100 outline-none focus:border-signal-blue"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-md border border-signal-blue/40 bg-signal-blue/10 px-3 py-1 text-[11px] uppercase tracking-wider text-signal-blue hover:border-signal-blue"
          >
            save
          </button>
          {url && (
            <button
              type="button"
              onClick={() => save("")}
              className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] uppercase tracking-wider text-zinc-500 hover:text-signal-red"
            >
              clear
            </button>
          )}
        </form>
      )}

      {url && !editing && (
        <p className="mt-2 break-all font-mono text-[10px] text-zinc-500">{url}</p>
      )}
    </div>
  );
}

/** Read the stored local node URL (client-side). */
export function getLocalNodeUrl(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
