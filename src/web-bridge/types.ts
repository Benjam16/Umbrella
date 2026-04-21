/**
 * Minimal mirror of the Run/Event shapes served by `GET /api/v1/runs/:id`.
 *
 * We intentionally duplicate these here instead of importing from the ESM
 * `@umbrella/runner` workspace package — the published CLI is CommonJS and
 * shouldn't take a hard dependency on the monorepo graph. The HTTP contract
 * (JSON shape) is the source of truth; this file just types that contract
 * for the CLI's consumption.
 */

export type RunMode = 'cloud' | 'remote';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'ejected'
  | 'canceled';

export type PlannedNode = {
  id: string;
  label: string;
  worker: string;
  risk: number;
  requires?: string[];
  deps: string[];
};

export type RunEventKind =
  | 'plan'
  | 'node.start'
  | 'node.log'
  | 'node.finish'
  | 'artifact'
  | 'eject.requested'
  | 'signature.requested'
  | 'run.finish'
  | 'run.error';

export type RunEvent = {
  seq: number;
  kind: RunEventKind;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type RunRecord = {
  id: string;
  blueprintId: string;
  goal: string;
  mode: RunMode;
  status: RunStatus;
  riskThreshold: number;
  inputs: Record<string, string>;
  summary?: string | null;
  error?: string | null;
  ownerFingerprint?: string | null;
  nodeId?: string | null;
  shareToken?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type RunSnapshot = {
  run: RunRecord;
  events: RunEvent[];
};

export type HydratedArtifact = {
  id: string;
  name: string;
  mime: string;
  content: string;
};

export type HydratedLogLine = {
  seq: number;
  kind: 'sys' | 'node' | 'out' | 'err';
  text: string;
  createdAt: string;
};

export type HydratedEject = {
  reason: string;
  blockingNodes: string[];
  requestedAt: string;
};

export type NodeStatus = 'idle' | 'running' | 'done' | 'error' | 'blocked';

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

export type LocalFile = {
  path: string;
  contents: string;
};
