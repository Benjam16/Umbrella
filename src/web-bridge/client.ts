import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { LocalFile, RunSnapshot } from './types';
import { DEFAULT_WEB_URL, loadNodeConfig } from './node-config';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Resolve the base web URL to hit for a pull:
 *   1. explicit --from <url>
 *   2. UMBRELLA_WEB_URL env var
 *   3. paired node config
 *   4. https://umbrellagnt.xyz
 */
export function resolveWebUrl(override?: string | null): string {
  if (override) return override.replace(/\/$/, '');
  if (process.env.UMBRELLA_WEB_URL) {
    return process.env.UMBRELLA_WEB_URL.replace(/\/$/, '');
  }
  const cfg = loadNodeConfig();
  if (cfg?.webUrl) return cfg.webUrl.replace(/\/$/, '');
  return DEFAULT_WEB_URL.replace(/\/$/, '');
}

/**
 * Fetch `GET {webUrl}/api/v1/runs/:id` and return the JSON snapshot. Any
 * non-200 response is converted into a thrown Error whose `.message` is
 * suitable for the CLI to surface verbatim.
 */
export async function fetchRunSnapshot(
  webUrl: string,
  runId: string,
  opts: { token?: string | null; nodeId?: string | null } = {},
): Promise<RunSnapshot> {
  const url = `${webUrl.replace(/\/$/, '')}/api/v1/runs/${encodeURIComponent(runId)}`;
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'umbrella-cli',
  };
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  if (opts.nodeId) headers['x-umbrella-node-id'] = opts.nodeId;

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`could not reach ${url}: ${msg}`);
  }

  if (res.status === 404) {
    throw new Error(`run ${runId} not found on ${webUrl}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `web api returned ${res.status} ${res.statusText} for ${url}${body ? ` — ${body.slice(0, 200)}` : ''}`,
    );
  }

  const json = (await res.json()) as Partial<RunSnapshot>;
  if (!json || typeof json !== 'object' || !json.run) {
    throw new Error(`invalid run payload from ${url}`);
  }
  return {
    run: json.run,
    events: Array.isArray(json.events) ? json.events : [],
  };
}

export type AnnounceResponse = {
  announced: boolean;
  nodeId: string;
  pairingCode: string;
  expiresAt: string;
  pairUrl: string;
};

/**
 * POST /api/v1/nodes/announce — tells the web about a freshly-minted pairing.
 * Only the sha256 of the token is sent; the raw token never leaves the CLI.
 */
export async function announceNode(
  webUrl: string,
  input: {
    nodeId: string;
    pairingCode: string;
    tokenHash: string;
    hostname?: string | null;
    label?: string | null;
  },
): Promise<AnnounceResponse> {
  const url = `${webUrl.replace(/\/$/, '')}/api/v1/nodes/announce`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'umbrella-cli',
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`could not reach ${url}: ${msg}`);
  }
  const json = (await res.json().catch(() => null)) as
    | (AnnounceResponse & { error?: string })
    | null;
  if (!res.ok || !json || (json as { error?: string }).error) {
    const msg = json?.error ?? `${res.status} ${res.statusText}`;
    throw new Error(`announce rejected: ${msg}`);
  }
  return json;
}

export type PendingRunLite = {
  id: string;
  blueprintId: string;
  goal: string;
  inputs: Record<string, string>;
  riskThreshold: number;
  createdAt: string;
  claimUrl: string;
  eventsUrl: string;
};

export type HeartbeatResponse = {
  ok: boolean;
  paired: boolean;
  node: {
    id: string;
    nodeId: string;
    label: string;
    hostname: string | null;
    status: 'online' | 'offline' | 'revoked';
    lastSeenAt: string | null;
    lastHeartbeatAt: string | null;
    paired: boolean;
    createdAt: string;
  };
  pendingRuns?: PendingRunLite[];
  message?: string;
};

/**
 * POST /api/v1/nodes/heartbeat — proves the CLI controls its token by
 * sending the raw Bearer. The server rehashes and matches against
 * `token_hash` stored at announce time.
 */
export async function heartbeatNode(
  webUrl: string,
  input: { nodeId: string; nodeToken: string },
): Promise<HeartbeatResponse> {
  const url = `${webUrl.replace(/\/$/, '')}/api/v1/nodes/heartbeat`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${input.nodeToken}`,
        'x-umbrella-node-id': input.nodeId,
        'user-agent': 'umbrella-cli',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`could not reach ${url}: ${msg}`);
  }
  const json = (await res.json().catch(() => null)) as
    | (HeartbeatResponse & { error?: string })
    | null;
  if (res.status === 401) {
    throw new Error('unauthorized — token rejected. Run `umbrella connect --rotate` to mint a new one.');
  }
  if (!res.ok || !json) {
    const err = (json as { error?: string } | null)?.error;
    throw new Error(`heartbeat failed: ${err ?? `${res.status} ${res.statusText}`}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Dispatch loop: claim a run + stream events back
// ---------------------------------------------------------------------------

export type ClaimedRun = {
  run: {
    id: string;
    blueprintId: string;
    goal: string;
    inputs: Record<string, string>;
    riskThreshold: number;
    targetNodeId?: string | null;
    claimedAt?: string | null;
  };
  plan: Array<{
    id: string;
    label: string;
    deps: string[];
    risk: number;
    role?: string;
    requires?: string[];
  }>;
  blueprint: { id: string; title: string };
};

/**
 * POST /api/v1/runs/:id/claim — take ownership of a dispatched run. Returns
 * the full run + the planned DAG the CLI should execute locally.
 */
export async function claimRemoteRun(
  webUrl: string,
  runId: string,
  auth: { nodeId: string; nodeToken: string },
): Promise<ClaimedRun> {
  const url = `${webUrl.replace(/\/$/, '')}/api/v1/runs/${encodeURIComponent(runId)}/claim`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${auth.nodeToken}`,
        'x-umbrella-node-id': auth.nodeId,
        'user-agent': 'umbrella-cli',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`could not reach ${url}: ${msg}`);
  }
  if (res.status === 401) throw new Error('unauthorized — token rejected.');
  if (res.status === 403) throw new Error('run not dispatched to this node');
  if (res.status === 409) throw new Error('run already claimed');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`claim failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  return (await res.json()) as ClaimedRun;
}

export type RemoteEvent = {
  kind: string;
  payload: Record<string, unknown>;
};

/**
 * POST /api/v1/runs/:id/events — stream one or more events (node.start,
 * node.log, node.finish, artifact, run.finish, …) back to the web.
 */
export async function pushRemoteEvent(
  webUrl: string,
  runId: string,
  auth: { nodeId: string; nodeToken: string },
  event: RemoteEvent | { events: RemoteEvent[] },
): Promise<void> {
  const url = `${webUrl.replace(/\/$/, '')}/api/v1/runs/${encodeURIComponent(runId)}/events`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${auth.nodeToken}`,
        'x-umbrella-node-id': auth.nodeId,
        'user-agent': 'umbrella-cli',
      },
      body: JSON.stringify(event),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`could not reach ${url}: ${msg}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`push event failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
}

/**
 * Write all files under a root directory. Overwrites existing files; creates
 * subdirectories as needed. Returns the list of absolute paths written.
 */
export function writeLocalLayout(
  root: string,
  files: LocalFile[],
): { written: string[]; root: string } {
  fs.ensureDirSync(root);
  const written: string[] = [];
  for (const f of files) {
    const abs = path.join(root, f.path);
    fs.ensureDirSync(path.dirname(abs));
    fs.writeFileSync(abs, f.contents, 'utf8');
    written.push(abs);
  }
  return { written, root };
}
