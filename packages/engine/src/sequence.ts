import type { SessionId } from '@rotaris/kernel';

/**
 * REQ-MONITOR-214 — one counter per session, shared by both update channels,
 * starting at 1 and raised by exactly one per publication. Owned by the
 * projection owner in the run host (ADR-0043); stamped at publication, after
 * the persist-before-publish anchor, so a number is never burned on a change
 * that did not commit. Stamping and publishing are one indivisible step.
 */
export class SequenceCounters {
  private next = new Map<SessionId, number>();

  /** Take the next number for `id`. The caller publishes in the same synchronous step. */
  stamp(id: SessionId): number {
    const n = this.next.get(id) ?? 1;
    this.next.set(id, n + 1);
    return n;
  }

  /** What the next publication will bear — for the reconcile response (ADR-0043 #6). */
  peek(id: SessionId): number {
    return this.next.get(id) ?? 1;
  }

  forget(id: SessionId): void {
    this.next.delete(id);
  }
}
