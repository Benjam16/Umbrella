"use client";

import { useEffect, useMemo, useState } from "react";
import type { BlueprintSummary } from "@/components/WebRunner";
import type { StartMissionInput } from "@/lib/useMissionRun";

type Props = {
  blueprints: BlueprintSummary[];
  disabled?: boolean;
  onStart: (input: StartMissionInput) => void;
  /**
   * Optional blueprint id to pre-select on mount. Used by the Marketplace →
   * Workspace handoff so "Back this agent" / "Launch" lands the user directly
   * on the right blueprint chip.
   */
  initialBlueprintId?: string;
};

type PairedNode = {
  nodeId: string;
  label: string;
  hostname: string | null;
  status: "online" | "offline" | "revoked";
  lastSeenAt: string | null;
  paired: boolean;
};

/**
 * Chat-style mission composer. Users pick a blueprint chip, fill the required
 * inputs inline, slide the risk policy, and submit. The goal text at the top
 * is the persistent prompt that drives everything below.
 *
 * Design note: blueprints each have a small input form; we render the first
 * required field inline as a secondary input so the hero flow for scrape /
 * recon / sweep is literally a two-field form (goal + URL/repo/topic).
 */
export function MissionComposer({
  blueprints,
  disabled,
  onStart,
  initialBlueprintId,
}: Props) {
  const [blueprintId, setBlueprintId] = useState(
    initialBlueprintId ?? blueprints[0]?.id ?? "",
  );
  const [goal, setGoal] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [riskThreshold, setRiskThreshold] = useState(5);
  const [showAllFields, setShowAllFields] = useState(false);
  const [targetNodeId, setTargetNodeId] = useState<string>("__cloud__");
  const [pairedNodes, setPairedNodes] = useState<PairedNode[]>([]);

  // Poll for paired nodes so the "Run on…" selector stays honest even if the
  // user pairs a laptop in another tab while composing a mission.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/nodes", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { nodes: PairedNode[] };
        if (cancelled) return;
        setPairedNodes(Array.isArray(data.nodes) ? data.nodes : []);
      } catch {
        /* offline, leave dropdown at cloud-only */
      }
    };
    load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // If the currently-selected node goes away (unpaired in another tab),
  // fall back to the cloud sandbox instead of POSTing to a stale id.
  useEffect(() => {
    if (targetNodeId === "__cloud__") return;
    if (!pairedNodes.some((n) => n.nodeId === targetNodeId)) {
      setTargetNodeId("__cloud__");
    }
  }, [pairedNodes, targetNodeId]);

  const blueprint = useMemo(
    () => blueprints.find((b) => b.id === blueprintId),
    [blueprints, blueprintId],
  );

  useEffect(() => {
    if (!blueprints.length) return;
    // Honor an incoming `initialBlueprintId` once the blueprints list has
    // actually loaded (otherwise the default would win the race).
    if (
      initialBlueprintId &&
      blueprints.some((b) => b.id === initialBlueprintId) &&
      blueprintId !== initialBlueprintId
    ) {
      setBlueprintId(initialBlueprintId);
      return;
    }
    if (!blueprints.find((b) => b.id === blueprintId)) {
      setBlueprintId(blueprints[0].id);
    }
  }, [blueprints, blueprintId, initialBlueprintId]);

  const primaryField = blueprint?.inputs[0];
  const extraFields = blueprint?.inputs.slice(1) ?? [];
  const canSubmit =
    blueprint && blueprint.inputs.every((f) => !f.required || (inputs[f.key] ?? "").trim().length > 0);

  const submit = () => {
    if (!blueprint || !canSubmit || disabled) return;
    onStart({
      blueprintId: blueprint.id,
      goal: goal.trim() || blueprint.sampleGoal,
      inputs,
      riskThreshold,
      blueprintTitle: blueprint.title,
      targetNodeId: targetNodeId === "__cloud__" ? null : targetNodeId,
    });
    setGoal("");
    setInputs({});
    setShowAllFields(false);
  };

  return (
    <div className="w-full rounded-2xl border border-zinc-800/80 bg-ink-900/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          Compose mission
        </span>
        <span className="font-mono text-[10px] text-zinc-600">
          ⌘⏎ to run · /{blueprints.length} blueprints
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {blueprints.map((b) => {
          const active = b.id === blueprintId;
          const danger = b.maxRisk >= 7;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setBlueprintId(b.id);
                setInputs({});
              }}
              disabled={disabled}
              className={`rounded-full border px-3 py-1 text-[11px] transition ${
                active
                  ? "border-signal-blue bg-signal-blue/10 text-signal-blue"
                  : danger
                    ? "border-signal-amber/40 bg-signal-amber/5 text-signal-amber hover:border-signal-amber"
                    : "border-zinc-800 bg-ink-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
              } disabled:cursor-not-allowed disabled:opacity-40`}
              title={b.description}
            >
              {b.title}
              {danger && <span className="ml-1 text-[9px]">⚑ eject</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={2}
          disabled={disabled}
          placeholder={blueprint?.sampleGoal ?? "Describe a mission…"}
          className="w-full resize-none rounded-lg border border-zinc-800 bg-ink-950 px-3 py-2 text-[14px] text-zinc-100 outline-none focus:border-signal-blue disabled:opacity-50"
        />

        {primaryField && (
          <div>
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-zinc-500">
              <span>
                {primaryField.label}
                {primaryField.required ? " *" : ""}
              </span>
              {extraFields.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllFields((v) => !v)}
                  className="text-zinc-500 hover:text-signal-blue"
                >
                  {showAllFields ? "hide" : `+${extraFields.length} more`}
                </button>
              )}
            </div>
            <input
              value={inputs[primaryField.key] ?? ""}
              onChange={(e) =>
                setInputs((prev) => ({ ...prev, [primaryField.key]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              disabled={disabled}
              type={primaryField.type === "url" ? "url" : "text"}
              placeholder={primaryField.placeholder}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none focus:border-signal-blue disabled:opacity-50"
            />
            {primaryField.helper && (
              <p className="mt-1 text-[11px] text-zinc-500">{primaryField.helper}</p>
            )}
          </div>
        )}

        {showAllFields &&
          extraFields.map((f) => (
            <div key={f.key}>
              <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                {f.label}
                {f.required ? " *" : ""}
              </label>
              <input
                value={inputs[f.key] ?? ""}
                onChange={(e) =>
                  setInputs((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                disabled={disabled}
                placeholder={f.placeholder}
                className="mt-1 w-full rounded-md border border-zinc-800 bg-ink-950 px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none focus:border-signal-blue disabled:opacity-50"
              />
              {f.helper && <p className="mt-1 text-[11px] text-zinc-500">{f.helper}</p>}
            </div>
          ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
          <span>risk ≤</span>
          <input
            type="range"
            min={1}
            max={10}
            value={riskThreshold}
            onChange={(e) => setRiskThreshold(Number(e.target.value))}
            disabled={disabled}
            className="accent-signal-blue"
          />
          <span className="text-zinc-300">{riskThreshold}/10</span>
        </label>

        <label className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
          <span>run on</span>
          <select
            value={targetNodeId}
            onChange={(e) => setTargetNodeId(e.target.value)}
            disabled={disabled}
            className="rounded-md border border-zinc-800 bg-ink-950 px-2 py-1 font-mono text-[11px] text-zinc-300 outline-none focus:border-signal-blue disabled:opacity-40"
          >
            <option value="__cloud__">cloud sandbox</option>
            {pairedNodes.length > 0 && <option disabled>──────────</option>}
            {pairedNodes.map((n) => {
              const dot = n.status === "online" ? "●" : "○";
              return (
                <option key={n.nodeId} value={n.nodeId}>
                  {dot} {n.label} · {n.nodeId.slice(0, 10)}
                </option>
              );
            })}
          </select>
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={disabled || !canSubmit}
          className="ml-auto rounded-md border border-signal-blue/50 bg-signal-blue/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-signal-blue transition hover:border-signal-blue disabled:cursor-not-allowed disabled:opacity-40"
        >
          {disabled
            ? "mission in flight…"
            : targetNodeId === "__cloud__"
              ? "Run in cloud"
              : `Run on ${targetNodeId.slice(0, 10)}`}
        </button>
      </div>
    </div>
  );
}
