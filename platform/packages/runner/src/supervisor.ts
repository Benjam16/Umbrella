import { randomUUID } from "node:crypto";
import { getServerSupabase } from "./supabase";
import { runBus } from "./bus";
import { getBlueprint } from "./blueprints";
import { callTool } from "./tools";
import type {
  Blueprint,
  OnchainAnchor,
  PlannedNode,
  RunEvent,
  RunEventKind,
  RunRecord,
  RunStatus,
} from "./types";

/**
 * In-memory shadow of runs we've started in this process. Source of truth
 * when Supabase isn't configured (dev mode), and a convenience cache
 * otherwise.
 *
 * Pinned to globalThis because `next dev` bundles each route handler into
 * its own module instance — without this, POST /api/v1/runs and
 * POST /api/v1/nodes/heartbeat each see their own private Map and no one
 * ever sees the dispatched work.
 */
type RunnerMemoryStore = {
  __umbrellaMemoryRuns?: Map<string, RunRecord>;
  __umbrellaMemoryEvents?: Map<string, RunEvent[]>;
  __umbrellaMemoryAnchors?: Map<string, OnchainAnchor>;
};
const runnerMemory = globalThis as unknown as RunnerMemoryStore;
const memoryRuns: Map<string, RunRecord> =
  runnerMemory.__umbrellaMemoryRuns ?? new Map();
const memoryEvents: Map<string, RunEvent[]> =
  runnerMemory.__umbrellaMemoryEvents ?? new Map();
/**
 * On-chain anchors written by the RelayerService. Keyed by runId.
 *
 * Pinned to globalThis so the POST /runs/:id/anchor handler (relayer writes)
 * and GET /runs/:id/anchor handler (UI reads) share state in `next dev`.
 */
const memoryAnchors: Map<string, OnchainAnchor> =
  runnerMemory.__umbrellaMemoryAnchors ?? new Map();
runnerMemory.__umbrellaMemoryRuns = memoryRuns;
runnerMemory.__umbrellaMemoryEvents = memoryEvents;
runnerMemory.__umbrellaMemoryAnchors = memoryAnchors;

type StartRunInput = {
  blueprintId: string;
  goal?: string;
  inputs: Record<string, string>;
  riskThreshold?: number;
  ownerFingerprint?: string | null;
  mode?: "cloud" | "remote";
  /**
   * Human-readable id of the paired CLI node to dispatch to. Required (and
   * only honored) when mode === "remote". When present, the supervisor
   * creates the run in `queued` state and does NOT execute it — the paired
   * CLI will claim it via `claimRun` on its next heartbeat.
   */
  targetNodeId?: string | null;
};

type StartRunResult =
  | { ok: true; run: RunRecord }
  | { ok: false; error: string; status: number };

export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const blueprint = getBlueprint(input.blueprintId);
  if (!blueprint) {
    return { ok: false, error: `unknown blueprint: ${input.blueprintId}`, status: 400 };
  }

  for (const field of blueprint.inputs) {
    if (field.required && !input.inputs?.[field.key]) {
      return {
        ok: false,
        error: `missing required input: ${field.key}`,
        status: 400,
      };
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const mode = input.mode ?? "cloud";
  const isRemote = mode === "remote" && !!input.targetNodeId;

  const run: RunRecord = {
    id,
    blueprintId: blueprint.id,
    goal: input.goal?.trim() || blueprint.sampleGoal,
    mode,
    status: "queued",
    riskThreshold: clampRisk(input.riskThreshold ?? 5),
    inputs: input.inputs ?? {},
    ownerFingerprint: input.ownerFingerprint ?? null,
    targetNodeId: isRemote ? input.targetNodeId ?? null : null,
    dispatchedAt: isRemote ? now : null,
    createdAt: now,
  };

  memoryRuns.set(id, run);
  memoryEvents.set(id, []);

  const supabase = getServerSupabase();
  if (supabase) {
    const { error } = await supabase.from("runs").insert({
      id: run.id,
      blueprint_id: run.blueprintId,
      goal: run.goal,
      mode: run.mode,
      status: run.status,
      risk_threshold: run.riskThreshold,
      inputs: run.inputs,
      owner_fingerprint: run.ownerFingerprint,
      target_node_id: run.targetNodeId,
      dispatched_at: run.dispatchedAt,
    });
    if (error) {
      return { ok: false, error: `db insert failed: ${error.message}`, status: 500 };
    }
  }

  if (isRemote) {
    // Emit a `plan` event immediately so the web UI sees the DAG as soon as
    // the user clicks "Run on node-xyz". The paired CLI will take over from
    // here, emitting node.start / node.log / node.finish / run.finish back
    // through /api/v1/runs/:id/events.
    await publishEvent(run.id, {
      seq: 1,
      kind: "plan",
      payload: {
        blueprintId: blueprint.id,
        goal: run.goal,
        nodes: blueprint.plan(run.inputs),
        risk: { threshold: run.riskThreshold, max: blueprint.maxRisk },
        dispatch: { targetNodeId: run.targetNodeId, mode: "remote" },
      },
      createdAt: now,
    });
    await publishEvent(run.id, {
      seq: 2,
      kind: "run.note",
      payload: {
        line: `queued for local node ${run.targetNodeId} — waiting for CLI to claim`,
      },
      createdAt: new Date().toISOString(),
    });
    return { ok: true, run };
  }

  // Cloud execution path (unchanged). Fire-and-forget so the HTTP response
  // returns immediately and the client can open its SSE stream.
  void executeRun(run, blueprint).catch((err) => {
    console.error("[umbrella] supervisor crashed", err);
  });

  return { ok: true, run };
}

// ---------------------------------------------------------------------------
// Dispatch queue primitives (remote execution by a paired CLI)
// ---------------------------------------------------------------------------

/**
 * Runs tagged to this node that haven't been claimed yet. The CLI calls this
 * on every heartbeat (via the heartbeat endpoint, server-side) to drain work.
 */
export async function listPendingRunsForNode(targetNodeId: string): Promise<RunRecord[]> {
  const local: RunRecord[] = [];
  for (const r of memoryRuns.values()) {
    if (
      r.targetNodeId === targetNodeId &&
      r.status === "queued" &&
      !r.claimedAt
    ) {
      local.push(r);
    }
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return local.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("target_node_id", targetNodeId)
    .eq("status", "queued")
    .is("claimed_at", null)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error || !data) return local;
  const merged = new Map<string, RunRecord>();
  for (const r of local) merged.set(r.id, r);
  for (const row of data) {
    const r = dbRowToRun(row as Record<string, unknown>);
    merged.set(r.id, r);
  }
  return Array.from(merged.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Mark a run as claimed by `nodeId` and promote it to `running`. Returns the
 * claimed run + the freshly-planned DAG so the CLI knows what to execute.
 * Idempotent: claiming an already-claimed run by the SAME node is a no-op.
 */
export async function claimRun(
  runId: string,
  nodeId: string,
): Promise<
  | {
      ok: true;
      run: RunRecord;
      plan: PlannedNode[];
      blueprint: { id: string; title: string };
    }
  | { ok: false; error: string; status: number }
> {
  const run = await loadRun(runId);
  if (!run) return { ok: false, error: "run not found", status: 404 };
  if (run.targetNodeId !== nodeId) {
    return { ok: false, error: "run not dispatched to this node", status: 403 };
  }
  if (run.claimedAt && run.claimedAt !== nodeId) {
    // Someone else won the race.
    return { ok: false, error: "run already claimed", status: 409 };
  }

  const blueprint = getBlueprint(run.blueprintId);
  if (!blueprint) {
    return { ok: false, error: "blueprint disappeared", status: 500 };
  }

  const now = new Date().toISOString();
  const nextRun: RunRecord = {
    ...run,
    claimedAt: now,
    status: "running",
    startedAt: run.startedAt ?? now,
  };
  memoryRuns.set(run.id, nextRun);

  const supabase = getServerSupabase();
  if (supabase) {
    await supabase
      .from("runs")
      .update({ claimed_at: now, status: "running", started_at: now })
      .eq("id", run.id);
  }

  return {
    ok: true,
    run: nextRun,
    plan: blueprint.plan(run.inputs),
    blueprint: { id: blueprint.id, title: blueprint.title },
  };
}

type EventInput = {
  kind: RunEventKind;
  payload: Record<string, unknown>;
};

/**
 * Append an event produced by the authenticated node to the run. Validates
 * ownership, assigns the next seq, publishes to the SSE bus, and finalizes
 * run status when kind ∈ {run.finish, run.error}.
 */
export async function appendEventFromNode(
  runId: string,
  nodeId: string,
  input: EventInput,
): Promise<
  | { ok: true; event: RunEvent }
  | { ok: false; error: string; status: number }
> {
  const run = await loadRun(runId);
  if (!run) return { ok: false, error: "run not found", status: 404 };
  if (run.targetNodeId !== nodeId) {
    return { ok: false, error: "run not dispatched to this node", status: 403 };
  }
  if (!run.claimedAt) {
    return { ok: false, error: "claim the run first", status: 409 };
  }

  const buffered = memoryEvents.get(runId) ?? [];
  const seq = (buffered[buffered.length - 1]?.seq ?? 1) + 1;
  const event: RunEvent = {
    seq,
    kind: input.kind,
    payload: input.payload ?? {},
    createdAt: new Date().toISOString(),
  };

  await publishEvent(runId, event);

  if (input.kind === "run.finish" || input.kind === "run.error") {
    const nextStatus: RunStatus =
      input.kind === "run.finish" ? "succeeded" : "failed";
    const finishedAt = new Date().toISOString();
    const summary =
      typeof input.payload.summary === "string" ? input.payload.summary : null;
    const errorMsg =
      typeof input.payload.error === "string" ? input.payload.error : null;

    const current = memoryRuns.get(runId);
    if (current) {
      memoryRuns.set(runId, {
        ...current,
        status: nextStatus,
        finishedAt,
        summary: summary ?? current.summary ?? null,
        error: errorMsg ?? current.error ?? null,
      });
    }

    const supabase = getServerSupabase();
    if (supabase) {
      const patch: Record<string, unknown> = {
        status: nextStatus,
        finished_at: finishedAt,
      };
      if (summary) patch.summary = summary;
      if (errorMsg) patch.error = errorMsg;
      await supabase.from("runs").update(patch).eq("id", runId);
    }
    runBus.done(runId);
  }

  return { ok: true, event };
}

/**
 * List runs for an owner (the browser's umbrella_owner cookie). Merges the
 * in-process cache with Supabase so dev mode (no Supabase) still works.
 */
export async function listRunsForOwner(
  ownerFingerprint: string,
  limit = 50,
): Promise<RunRecord[]> {
  const local: RunRecord[] = [];
  for (const r of memoryRuns.values()) {
    if (r.ownerFingerprint === ownerFingerprint) local.push(r);
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return local
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("owner_fingerprint", ownerFingerprint)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return local;
  const merged = new Map<string, RunRecord>();
  for (const row of data) {
    const r = dbRowToRun(row as Record<string, unknown>);
    merged.set(r.id, r);
  }
  for (const r of local) {
    if (!merged.has(r.id)) merged.set(r.id, r);
  }
  return Array.from(merged.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

async function publishEvent(runId: string, event: RunEvent): Promise<void> {
  const buf = memoryEvents.get(runId) ?? [];
  buf.push(event);
  memoryEvents.set(runId, buf);
  runBus.emit(runId, event);

  const supabase = getServerSupabase();
  if (supabase) {
    await supabase.from("run_events").insert({
      run_id: runId,
      seq: event.seq,
      kind: event.kind,
      payload: event.payload,
    });
  }
}

export function getRunSnapshot(id: string): RunRecord | undefined {
  return memoryRuns.get(id);
}

export function getBufferedEvents(id: string): RunEvent[] {
  return memoryEvents.get(id) ?? [];
}

export async function loadRun(id: string): Promise<RunRecord | null> {
  const cached = memoryRuns.get(id);
  if (cached) return cached;
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("runs").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return dbRowToRun(data);
}

export async function loadEvents(id: string, afterSeq = -1): Promise<RunEvent[]> {
  const local = memoryEvents.get(id) ?? [];
  if (local.length) return local.filter((e) => e.seq > afterSeq);
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("run_events")
    .select("seq, kind, payload, created_at")
    .eq("run_id", id)
    .gt("seq", afterSeq)
    .order("seq", { ascending: true });
  return (
    data?.map((row) => ({
      seq: row.seq,
      kind: row.kind as RunEventKind,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: row.created_at,
    })) ?? []
  );
}

// ---------------------------------------------------------------------------
// Execution internals
// ---------------------------------------------------------------------------

async function executeRun(run: RunRecord, blueprint: Blueprint): Promise<void> {
  const plan = blueprint.plan(run.inputs);
  let seq = 0;

  const emit = async (kind: RunEventKind, payload: Record<string, unknown>) => {
    const event: RunEvent = {
      seq: ++seq,
      kind,
      payload,
      createdAt: new Date().toISOString(),
    };
    const buf = memoryEvents.get(run.id) ?? [];
    buf.push(event);
    memoryEvents.set(run.id, buf);
    runBus.emit(run.id, event);

    const supabase = getServerSupabase();
    if (supabase) {
      await supabase.from("run_events").insert({
        run_id: run.id,
        seq: event.seq,
        kind: event.kind,
        payload: event.payload,
      });
    }
  };

  const updateStatus = async (status: RunStatus, extra: Record<string, unknown> = {}) => {
    const current = memoryRuns.get(run.id);
    if (current) memoryRuns.set(run.id, { ...current, status, ...extra });
    const supabase = getServerSupabase();
    if (supabase) {
      const patch: Record<string, unknown> = { status, ...extra };
      if (status === "running") patch.started_at = new Date().toISOString();
      if (
        status === "succeeded" ||
        status === "failed" ||
        status === "ejected" ||
        status === "canceled"
      ) {
        patch.finished_at = new Date().toISOString();
      }
      await supabase.from("runs").update(patch).eq("id", run.id);
    }
  };

  try {
    await updateStatus("running");
    await emit("plan", {
      blueprintId: blueprint.id,
      goal: run.goal,
      nodes: plan,
      risk: { threshold: run.riskThreshold, max: blueprint.maxRisk },
    });

    // Check for nodes that the cloud sandbox can't execute. If any exist, we
    // pause and emit eject.requested — the UI will render the "Eject to Local
    // Workstation" affordance. We don't fail the run; leaving it in 'running'
    // would be misleading, so we mark 'ejected'.
    const blocking = plan.filter(
      (n) => n.risk > run.riskThreshold || (n.requires && n.requires.length > 0),
    );
    if (blocking.length && run.mode === "cloud") {
      await emit("eject.requested", {
        reason:
          blocking[0].requires && blocking[0].requires.length
            ? `blueprint needs local capability: ${blocking[0].requires.join(", ")}`
            : `node ${blocking[0].id} risk ${blocking[0].risk} exceeds threshold ${run.riskThreshold}`,
        blockingNodes: blocking.map((n) => n.id),
        pullCommand: `umbrella pull ${run.id}`,
      });
      await updateStatus("ejected");
      runBus.done(run.id);
      return;
    }

    // Execute nodes in dep order (simple topological sweep — blueprints are small).
    const done = new Set<string>();
    const results: Record<string, unknown> = {};
    while (done.size < plan.length) {
      const ready = plan.filter(
        (n) => !done.has(n.id) && n.deps.every((d) => done.has(d)),
      );
      if (ready.length === 0) {
        throw new Error("DAG deadlock — check blueprint deps");
      }
      for (const n of ready) {
        await runNode(n, blueprint, run, results, emit);
        done.add(n.id);
      }
    }

    const summary =
      typeof results.summary === "string"
        ? results.summary
        : `${blueprint.title} complete · ${plan.length} nodes executed.`;

    await emit("run.finish", { summary, results });
    await updateStatus("succeeded", { summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emit("run.error", { error: message });
    await updateStatus("failed", { error: message });
  } finally {
    runBus.done(run.id);
  }
}

async function runNode(
  n: PlannedNode,
  blueprint: Blueprint,
  run: RunRecord,
  results: Record<string, unknown>,
  emit: (kind: RunEventKind, payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  await emit("node.start", { id: n.id, label: n.label, worker: n.worker, risk: n.risk });

  // Light pacing so the DAG animates visibly even for fast nodes.
  await new Promise((r) => setTimeout(r, 120));

  try {
    if (n.worker === "supervisor") {
      await emit("node.log", { id: n.id, line: `[supervisor] ${n.label}` });
    } else if (n.worker === "scraper") {
      await runScraperNode(n, blueprint, run, results, emit);
    } else if (n.worker === "writer") {
      await runWriterNode(n, blueprint, run, results, emit);
    } else if (n.worker === "auditor") {
      await runAuditorNode(n, run, results, emit);
    } else if (n.worker === "coder") {
      await emit("node.log", {
        id: n.id,
        line: "[coder] patch planning deferred — requires local filesystem",
      });
    }
    await emit("node.finish", { id: n.id, ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emit("node.log", { id: n.id, line: `[error] ${message}` });
    await emit("node.finish", { id: n.id, ok: false, error: message });
    throw err;
  }
}

async function runScraperNode(
  n: PlannedNode,
  blueprint: Blueprint,
  run: RunRecord,
  results: Record<string, unknown>,
  emit: (kind: RunEventKind, payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  if (blueprint.id === "competitor-scrape") {
    if (n.id === "t2") {
      const url = run.inputs.url ?? "";
      await emit("node.log", { id: n.id, line: `GET ${url}` });
      const res = await callTool({ tool: "http.fetch", input: { url } });
      if (!res.ok) throw new Error(res.error ?? "fetch failed");
      results.page = res.output;
      await emit("node.log", {
        id: n.id,
        line: `received ${(res.output as { body: string }).body.length} bytes`,
      });
    } else if (n.id === "t3") {
      const page = results.page as { body: string } | undefined;
      const html = page?.body ?? "";
      const res = await callTool({ tool: "parse.html", input: { html } });
      if (!res.ok) throw new Error(res.error ?? "parse failed");
      results.positioning = res.output;
      const out = res.output as { title: string | null; headings: string[]; paragraphs: string[] };
      await emit("node.log", {
        id: n.id,
        line: `title="${out.title ?? "—"}" · ${out.headings.length} headings · ${out.paragraphs.length} paragraphs`,
      });
    }
    return;
  }

  if (blueprint.id === "repo-recon") {
    const repo = (run.inputs.repo ?? "").trim();
    if (!repo.includes("/")) throw new Error('repo must be in "owner/name" form');
    if (n.id === "t2") {
      const res = await callTool({
        tool: "http.fetch",
        input: { url: `https://api.github.com/repos/${repo}` },
      });
      if (!res.ok) throw new Error(res.error ?? "github api failed");
      const parsed = await callTool({
        tool: "parse.json",
        input: { raw: (res.output as { body: string }).body },
      });
      results.repoMeta = parsed.output;
      await emit("node.log", {
        id: n.id,
        line: `repo=${repo} stars=${(parsed.output as { stargazers_count?: number }).stargazers_count ?? "?"}`,
      });
    } else if (n.id === "t3") {
      const res = await callTool({
        tool: "http.fetch",
        input: { url: `https://raw.githubusercontent.com/${repo}/HEAD/README.md` },
      });
      if (!res.ok) throw new Error(res.error ?? "readme fetch failed");
      results.readme = (res.output as { body: string }).body;
      await emit("node.log", {
        id: n.id,
        line: `README ${(res.output as { body: string }).body.length} bytes`,
      });
    }
    return;
  }

  if (blueprint.id === "sentiment-sweep") {
    if (n.id === "t2") {
      const query = encodeURIComponent(run.inputs.query ?? "");
      const res = await callTool({
        tool: "http.fetch",
        input: { url: `https://hn.algolia.com/api/v1/search?query=${query}&tags=story` },
      });
      if (!res.ok) throw new Error(res.error ?? "hn search failed");
      const parsed = await callTool({
        tool: "parse.json",
        input: { raw: (res.output as { body: string }).body },
      });
      const hits = ((parsed.output as { hits?: Array<{ title: string; url?: string; points?: number }> })
        .hits ?? []).slice(0, 10);
      results.stories = hits;
      await emit("node.log", { id: n.id, line: `${hits.length} stories` });
      for (const h of hits.slice(0, 5)) {
        await emit("node.log", { id: n.id, line: `· ${h.points ?? 0} pts — ${h.title}` });
      }
    }
    return;
  }
}

async function runWriterNode(
  n: PlannedNode,
  blueprint: Blueprint,
  run: RunRecord,
  results: Record<string, unknown>,
  emit: (kind: RunEventKind, payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  if (blueprint.id === "competitor-scrape") {
    const p = results.positioning as
      | { title: string | null; headings: string[]; paragraphs: string[] }
      | undefined;
    const text = [p?.title ?? "", ...(p?.headings ?? []), ...(p?.paragraphs ?? [])].join(" \n");
    const res = await callTool({ tool: "summarize", input: { text, bullets: 5 } });
    const bullets = ((res.output as { bullets?: string[] })?.bullets ?? []).join("\n");
    const briefing = `# CEO Briefing — ${p?.title ?? "Competitor"}

**Goal:** ${run.goal}

**Signal:**
${bullets || "- (no signal extracted)"}

**Source:** ${run.inputs.url}`;
    results.summary = briefing;
    await emit("artifact", {
      id: n.id,
      name: "ceo-briefing.md",
      mime: "text/markdown",
      content: briefing,
    });
    return;
  }

  if (blueprint.id === "repo-recon") {
    const meta = (results.repoMeta ?? {}) as {
      full_name?: string;
      description?: string;
      stargazers_count?: number;
      language?: string;
      topics?: string[];
    };
    const readmeText = typeof results.readme === "string" ? (results.readme as string) : "";
    const sum = await callTool({ tool: "summarize", input: { text: readmeText, bullets: 6 } });
    const bullets = ((sum.output as { bullets?: string[] })?.bullets ?? []).join("\n");
    const briefing = `# ${meta.full_name ?? "Repo"} — Onboarding

${meta.description ?? ""}

- Stars: ${meta.stargazers_count ?? "?"}
- Language: ${meta.language ?? "?"}
- Topics: ${(meta.topics ?? []).join(", ") || "—"}

## Architecture (from README)
${bullets || "- (no signal extracted)"}`;
    results.summary = briefing;
    await emit("artifact", {
      id: n.id,
      name: "onboarding.md",
      mime: "text/markdown",
      content: briefing,
    });
    return;
  }

  if (blueprint.id === "sentiment-sweep") {
    const stories =
      (results.stories as Array<{ title: string; url?: string; points?: number }> | undefined) ?? [];
    const text = stories.map((s) => s.title).join(". ");
    const sum = await callTool({ tool: "summarize", input: { text, bullets: 5 } });
    const bullets = ((sum.output as { bullets?: string[] })?.bullets ?? []).join("\n");
    const digest = `# Sentiment Digest — ${run.inputs.query}

${bullets}

## Top stories
${stories.map((s) => `- [${s.points ?? 0}] ${s.title}`).join("\n")}`;
    results.summary = digest;
    await emit("artifact", {
      id: n.id,
      name: "sentiment-digest.md",
      mime: "text/markdown",
      content: digest,
    });
  }
}

async function runAuditorNode(
  n: PlannedNode,
  run: RunRecord,
  results: Record<string, unknown>,
  emit: (kind: RunEventKind, payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const text = typeof results.summary === "string" ? (results.summary as string) : "";
  const res = await callTool({ tool: "score", input: { text } });
  const score = (res.output as { score?: number })?.score ?? 0;
  await emit("node.log", { id: n.id, line: `quality score: ${score}/100` });
  if (score < 25 && run.riskThreshold >= 5) {
    await emit("node.log", {
      id: n.id,
      line: "[auditor] low quality — flagging but proceeding (demo policy)",
    });
  }
}

// ---------------------------------------------------------------------------
// On-chain anchors (Proof-of-Work bridge)
// ---------------------------------------------------------------------------

/**
 * Unanchored *completed* runs, most-recent-first. A run is "completed" when
 * its status is `succeeded` or `failed` — the relayer anchors failures too
 * so holders can see a mission ran but didn't hit success (which still feeds
 * the hook's dynamic fee via a lower successScore).
 */
export async function listUnanchoredCompletedRuns(limit = 25): Promise<RunRecord[]> {
  const local: RunRecord[] = [];
  for (const r of memoryRuns.values()) {
    if (
      (r.status === "succeeded" || r.status === "failed") &&
      !memoryAnchors.has(r.id)
    ) {
      local.push(r);
    }
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return local
      .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt))
      .slice(0, limit);
  }

  const { data } = await supabase
    .from("runs")
    .select("*")
    .in("status", ["succeeded", "failed"])
    .order("finished_at", { ascending: false })
    .limit(limit * 2);

  const rows = (data ?? []).map((row) => dbRowToRun(row as Record<string, unknown>));
  const merged = new Map<string, RunRecord>();
  for (const r of rows) merged.set(r.id, r);
  for (const r of local) if (!merged.has(r.id)) merged.set(r.id, r);

  // Drop anything already anchored (check the cache; real deployment will
  // store anchors in supabase and filter with a left-join instead).
  const unanchored: RunRecord[] = [];
  for (const r of merged.values()) {
    if (!memoryAnchors.has(r.id)) unanchored.push(r);
  }

  return unanchored
    .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt))
    .slice(0, limit);
}

/**
 * Record the relayer's anchor for a run. Emits a `run.onchain` event so
 * anyone watching the SSE stream (the /app/runs/:id page, mainly) picks up
 * the BaseScan link immediately.
 *
 * Idempotent: re-anchoring the same run is a no-op and returns the existing
 * anchor, so a relayer crash-and-retry doesn't double-write.
 */
export async function recordAnchor(
  runId: string,
  anchor: OnchainAnchor,
): Promise<
  | { ok: true; anchor: OnchainAnchor; duplicate: boolean }
  | { ok: false; error: string; status: number }
> {
  const existing = memoryAnchors.get(runId);
  if (existing) return { ok: true, anchor: existing, duplicate: true };

  const run = await loadRun(runId);
  if (!run) return { ok: false, error: "run not found", status: 404 };

  memoryAnchors.set(runId, anchor);

  // Emit a run.onchain event so SSE streams pick it up. Seq is whatever
  // comes after the last event; if none buffered (e.g. cold read from
  // supabase-only run), start fresh at a high number so it sorts last.
  const buffered = memoryEvents.get(runId) ?? [];
  const seq = (buffered[buffered.length - 1]?.seq ?? 100) + 1;
  const event: RunEvent = {
    seq,
    kind: "run.onchain",
    payload: {
      tokenAddress: anchor.tokenAddress,
      chainId: anchor.chainId,
      txHash: anchor.txHash,
      attester: anchor.attester,
      paymasterSponsored: anchor.paymasterSponsored,
      successScore: anchor.proof.successScore,
      revenueCents: anchor.proof.revenueCents,
    },
    createdAt: anchor.anchoredAt,
  };
  await publishEvent(runId, event);

  return { ok: true, anchor, duplicate: false };
}

export function getAnchor(runId: string): OnchainAnchor | null {
  return memoryAnchors.get(runId) ?? null;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clampRisk(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.floor(n)));
}

function dbRowToRun(row: Record<string, unknown>): RunRecord {
  return {
    id: row.id as string,
    blueprintId: row.blueprint_id as string,
    goal: row.goal as string,
    mode: row.mode as RunRecord["mode"],
    status: row.status as RunStatus,
    riskThreshold: (row.risk_threshold as number) ?? 5,
    inputs: (row.inputs as Record<string, string>) ?? {},
    summary: (row.summary as string) ?? null,
    error: (row.error as string) ?? null,
    ownerFingerprint: (row.owner_fingerprint as string) ?? null,
    nodeId: (row.node_id as string) ?? null,
    targetNodeId: (row.target_node_id as string) ?? null,
    dispatchedAt: (row.dispatched_at as string) ?? null,
    claimedAt: (row.claimed_at as string) ?? null,
    shareToken: (row.share_token as string) ?? null,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string) ?? null,
    finishedAt: (row.finished_at as string) ?? null,
  };
}
