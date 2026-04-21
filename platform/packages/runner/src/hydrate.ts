import type { PlannedNode, RunEvent, RunRecord } from "./types";

export type HydratedArtifact = {
  id: string;
  name: string;
  mime: string;
  content: string;
};

export type HydratedLogLine = {
  seq: number;
  kind: "sys" | "node" | "out" | "err";
  text: string;
  createdAt: string;
};

export type HydratedEject = {
  reason: string;
  blockingNodes: string[];
  requestedAt: string;
};

export type NodeStatus = "idle" | "running" | "done" | "error" | "blocked";

export type HydratedRun = {
  run: RunRecord;
  plan: PlannedNode[];
  statuses: Record<string, NodeStatus>;
  artifacts: HydratedArtifact[];
  logs: HydratedLogLine[];
  summary: string | null;
  error: string | null;
  eject: HydratedEject | null;
};

/**
 * Pure transformer that turns the (run, events) snapshot returned by
 * `GET /api/v1/runs/:id` into a materialized, file-ready representation.
 *
 * Intentionally side-effect free — the CLI (or any consumer) decides how to
 * write this to disk. See `planLocalLayout()` for the opinionated file layout
 * used by `umbrella pull`.
 */
export function hydrateContext(input: {
  run: RunRecord;
  events: RunEvent[];
}): HydratedRun {
  const { run, events } = input;

  let plan: PlannedNode[] = [];
  const statuses: Record<string, NodeStatus> = {};
  const artifacts: HydratedArtifact[] = [];
  const logs: HydratedLogLine[] = [];
  let summary: string | null = null;
  let error: string | null = null;
  let eject: HydratedEject | null = null;

  const sorted = [...events].sort((a, b) => a.seq - b.seq);

  for (const event of sorted) {
    const p = event.payload ?? {};

    if (event.kind === "plan") {
      plan = ((p as { nodes?: PlannedNode[] }).nodes ?? []).map((n) => ({ ...n }));
      for (const n of plan) statuses[n.id] = "idle";
      logs.push({
        seq: event.seq,
        kind: "sys",
        text: `plan: ${plan.length} nodes`,
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.kind === "node.start") {
      const id = String((p as { id?: unknown }).id ?? "");
      if (id) statuses[id] = "running";
      logs.push({
        seq: event.seq,
        kind: "node",
        text: `→ ${id} ${String((p as { label?: unknown }).label ?? "")}`.trim(),
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.kind === "node.log") {
      const id = String((p as { id?: unknown }).id ?? "");
      const line = String((p as { line?: unknown }).line ?? "");
      logs.push({
        seq: event.seq,
        kind: "out",
        text: `  [${id}] ${line}`,
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.kind === "node.finish") {
      const id = String((p as { id?: unknown }).id ?? "");
      const ok = Boolean((p as { ok?: unknown }).ok);
      if (id) statuses[id] = ok ? "done" : "error";
      logs.push({
        seq: event.seq,
        kind: ok ? "out" : "err",
        text: `${ok ? "✓" : "✗"} ${id}`,
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.kind === "artifact") {
      artifacts.push({
        id: String((p as { id?: unknown }).id ?? `art-${event.seq}`),
        name: String((p as { name?: unknown }).name ?? `artifact-${event.seq}.md`),
        mime: String((p as { mime?: unknown }).mime ?? "text/plain"),
        content: String((p as { content?: unknown }).content ?? ""),
      });
      logs.push({
        seq: event.seq,
        kind: "sys",
        text: `artifact sealed: ${(p as { name?: unknown }).name ?? ""}`,
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.kind === "eject.requested") {
      const blocking = ((p as { blockingNodes?: unknown }).blockingNodes as string[]) ?? [];
      eject = {
        reason: String((p as { reason?: unknown }).reason ?? ""),
        blockingNodes: blocking,
        requestedAt: event.createdAt,
      };
      for (const id of blocking) statuses[id] = "blocked";
      logs.push({
        seq: event.seq,
        kind: "err",
        text: `eject requested: ${eject.reason}`,
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.kind === "run.finish") {
      summary = String((p as { summary?: unknown }).summary ?? "");
      logs.push({
        seq: event.seq,
        kind: "sys",
        text: "run complete",
        createdAt: event.createdAt,
      });
      continue;
    }

    if (event.kind === "run.error") {
      error = String((p as { error?: unknown }).error ?? "unknown error");
      logs.push({
        seq: event.seq,
        kind: "err",
        text: error,
        createdAt: event.createdAt,
      });
    }
  }

  return { run, plan, statuses, artifacts, logs, summary, error, eject };
}

/**
 * A file is `{ path, contents }` — the consumer is expected to write these
 * verbatim. Paths are always POSIX-style and always relative to the CLI's
 * chosen root (typically `./research/<runId>/`).
 */
export type LocalFile = {
  path: string;
  contents: string;
};

/**
 * Opinionated on-disk layout for a hydrated run. Lives in `./research/<runId>/`:
 *
 *   run.json        – the RunRecord (inputs, status, mode, timestamps)
 *   plan.json       – the DAG (nodes + deps)
 *   events.jsonl    – the raw event log (line-delimited JSON)
 *   logs.txt        – human-readable rendering of the event stream
 *   summary.md      – final summary, if the run produced one
 *   eject.md        – written when the run was ejected; explains why
 *   artifacts/<name> – each artifact as its own file
 */
export function planLocalLayout(hydrated: HydratedRun): LocalFile[] {
  const files: LocalFile[] = [];

  files.push({
    path: "run.json",
    contents: JSON.stringify(hydrated.run, null, 2) + "\n",
  });

  files.push({
    path: "plan.json",
    contents: JSON.stringify(hydrated.plan, null, 2) + "\n",
  });

  files.push({
    path: "events.jsonl",
    contents:
      hydrated.logs
        .map((l) =>
          JSON.stringify({
            seq: l.seq,
            kind: l.kind,
            text: l.text,
            createdAt: l.createdAt,
          }),
        )
        .join("\n") + (hydrated.logs.length ? "\n" : ""),
  });

  files.push({
    path: "logs.txt",
    contents:
      hydrated.logs
        .map((l) => `[${l.createdAt}] ${l.text}`)
        .join("\n") + (hydrated.logs.length ? "\n" : ""),
  });

  if (hydrated.summary) {
    const fm = [
      "---",
      `run_id: ${hydrated.run.id}`,
      `blueprint: ${hydrated.run.blueprintId}`,
      `status: ${hydrated.run.status}`,
      "---",
      "",
    ].join("\n");
    files.push({
      path: "summary.md",
      contents: fm + hydrated.summary + "\n",
    });
  }

  if (hydrated.eject) {
    const body = [
      "# Eject requested",
      "",
      `> ${hydrated.eject.reason}`,
      "",
      "## Blocking nodes",
      "",
      ...hydrated.eject.blockingNodes.map((id) => `- \`${id}\``),
      "",
      "Resume these locally with full tool access (shell, fs, secrets).",
      "",
    ].join("\n");
    files.push({ path: "eject.md", contents: body });
  }

  for (const art of hydrated.artifacts) {
    const safeName = art.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    files.push({
      path: `artifacts/${safeName}`,
      contents: art.content,
    });
  }

  return files;
}
