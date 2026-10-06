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
    const dead = holder === null || probe(holder.pid) === 'dead' || holder.pid === deps.pid;
    if (dead) {
      rmSync(lockPath, { force: true });
      continue;
    }
    if (deps.monotonic.now() - start >= bound) return err(failure('credential.lock', LOCK_BUSY, `the lock at ${lockPath} is held by pid ${holder.pid}`));
    await new Promise<void>((resolve) => { deps.timers.after(poll, () => resolve()); });
  }
  try {
    return await fn();
  } finally {
    const now = readHolder(lockPath);
    if (now && now.pid === deps.pid) rmSync(lockPath, { force: true });
  }
}
