"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toaster";

type PublicNode = {
  id: string;
  nodeId: string;
  label: string;
  hostname: string | null;
  status: "online" | "offline" | "revoked";
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  paired: boolean;
  createdAt: string;
};

const REFRESH_MS = 10_000;

/**
 * Live-paired nodes list. Source of truth is the server (/api/v1/nodes);
 * every 10s we re-fetch to catch new heartbeats. Paste the 6-char code
 * printed by `umbrella connect` to bind a machine to this browser's
 * owner cookie — the token itself stays on the CLI.
 */
export function NodePairing() {
  const [nodes, setNodes] = useState<PublicNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/nodes", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { nodes?: PublicNode[] };
      setNodes(data.nodes ?? []);
    } catch {
      // transient — silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const i = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(i);
  }, [refresh]);

  async function pair(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(trimmed)) {
      toast.push({
        title: "Invalid pairing code",
        body: "Expected format: XXX-XXX (6 characters). Run `umbrella connect` on the machine you want to pair.",
        tone: "warn",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/nodes/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pairingCode: trimmed,
          label: label.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; node?: PublicNode; error?: string; code?: string }
        | null;

      if (!res.ok || !data?.ok || !data.node) {
        toast.push({
          title: "Pairing failed",
          body: data?.error ?? `Server returned ${res.status}`,
          tone: data?.code === "expired" ? "warn" : "error",
        });
        return;
      }

      toast.push({
        title: "Node paired",
        body: `${data.node.label} (${data.node.hostname ?? data.node.nodeId}) can now receive high-risk missions.`,
        tone: "success",
      });
      setCode("");
      setLabel("");
      await refresh();
    } catch (err) {
      toast.push({
        title: "Network error",
        body: err instanceof Error ? err.message : "Could not reach /api/v1/nodes/pair.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function unpair(nodeId: string, label: string) {
    if (typeof window !== "undefined" && !window.confirm(`Unpair ${label}?`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/nodes/${encodeURIComponent(nodeId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.push({
          title: "Could not unpair",
          body: data?.error ?? `Server returned ${res.status}`,
          tone: "error",
        });
        return;
      }
      toast.push({ title: "Node unpaired", tone: "info" });
      await refresh();
    } catch (err) {
      toast.push({
        title: "Network error",
        body: err instanceof Error ? err.message : "Could not reach the server.",
        tone: "error",
      });
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={pair}
        className="flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-ink-900/70 p-3 sm:flex-row sm:items-center"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXX-XXX"
          maxLength={7}
          autoComplete="off"
          spellCheck={false}
          disabled={submitting}
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-sm tracking-widest text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-signal-blue disabled:opacity-50 sm:w-36"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional, e.g. 'work laptop')"
          disabled={submitting}
          className="w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-signal-blue disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md border border-signal-blue/40 bg-signal-blue/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-signal-blue hover:border-signal-blue disabled:opacity-50"
        >
          {submitting ? "pairing…" : "pair"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading nodes…</p>
      ) : nodes.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No nodes paired yet. Run{" "}
          <code className="rounded bg-ink-950 px-1.5 py-0.5 font-mono text-xs text-zinc-300">
            umbrella connect
          </code>{" "}
          in a terminal and paste the pairing code above.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800/80 bg-ink-900/70">
          {nodes.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              onUnpair={() => unpair(node.nodeId, node.label)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NodeRow({ node, onUnpair }: { node: PublicNode; onUnpair: () => void }) {
  const online = isRecent(node.lastSeenAt);
  const dot = online
    ? "bg-signal-green shadow-[0_0_8px_rgba(52,211,153,0.6)]"
    : node.status === "revoked"
      ? "bg-signal-red"
      : "bg-zinc-600";
  const status = online
    ? "online"
    : node.lastSeenAt
      ? `last seen ${timeAgo(node.lastSeenAt)}`
      : "never seen";

  return (
    <li className="flex items-center gap-3 p-3">
      <span className={`h-2 w-2 flex-none rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-100">{node.label}</p>
        <p className="truncate font-mono text-[10px] text-zinc-500">
          {node.hostname ?? node.nodeId} · {status}
        </p>
      </div>
      <button
        type="button"
        onClick={onUnpair}
        className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-signal-red"
      >
        unpair
      </button>
    </li>
  );
}

function isRecent(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 60_000;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
