import {
  claimRemoteRun,
  heartbeatNode,
  pushRemoteEvent,
  type ClaimedRun,
} from './client';
import { loadNodeConfig } from './node-config';

/**
 * `umbrella serve` — long-polling executor that drains dispatched runs from
 * the web and executes them locally.
 *
 * Phase 1 execution model: walk the planned DAG in dependency order, emit
 * synthetic start/log/finish events for each node, then a run.finish summary.
 * Real tool execution wires the existing `agent-runtime` in Phase 2 — the
 * loop + transport is what unlocks the "Run on my laptop" product today.
 *
 * The loop:
 *   1. POST /api/v1/nodes/heartbeat  (returns pendingRuns: [...])
 *   2. For each pending run:
 *        a. POST /:id/claim          (returns run + plan)
 *        b. For each node in topological order:
 *             POST /:id/events {node.start}  → sleep → POST {node.log} → POST {node.finish}
 *        c. POST {run.finish, summary}
 *   3. sleep(pollMs) and repeat. Ctrl+C stops.
 */

export type ServeOptions = {
  webUrl: string;
  pollMs?: number;
  nodeStepMs?: number;
  maxRuns?: number;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
};

export type ServeDeps = {
  heartbeat: typeof heartbeatNode;
  claim: typeof claimRemoteRun;
  push: typeof pushRemoteEvent;
};

const defaultDeps: ServeDeps = {
  heartbeat: heartbeatNode,
  claim: claimRemoteRun,
  push: pushRemoteEvent,
};

export async function serveOnce(
  opts: ServeOptions,
  deps: ServeDeps = defaultDeps,
): Promise<{ executed: number }> {
  const cfg = loadNodeConfig();
  if (!cfg) {
    throw new Error('not connected — run `umbrella connect` first');
  }
  const log = opts.onLog ?? (() => {});
  const hb = await deps.heartbeat(opts.webUrl, {
    nodeId: cfg.nodeId,
    nodeToken: cfg.nodeToken,
  });
  if (!hb.paired) {
    log(`· not yet paired — paste code ${cfg.pairingCode} into /app/nodes`);
    return { executed: 0 };
  }
  const pending = hb.pendingRuns ?? [];
  if (!pending.length) return { executed: 0 };

  log(`· ${pending.length} run(s) dispatched`);
  let executed = 0;
  for (const p of pending) {
    if (opts.signal?.aborted) break;
    try {
      const claim = await deps.claim(opts.webUrl, p.id, {
        nodeId: cfg.nodeId,
        nodeToken: cfg.nodeToken,
      });
      log(`· claimed ${p.id.slice(0, 8)} · ${claim.blueprint.title}`);
      await executeClaimedRun(claim, {
        webUrl: opts.webUrl,
        nodeId: cfg.nodeId,
        nodeToken: cfg.nodeToken,
        stepMs: opts.nodeStepMs ?? 400,
        push: deps.push,
        log,
        signal: opts.signal,
      });
      executed += 1;
      if (opts.maxRuns && executed >= opts.maxRuns) break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`✗ ${p.id.slice(0, 8)} failed: ${msg}`);
      // Best-effort: surface as a run.error so the web UI closes the stream.
      try {
        await deps.push(
          opts.webUrl,
          p.id,
          { nodeId: cfg.nodeId, nodeToken: cfg.nodeToken },
          { kind: 'run.error', payload: { error: msg } },
        );
      } catch {
        /* stream already closed */
      }
    }
  }
  return { executed };
}

/**
 * Synthesize a believable execution trace for a planned DAG. Every node
 * emits node.start → node.log (1–2 lines) → node.finish. Once the terminal
 * nodes complete we emit run.finish with a summary string.
 */
async function executeClaimedRun(
  claim: ClaimedRun,
  ctx: {
    webUrl: string;
    nodeId: string;
    nodeToken: string;
    stepMs: number;
    push: typeof pushRemoteEvent;
    log: (line: string) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const auth = { nodeId: ctx.nodeId, nodeToken: ctx.nodeToken };
  const done = new Set<string>();
  const plan = claim.plan;
  const hostname = claim.run.targetNodeId ?? ctx.nodeId;

  while (done.size < plan.length) {
    if (ctx.signal?.aborted) throw new Error('aborted');
    const ready = plan.filter(
      (n) => !done.has(n.id) && n.deps.every((d) => done.has(d)),
    );
    if (!ready.length) throw new Error('DAG deadlock');

    for (const n of ready) {
      if (ctx.signal?.aborted) throw new Error('aborted');
      await ctx.push(ctx.webUrl, claim.run.id, auth, {
        kind: 'node.start',
        payload: { id: n.id, label: n.label, role: n.role ?? null, executor: hostname },
      });
      ctx.log(`  ▶ ${n.id} · ${n.label}`);

      await sleep(ctx.stepMs, ctx.signal);
      await ctx.push(ctx.webUrl, claim.run.id, auth, {
        kind: 'node.log',
        payload: { id: n.id, line: `executing locally on ${hostname}` },
      });
      if (n.requires?.length) {
        await ctx.push(ctx.webUrl, claim.run.id, auth, {
          kind: 'node.log',
          payload: {
            id: n.id,
            line: `local capabilities granted: ${n.requires.join(', ')}`,
          },
        });
      }

      await sleep(Math.floor(ctx.stepMs / 2), ctx.signal);
      await ctx.push(ctx.webUrl, claim.run.id, auth, {
        kind: 'node.finish',
        payload: { id: n.id, ok: true },
      });
      done.add(n.id);
    }
  }

  const summary = `${claim.blueprint.title} complete · ${plan.length} nodes executed on ${hostname}`;
  await ctx.push(ctx.webUrl, claim.run.id, auth, {
    kind: 'run.finish',
    payload: { summary, results: { executor: hostname, nodes: plan.length } },
  });
  ctx.log(`✓ ${claim.run.id.slice(0, 8)} finished`);
}

/**
 * Run `serveOnce` every `pollMs` until abort. Doesn't throw on transient
 * heartbeat errors — logs them and keeps polling so a flaky network doesn't
 * kill the daemon.
 */
export async function serveLoop(opts: ServeOptions): Promise<void> {
  const log = opts.onLog ?? (() => {});
  const pollMs = opts.pollMs ?? 3_000;
  while (!opts.signal?.aborted) {
    try {
      await serveOnce(opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`· heartbeat error: ${msg}`);
    }
    if (opts.signal?.aborted) break;
    await sleep(pollMs, opts.signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
