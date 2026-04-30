"use client";

import { useEffect, useState } from "react";

/**
 * Polls `/api/v1/forge/launch/status/[hookId]` and renders the pump.fun-style
 * step-by-step progress of a launch: factory tx → Kimi → hook deploy →
 * curve deploy → active → Basescan verify.
 *
 * Steps appear in a fixed order regardless of whether the server has emitted
 * them yet, so the visual height is stable throughout the launch.
 */

type HookSnapshot = {
  id: string;
  model?: string | null;
  curve_stage: string;
  verified_at: string | null;
  curve_verified_at: string | null;
  deploy_error: string | null;
  token_address: string | null;
  curve_address: string | null;
  hook_address: string | null;
  pool_address: string | null;
};

type LaunchJobRow = {
  id: string;
  step: string;
  status: "pending" | "running" | "completed" | "failed";
  error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const STEP_LABELS: Array<{ id: string; label: string; detail: string }> = [
  { id: "verify_factory_tx", label: "Token deployed", detail: "Verifying factory transaction" },
  { id: "generate_hook", label: "Mission code generated", detail: "Kimi writing the Solidity" },
  { id: "deploy_mission_record", label: "Mission record on-chain", detail: "Deploying immutable record" },
  { id: "create_curve", label: "Bonding curve live", detail: "Seeding token supply into the curve" },
  { id: "mark_active", label: "Agent tradeable", detail: "Marketplace listing activated" },
  { id: "verify_basescan", label: "Basescan: mission", detail: "Source verified on the explorer" },
  {
    id: "verify_curve_basescan",
    label: "Basescan: curve",
    detail: "Bonding curve contract verification",
  },
];

type Props = {
  hookId: string;
  onClose?: () => void;
};

export function LaunchStatusPanel({ hookId, onClose }: Props) {
  const [hook, setHook] = useState<HookSnapshot | null>(null);
  const [jobs, setJobs] = useState<LaunchJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let lastTimeout: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/forge/launch/status/${hookId}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `status fetch failed: ${res.status}`);
        }
        const data = (await res.json()) as { hook: HookSnapshot; jobs: LaunchJobRow[] };
        if (!cancelled) {
          setHook(data.hook);
          setJobs(data.jobs);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "status fetch failed");
      }
      if (!cancelled) {
        lastTimeout = setTimeout(poll, 2_000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (lastTimeout) clearTimeout(lastTimeout);
    };
  }, [hookId]);

  const stepState = STEP_LABELS.map((s) => {
    const row = [...jobs].reverse().find((j) => j.step === s.id);
    let status: "pending" | "running" | "completed" | "failed" = "pending";
    let message: string | null = null;
    if (row) {
      status = row.status;
      if (row.error) message = row.error;
    }
    if (s.id === "generate_hook" && status === "completed" && hook?.model && !message) {
      message = `Model: ${hook.model}`;
    }
    if (s.id === "verify_basescan" && hook?.verified_at) {
      status = "completed";
      message = "verified";
    }
    if (s.id === "verify_curve_basescan" && hook?.curve_verified_at) {
      status = "completed";
      message = "verified";
    }
    return { ...s, status, message };
  });

  const done = hook?.curve_stage === "active" || hook?.curve_stage === "graduated";
  const failed = hook?.curve_stage === "failed";

  return (
    <section className="rounded-xl border border-zinc-800 bg-ink-900/80 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            Launch pipeline
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">
            {done
              ? "Agent launched"
              : failed
                ? "Launch failed"
                : "Your agent is being launched…"}
          </h2>
          <p className="mt-1 font-mono text-[10px] text-zinc-500">hook {hookId.slice(0, 8)}…</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-[10px] uppercase text-zinc-400 hover:border-zinc-500"
          >
            close
          </button>
        )}
      </header>

      {error && (
        <p className="mt-3 rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 font-mono text-[11px] text-signal-red">
          {error}
        </p>
      )}

      {hook?.deploy_error && (
        <p className="mt-3 rounded-md border border-signal-red/40 bg-signal-red/10 px-3 py-2 font-mono text-[11px] text-signal-red">
          {hook.deploy_error}
        </p>
      )}

      <ol className="mt-4 space-y-2">
        {stepState.map((s) => (
          <li
            key={s.id}
            className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs transition ${
              s.status === "completed"
                ? "border-signal-green/40 bg-signal-green/5"
                : s.status === "running"
                  ? "border-signal-blue/40 bg-signal-blue/5"
                  : s.status === "failed"
                    ? "border-signal-red/40 bg-signal-red/5"
                    : "border-zinc-800 bg-ink-950/60"
            }`}
          >
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-300">
                {s.label}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{s.message ?? s.detail}</p>
            </div>
            <span
              className={`font-mono text-[10px] uppercase tracking-widest ${
                s.status === "completed"
                  ? "text-signal-green"
                  : s.status === "running"
                    ? "text-signal-blue"
                    : s.status === "failed"
                      ? "text-signal-red"
                      : "text-zinc-500"
              }`}
            >
              {s.status}
            </span>
          </li>
        ))}
      </ol>

      {hook && (
        <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] text-zinc-400 sm:grid-cols-2">
          <AddressRow label="Token" value={hook.token_address} />
          <AddressRow label="Curve" value={hook.curve_address} />
          <AddressRow label="Mission record" value={hook.hook_address} />
          <AddressRow label="Pool" value={hook.pool_address} />
        </div>
      )}
    </section>
  );
}

function AddressRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-ink-950/40 px-2 py-1.5 font-mono">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <span className="truncate text-zinc-300">
        {value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—"}
      </span>
    </div>
  );
}
