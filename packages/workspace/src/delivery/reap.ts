import type { ReqId } from '@rotaris/contracts';
import type { DeliveryTransitions } from './transition.js';
import type { DeliveryReader } from './handles.js';

/**
 * The restart reap (Part AK; REQ-TRACE-476, ADR-0041 §"Restart, under SR-2").
 *
 * SR-2 gives "a run whose process is no longer alive" exactly one meaning: a run this application's run host does
 * not own. A run row found `running` without a live owner is STALE, not foreign: it is settled here as
 * `interrupted` with its work retained — the worktree, the branch and the partial output stay on disk untouched
 * (REQ-GIT-140/142); only the row's status changes — and the requirement it belongs to, if it is still in the
 * running column, is held by the system with a `run-failure` blocker that returns to `ready` (REQ-TRACE-407 lets a
 * pass move a requirement INTO the blocked condition; REQ-TRACE-463 fixes where a run-time block returns to).
 * Nothing is reset to the first column, and nothing is reported as still running.
 *
 * The reading recorded for wave 1: at workspace open, nothing older than this instance's run host is owned, so the
 * live set handed in is empty. Part AP's run orchestration hands in the run host's actual live set when it re-runs
 * the reap after a run-host exit.
 */
export interface ReapResult {
  readonly id: ReqId;
  readonly unit: string;
  readonly sessionId: string | null;
  readonly statement: string;
  readonly held: boolean;
}

export const INTERRUPTED = 'interrupted, work retained';

export function reapStaleRuns(reader: DeliveryReader, transitions: DeliveryTransitions, live: ReadonlySet<string>, canonicalHashOf: (id: ReqId) => string | undefined): ReapResult[] {
  const out: ReapResult[] = [];
  for (const run of reader.runningRuns()) {
    if (run.sessionId !== null && live.has(run.sessionId)) continue;
    const worktree = run.worktreePath === null ? 'its worktree' : run.worktreePath;
    const detail = `${INTERRUPTED}: the process of unit ${run.unit}${run.sessionId ? ` (session ${run.sessionId})` : ''} is no longer alive; work retained in ${worktree}.`;
    const r = transitions.recordRunEnded(run.id, run.unit, 'interrupted', detail, { now: { id: run.id, canonicalHash: canonicalHashOf(run.id) ?? '', lifecycle: 'approved', isEpic: false } });
    out.push({ id: run.id, unit: run.unit, sessionId: run.sessionId, statement: detail, held: r.ok && r.value.to === 'blocked' });
  }
  return out;
}
