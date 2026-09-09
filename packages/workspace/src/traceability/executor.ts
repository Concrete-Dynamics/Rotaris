import type { Clocks } from '@rotaris/kernel';
import { freshToken } from './cancel.js';
import { executeJob, type Job, type JobOutcome } from './jobs.js';
import type { ProgressSink } from './progress.js';

/**
 * Where a job runs. The product runs jobs on a terminable worker thread (worker.ts) so a project-supplied regular
 * expression with catastrophic backtracking can be killed without taking the workspace service down (ADR-0040,
 * OQ-25), and so REQ-TRACE-337/497's "never blocks the interface loop" holds one process further down as well.
 * Tests run jobs in-thread; the two executors run the same `executeJob`.
 */
export interface RunOptions {
  readonly signal?: AbortSignal;
  readonly progress?: ProgressSink;
  readonly onHookError?: (hook: string, error: unknown) => void;
}

export interface JobExecutor {
  run(job: Job, options: RunOptions): Promise<JobOutcome>;
  dispose(): void;
}

export function createInThreadExecutor(clocks: Clocks): JobExecutor {
  return {
    run: (job, options) => executeJob(job, { clocks, token: freshToken(options.signal), progress: { sink: options.progress, ...(options.onHookError ? { onHookError: options.onHookError } : {}) } }),
    dispose: () => undefined,
  };
}
