import { EventEmitter } from "node:events";
import type { RunEvent } from "./types";

/**
 * Process-local event bus. SSE handlers subscribe here for live updates; the
 * supervisor emits as it executes. Events are ALSO persisted to Supabase so
 * that a reconnecting client can replay from seq=0 and catch up seamlessly.
 *
 * This is intentionally in-process — Phase 1 targets a single Node container
 * (Fly.io / Railway). For multi-replica deployments, swap this for Supabase
 * Realtime or Redis pub/sub without touching the supervisor.
 */
class RunBus {
  private emitter = new EventEmitter();
  private buffers = new Map<string, RunEvent[]>();

  constructor() {
    // A single active run can have many SSE clients — avoid the default 10 cap.
    this.emitter.setMaxListeners(1000);
  }

  emit(runId: string, event: RunEvent) {
    const buf = this.buffers.get(runId) ?? [];
    buf.push(event);
    // Keep the last 500 events per run in memory as a cheap replay cache.
    if (buf.length > 500) buf.splice(0, buf.length - 500);
    this.buffers.set(runId, buf);
    this.emitter.emit(runId, event);
    this.emitter.emit("*", runId, event);
  }

  subscribe(runId: string, handler: (event: RunEvent) => void): () => void {
    this.emitter.on(runId, handler);
    return () => {
      this.emitter.off(runId, handler);
    };
  }

  /** Return cached events since `afterSeq` (exclusive). */
  replay(runId: string, afterSeq: number): RunEvent[] {
    const buf = this.buffers.get(runId) ?? [];
    return buf.filter((e) => e.seq > afterSeq);
  }

  done(runId: string) {
    this.emitter.emit(runId, { seq: -1, kind: "run.finish", payload: { closed: true }, createdAt: new Date().toISOString() });
    this.emitter.removeAllListeners(runId);
    // Keep the replay buffer around briefly so late reconnects can still catch up.
    setTimeout(() => this.buffers.delete(runId), 60_000);
  }
}

// Preserve the bus across HMR reloads in dev so open SSE connections aren't orphaned.
const globalAny = globalThis as unknown as { __umbrellaBus?: RunBus };
export const runBus: RunBus = globalAny.__umbrellaBus ?? new RunBus();
if (!globalAny.__umbrellaBus) globalAny.__umbrellaBus = runBus;
