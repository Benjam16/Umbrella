export type WorkerKind =
  | "SUPERVISOR"
  | "CODER_WORKER"
  | "SCRAPER_WORKER"
  | "AUDITOR_WORKER"
  | "CRO_WORKER"
  | "OUTREACH_WORKER";

export const ALL_WORKERS: WorkerKind[] = [
  "SUPERVISOR",
  "CODER_WORKER",
  "SCRAPER_WORKER",
  "AUDITOR_WORKER",
  "CRO_WORKER",
  "OUTREACH_WORKER",
];

type QueuedJob<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type WorkerState = {
  active: number;
  queue: QueuedJob<unknown>[];
};

function workerConcurrency(worker: WorkerKind): number {
  const envName = {
    SUPERVISOR: "UMBRELLA_SUPERVISOR_PARALLELISM",
    CODER_WORKER: "UMBRELLA_CODER_PARALLELISM",
    SCRAPER_WORKER: "UMBRELLA_SCRAPER_PARALLELISM",
    AUDITOR_WORKER: "UMBRELLA_AUDITOR_PARALLELISM",
    CRO_WORKER: "UMBRELLA_CRO_PARALLELISM",
    OUTREACH_WORKER: "UMBRELLA_OUTREACH_PARALLELISM",
  }[worker];
  const fallback = worker === "SCRAPER_WORKER" ? 2 : 1;
  return Math.max(1, Number(process.env[envName] ?? fallback));
}

export class WorkerExecutionQueue {
  private readonly states = new Map<WorkerKind, WorkerState>();

  enqueue<T>(worker: WorkerKind, job: () => Promise<T>): Promise<T> {
    const state = this.getState(worker);
    return new Promise<T>((resolve, reject) => {
      state.queue.push({
        run: job as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.pump(worker);
    });
  }

  private getState(worker: WorkerKind): WorkerState {
    let state = this.states.get(worker);
    if (!state) {
      state = { active: 0, queue: [] };
      this.states.set(worker, state);
    }
    return state;
  }

  private pump(worker: WorkerKind): void {
    const state = this.getState(worker);
    const limit = workerConcurrency(worker);
    while (state.active < limit && state.queue.length > 0) {
      const next = state.queue.shift();
      if (!next) return;
      state.active += 1;
      void next
        .run()
        .then((value) => next.resolve(value))
        .catch((err) => next.reject(err))
        .finally(() => {
          state.active -= 1;
          this.pump(worker);
        });
    }
  }

  stats(): Array<{
    worker: WorkerKind;
    active: number;
    queued: number;
    limit: number;
  }> {
    return ALL_WORKERS.map((worker) => {
      const state = this.getState(worker);
      return {
        worker,
        active: state.active,
        queued: state.queue.length,
        limit: workerConcurrency(worker),
      };
    });
  }
}

export const workerQueue = new WorkerExecutionQueue();
