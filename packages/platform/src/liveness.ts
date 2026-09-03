import type { MachineId } from '@rotaris/kernel';

/**
 * REQ-SESSION-051 to REQ-SESSION-054 — the pid liveness probe, and the lock
 * liveness predicate built on it.
 *
 * The probe answers "dead" for any pid ≤ 0, never raises, and answers "alive"
 * whenever the outcome is uncertain: the two error directions are not
 * equivalent (051). POSIX: not-found proves death; permission-denied is alive
 * (052). Windows: only "no such process / invalid parameter" proves absence;
 * access denied or any other failure is alive; the probe delivers no signal
 * and no console control event (053) — libuv's signal-0 path on Windows opens
 * the process handle and reads its exit code, which is exactly that.
 */
export type Liveness = 'alive' | 'dead';

export function probePid(pid: number, platform: NodeJS.Platform = process.platform): Liveness {
  if (!Number.isInteger(pid) || pid <= 0) return 'dead';
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return 'dead';
    if (code === 'EPERM' || code === 'EACCES') return 'alive';
    if (platform === 'win32' && code === 'EINVAL') return 'dead';
    return 'alive';
  }
}

/** The three names and types REQ-SESSION-046 and REQ-GIT-020 fix. */
export interface LockRecord {
  readonly pid: number;
  readonly host: string;
  readonly acquired_at: string;
}

/**
 * REQ-SESSION-056 / REQ-SESSION-048: a lock naming another machine is live by
 * construction; a malformed lock is live (the safe direction, and the third
 * lock case — present but unreadable — names no pid or machine at all).
 */
export function isLockLive(lock: Partial<LockRecord> | null | undefined, thisMachine: MachineId, probe: (pid: number) => Liveness = probePid): boolean {
  if (!lock) return false;
  const wellFormed =
    typeof lock.pid === 'number' && Number.isInteger(lock.pid) && lock.pid > 0 &&
    typeof lock.host === 'string' && lock.host.length > 0 &&
    typeof lock.acquired_at === 'string' && lock.acquired_at.length > 0;
  if (!wellFormed) return true;
  if (lock.host !== thisMachine) return true;
  return probe(lock.pid!) === 'alive';
}

export function isLockForeign(lock: Partial<LockRecord> | null | undefined, thisMachine: MachineId): boolean {
  return !!lock && typeof lock.host === 'string' && lock.host.length > 0 && lock.host !== thisMachine;
}
