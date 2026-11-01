import { millis, type Millis, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { StoreHandle } from './open.js';

/**
 * Hardening C1 (SQLite's write-ahead logging page, "Checkpoint Starvation"): the checkpoints the workspace service asks for
 * itself, beside every connection's automatic one (`WAL_AUTOCHECKPOINT_PAGES`).
 *
 * The automatic checkpoint runs on a commit that leaves the log past its threshold, and it is PASSIVE: it copies what no
 * reader still needs and never waits. While a reader always holds an old snapshot the log cannot be reset, and a long run
 * beside constant readers grows it. Two more chances are taken, both in the service, which is the connection that is idle
 * between requests and the one closed in order:
 *  - **when its connection goes idle** — no request for `IDLE_CHECKPOINT_MS` — one PASSIVE checkpoint (`IdleCheckpoint`),
 *    re-armed by the next request, through the timer port (`rotaris/no-bare-timers`), so it never waits on a reader;
 *  - **on its orderly close** — the shutdown, a reopen, before a restore or a new store — a TRUNCATE checkpoint with the busy
 *    timeout lowered to 0 for it (`checkpointBeforeClose`), so a run host still writing makes it answer busy at once rather
 *    than holding the close for the 5 s every other statement may wait.
 * Each answers what SQLite reported, which the service logs at debug. Neither replaces the close's own checkpoint, and the
 * run host's open asks for neither: its hot path pays nothing.
 */
export type CheckpointMode = 'PASSIVE' | 'TRUNCATE';

/** `PRAGMA wal_checkpoint(mode)`'s one row: whether it was kept from finishing, the log's frames, and how many it copied. */
export interface CheckpointResult {
  readonly mode: CheckpointMode;
  readonly busy: boolean;
  readonly logFrames: number;
  readonly checkpointed: number;
}

/** No request for this long counts as idle: longer than a burst of one surface's reads, short enough to follow a run's end. */
export const IDLE_CHECKPOINT_MS: Millis = millis(30_000);

export function checkpointStore(db: StoreHandle, mode: CheckpointMode): CheckpointResult {
  const row = (db.pragma(`wal_checkpoint(${mode})`) as { busy: number; log: number; checkpointed: number }[])[0];
  return { mode, busy: (row?.busy ?? 0) !== 0, logFrames: row?.log ?? -1, checkpointed: row?.checkpointed ?? -1 };
}

/** The orderly close's TRUNCATE, bounded: the busy timeout is 0 for it and put back after, whatever it answers. */
export function checkpointBeforeClose(db: StoreHandle): CheckpointResult {
  const prior = db.pragma('busy_timeout', { simple: true }) as number;
  db.pragma('busy_timeout = 0');
  try {
    return checkpointStore(db, 'TRUNCATE');
  } finally {
    db.pragma(`busy_timeout = ${prior}`);
  }
}

/** One PASSIVE checkpoint once the connection has gone `delay` without use; `touch` at every use re-arms it. */
export class IdleCheckpoint {
  #handle: TimerHandle | null = null;
  constructor(private readonly timers: Timers, private readonly delay: Millis, private readonly onIdle: () => void) {}

  touch(): void {
    this.#handle?.cancel();
    this.#handle = this.timers.after(this.delay, () => {
      this.#handle = null;
      this.onIdle();
    });
  }

  cancel(): void {
    this.#handle?.cancel();
    this.#handle = null;
  }

  get armed(): boolean {
    return this.#handle !== null;
  }
}
