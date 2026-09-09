import { err, millis, type Clocks, type Millis, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { ProgressReport } from '@rotaris/contracts';
import { freshToken, raiseCancelFlag, sharedCancelFlag } from './cancel.js';
import type { JobExecutor, RunOptions } from './executor.js';
import { executeJob, type Job, type JobOutcome } from './jobs.js';

/**
 * The worker-thread executor (ADR-0040: passes on terminable worker threads). The owner posts a job with a shared
 * cancel flag; the worker runs `executeJob` and posts progress and the outcome back. A cancel raises the flag —
 * observed at the pass's next checkpoint even inside a synchronous loop (cancel.ts) — and starts a grace timer; a
 * worker that has not answered by then is TERMINATED and respawned lazily for the next job. That is the one
 * remedy this build offers for a wedged project pattern (OQ-25): nothing bounds the pattern itself, and the user
 * is told only that the operation was cancelled.
 *
 * `WorkerLike` is the duck type of `node:worker_threads`' `Worker`; the composition root supplies the real one
 * through electron-vite's `?nodeWorker` factory, and the tests supply a fake.
 */
export interface WorkerLike {
  postMessage(value: unknown): void;
  on(event: 'message', listener: (value: unknown) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  terminate(): Promise<number> | void;
}

export interface WorkerPort {
  on(event: 'message', listener: (value: unknown) => void): unknown;
  postMessage(value: unknown): void;
}

export type ToWorker = { readonly t: 'job'; readonly id: number; readonly job: Job; readonly flag: Int32Array };
export type FromWorker =
  | { readonly t: 'progress'; readonly id: number; readonly report: ProgressReport }
  | { readonly t: 'done'; readonly id: number; readonly outcome: JobOutcome };

export const CANCEL_GRACE_MS: Millis = millis(2_000);

/** The worker side: run each job as it arrives, with the shared flag as its cancel token. */
export function workerMain(port: WorkerPort, clocks: Clocks): void {
  port.on('message', (value) => {
    const m = value as ToWorker;
    if (m === null || typeof m !== 'object' || m.t !== 'job') return;
    void executeJob(m.job, { clocks, token: freshToken(undefined, m.flag), progress: { sink: (report) => port.postMessage({ t: 'progress', id: m.id, report } satisfies FromWorker) } })
      .then((outcome) => port.postMessage({ t: 'done', id: m.id, outcome } satisfies FromWorker));
  });
}

interface Pending { resolve(outcome: JobOutcome): void; readonly options: RunOptions; readonly flag: Int32Array; grace?: TimerHandle }

/** The owner side. */
export function createWorkerExecutor(spawn: () => WorkerLike, timers: Timers, graceMs: Millis = CANCEL_GRACE_MS): JobExecutor & { readonly spawned: () => number } {
  let worker: WorkerLike | null = null;
  let spawned = 0;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const settle = (id: number, outcome: JobOutcome): void => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    p.grace?.cancel();
    p.resolve(outcome);
  };
  const dropWorker = (why: string): void => {
    const w = worker;
    worker = null;
    if (w) { try { void w.terminate(); } catch { /* already gone */ } }
    for (const id of [...pending.keys()]) settle(id, { result: err({ kind: 'failed', what: 'the traceability worker', cause: why }), writes: [] });
  };
  const ensure = (): WorkerLike => {
    if (worker) return worker;
    const w = spawn();
    spawned += 1;
    worker = w;
    w.on('message', (value) => {
      const m = value as FromWorker;
      if (m === null || typeof m !== 'object') return;
      if (m.t === 'progress') { const p = pending.get(m.id); if (p?.options.progress) { try { p.options.progress(m.report); } catch (e) { p.options.onHookError?.(`progress(${m.report.kind}:${m.report.phase})`, e); } } }
      else if (m.t === 'done') settle(m.id, m.outcome);
    });
    w.on('error', (e) => { if (worker === w) dropWorker(e.message); });
    w.on('exit', (code) => { if (worker === w) dropWorker(`the worker exited with code ${code}`); });
    return w;
  };
  return {
    spawned: () => spawned,
    run(job, options) {
      const id = nextId++;
      const flag = sharedCancelFlag();
      const w = ensure();
      return new Promise<JobOutcome>((resolve) => {
        const p: Pending = { resolve, options, flag };
        pending.set(id, p);
        if (options.signal) {
          const onAbort = (): void => {
            if (!pending.has(id)) return;
            raiseCancelFlag(flag);
            // The pass sees the flag at its next checkpoint; a worker wedged inside a pattern never reaches one.
            p.grace = timers.after(graceMs, () => {
              if (!pending.has(id)) return;
              pending.delete(id);
              if (worker === w) { worker = null; try { void w.terminate(); } catch { /* already gone */ } }
              resolve({ result: err({ kind: 'cancelled' }), writes: [] });
            });
          };
          if (options.signal.aborted) onAbort(); else options.signal.addEventListener('abort', onAbort, { once: true });
        }
        try { w.postMessage({ t: 'job', id, job, flag } satisfies ToWorker); } catch (e) { settle(id, { result: err({ kind: 'failed', what: 'posting the job to the traceability worker', cause: e instanceof Error ? e.message : String(e) }), writes: [] }); }
      });
    },
    dispose() { dropWorker('the executor was disposed'); },
  };
}
