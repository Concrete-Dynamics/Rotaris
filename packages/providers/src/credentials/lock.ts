import { readFileSync, rmSync } from 'node:fs';
import { err, failure, millis, type Failure, type Millis, type MonotonicClock, type Result, type Timers } from '@rotaris/kernel';
import { exclusiveCreate, probePid, type Liveness } from '@rotaris/platform';

/**
 * REQ-PROVIDER-152 — every read-modify-write over a credential file or the snapshot holds an exclusive
 * lock on a lock file adjacent to the target; 5 s to acquire, else the operation fails with a retryable
 * message that never claims a second instance is running; a lock left by a process that is provably gone
 * is reclaimed; a lock a live process holds is never broken; reads take no lock.
 *
 * Under SR-1 the lock is belt over braces (ADR-0029): one instance issues every write from main, so the
 * bound should never be observed. The record carries the holder's pid and its start time; staleness is
 * decided by the liveness probe on the pid. A pid reused by an unrelated process would read as live, which
 * is the safe direction (the requirement forbids breaking a live holder; a stale lock waits out the bound).
 */
export interface LockHolder { readonly pid: number; readonly started_at: string }

export interface LockDeps {
  readonly pid: number;
  /** The holder's process start, ISO-8601 UTC, recorded for a reader; not used to decide staleness. */
  readonly startedAt: string;
  readonly timers: Timers;
  readonly monotonic: MonotonicClock;
  readonly boundMs?: Millis;
  readonly pollMs?: Millis;
  readonly probe?: (pid: number) => Liveness;
}

export const LOCK_BOUND_MS = millis(5_000);
const POLL_MS = millis(50);
export const LOCK_BUSY = 'The credential store is being updated; try the action again in a moment.';

/**
 * REQ-PROVIDER-152 gives the busy refusal to "a lock that cannot be taken within 5 seconds", and REQ-PROVIDER-018 has a
 * failed write report *its* error. A lock file that cannot be created at all (a regular file where its folder would go,
 * a folder standing at its own path, a folder the account may not write into, a full disk) is neither a store being
 * updated nor anything a retry "in a moment" cures, so it is reported at once as what it is, naming the lock file and
 * the cause. Until 2026-10-06 every such refusal answered `LOCK_BUSY` at once, without the bound
 * (docs/defects/fixed/the-credential-lock-reports-a-busy-store-when-the-lock-file-cannot-be-created.md).
 */
export const lockUnavailable = (lockPath: string, cause: string): string =>
  `Nothing was changed: the lock file ${lockPath} could not be created. ${cause.replace(/\.?$/, '.')}`;

/**
 * Why a lock is reclaimed: its holder is gone (REQ-PROVIDER-152), it is this instance's own lock that an earlier
 * operation's release could not remove, or its record names no holder at all.
 */
export type ReclaimedHolder = 'gone' | 'own' | 'unreadable';

const RECLAIMED: Record<ReclaimedHolder, string> = {
  gone: 'left by a process that is no longer running',
  own: 'left by an earlier credential update of this instance, whose release could not remove it',
  unreadable: 'whose record names no holder',
};

/**
 * A lock left by a process that is no longer running is reclaimed (REQ-PROVIDER-152), but `force` excuses only a file
 * that is already gone: a stale lock in a folder the account may not write into (`EACCES`), or one another process holds
 * open on Windows (`EPERM`, `EBUSY`), refuses the removal. That is reported as a value naming the lock file and the cause,
 * by the same reading as the create's refusal, never thrown out of `withLock` past the `Result` its four writers answer
 * (ADR-0044). Until 2026-10-06 it threw
 * (docs/defects/fixed/the-credential-lock-throws-when-a-lock-file-cannot-be-removed.md).
 *
 * The headline names whose lock it is, since only one of the three is a process that is no longer running. A lock of
 * this instance's own that the account cannot remove refuses every credential update until it is removed, which the
 * headline says. A refused removal is answered at once and never retried within the 5 s bound, a Windows sharing
 * violation from a scanner that would pass in a moment included: the requirement gives the wait to a lock a live
 * process holds, and this reading keeps a removal the account can never make from costing every update 5 s.
 */
export const lockNotReclaimed = (lockPath: string, cause: string, whose: ReclaimedHolder = 'gone'): string =>
  `Nothing was changed: the lock file ${lockPath}, ${RECLAIMED[whose]}, could not be removed. ${cause.replace(/\.?$/, '.')}` +
  (whose === 'own' ? ' Every credential update is refused until it is removed.' : '');

const remove = (path: string): void => { rmSync(path, { force: true }); };

/** The lock existed when the create was refused and was gone before its holder could be read: released, so try again. */
function releasedMeanwhile(e: Failure): boolean {
  return e.code === 'document.exclusive.read' && (e.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function readHolder(path: string): LockHolder | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockHolder>;
    return typeof raw.pid === 'number' && typeof raw.started_at === 'string' ? { pid: raw.pid, started_at: raw.started_at } : null;
  } catch {
    return null;
  }
}

/** Run `fn` while holding `lockPath`; the lock is released on every path. */
export async function withLock<T>(lockPath: string, deps: LockDeps, fn: () => Promise<Result<T, Failure>>): Promise<Result<T, Failure>> {
  const bound = deps.boundMs ?? LOCK_BOUND_MS;
  const poll = deps.pollMs ?? POLL_MS;
  const probe = deps.probe ?? probePid;
  const content = `${JSON.stringify({ pid: deps.pid, started_at: deps.startedAt } satisfies LockHolder)}\n`;
  const start = deps.monotonic.now();
  for (;;) {
    const r = exclusiveCreate(lockPath, content);
    if (!r.ok) {
      if (!releasedMeanwhile(r.error)) return err(failure('credential.lock.create', lockUnavailable(lockPath, r.error.headline), r.error.detail ?? r.error.headline, r.error.cause));
      // Waited on like a held lock, never spun: a synchronous retry loop would hold main's event loop for the bound.
      if (deps.monotonic.now() - start >= bound) return err(failure('credential.lock', LOCK_BUSY, `the lock at ${lockPath} was released and retaken for the whole bound`));
      await new Promise<void>((resolve) => { deps.timers.after(poll, () => resolve()); });
      continue;
    }
    if (r.value.minted) break;
    const holder = readHolder(lockPath);
    // A malformed record names no pid: it is reclaimed, since no live holder can be identified from it.
    const whose: ReclaimedHolder | null =
      holder === null ? 'unreadable' : holder.pid === deps.pid ? 'own' : probe(holder.pid) === 'dead' ? 'gone' : null;
    if (holder === null || whose !== null) {
      try {
        remove(lockPath);
      } catch (cause) {
        const text = cause instanceof Error ? cause.message : String(cause);
        return err(failure('credential.lock.reclaim', lockNotReclaimed(lockPath, text, whose ?? 'unreadable'), text, cause));
      }
      continue;
    }
    if (deps.monotonic.now() - start >= bound) return err(failure('credential.lock', LOCK_BUSY, `the lock at ${lockPath} is held by pid ${holder.pid}`));
    await new Promise<void>((resolve) => { deps.timers.after(poll, () => resolve()); });
  }
  try {
    return await fn();
  } finally {
    // Best effort, like the document primitive's `discard`: the operation's own result is the one reported
    // (REQ-PROVIDER-018). A lock the release could not remove keeps this process's pid, so the next operation reclaims
    // it as its own; a throw here replaced a saved credential's success with an exception until 2026-10-06.
    const now = readHolder(lockPath);
    if (now && now.pid === deps.pid) {
      try { remove(lockPath); } catch { /* left for the next operation to reclaim */ }
    }
  }
}
