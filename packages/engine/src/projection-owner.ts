import { millis, type Millis, type SessionId, type TimerHandle, type Timers } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, type SessionRecord, type SessionSnapshot, type TranscriptIncrement, type TranscriptRow } from '@rotaris/contracts';
import { RESIDENT_ROW_CAP } from '@rotaris/store';
import type { SequenceCounters } from './sequence.js';
import type { Committed } from './session-writer.js';

/**
 * ADR-0043 — the projection owner: one per live session, in the run host,
 * next to the writer that feeds it. It holds the resident transcript rows in
 * memory beside the writer's copy (bounded by REQ-SESSION-192), owns the
 * session's sequence counter, and is the SOLE publisher for the session.
 *
 * - A row's first appearance or settled form is published immediately after
 *   its commit (REQ-MONITOR-218, REQ-MONITOR-221): `onCommitted` is the
 *   writer's post-commit hand-off.
 * - Growth of a row a view already holds is coalesced into a trailing 50 ms
 *   tick (REQ-MONITOR-219) that reads current state when it fires
 *   (REQ-MONITOR-220); it is the one publication with no durable anchor
 *   (ADR-0010's carve-out) and is never committed per tick.
 * - Every attach begins with a whole-session update and then the resident
 *   transcript from the lowest index held (REQ-MONITOR-214, REQ-SESSION-161).
 *   A reconcile is the same two publications.
 * - Stamping and publishing are one synchronous step; the number is taken
 *   AFTER the commit, so none is burned on a change that did not commit.
 */
export interface Publisher {
  increment(p: TranscriptIncrement): void;
  snapshot(p: SessionSnapshot): void;
}

export interface ProjectionOwnerDeps {
  readonly sessionId: SessionId;
  readonly seq: SequenceCounters;
  readonly timers: Timers;
  readonly publisher: Publisher;
  /** The whole-session read (REQ-MONITOR-216): bounded collections in full, unbounded ones omitted. */
  readonly readSession: () => SessionRecord;
  /** The resident window at attach time, for a session whose rows were recorded before any owner existed. */
  readonly readResident: () => readonly TranscriptRow[];
}

export const GROWTH_TICK: Millis = millis(50);

export class ProjectionOwner {
  private readonly rows = new Map<number, TranscriptRow>();
  private lowestHeld = Number.POSITIVE_INFINITY;
  private pendingGrowth: { handle: TimerHandle; fromIndex: number } | null = null;
  readonly counters = { increments: 0, snapshots: 0, growthTicks: 0 };

  constructor(private readonly deps: ProjectionOwnerDeps) {
    for (const r of deps.readResident()) this.hold(r);
  }

  get sessionId(): SessionId {
    return this.deps.sessionId;
  }
  get residentRows(): readonly TranscriptRow[] {
    return [...this.rows.values()].sort((a, b) => a.index - b.index);
  }
  get lowestIndexHeld(): number {
    return this.rows.size === 0 ? 0 : this.lowestHeld;
  }

  /** The writer's post-commit hand-off. */
  onCommitted(c: Committed): void {
    if (c.released) {
      for (let i = c.released.fromIndex; i <= c.released.toIndex; i++) this.rows.delete(i);
      this.lowestHeld = c.released.toIndex + 1;
    }
    if (c.kind === 'row' && c.row) {
      this.hold(c.row);
      // A pending growth tick for this or a later row is superseded by the committed publication.
      if (this.pendingGrowth && this.pendingGrowth.fromIndex >= c.row.index) this.cancelGrowth();
      this.publishIncrement(c.row.index, [c.row]);
      return;
    }
    if (c.kind === 'save') this.publishSnapshot();
  }

  /** Intra-row growth: in memory only, coalesced (REQ-MONITOR-219/220). */
  grow(index: number, body: string): void {
    const held = this.rows.get(index);
    if (!held || held.settled) return;
    this.rows.set(index, { ...held, body });
    if (this.pendingGrowth) {
      if (index < this.pendingGrowth.fromIndex) this.pendingGrowth.fromIndex = index;
      return;
    }
    const handle = this.deps.timers.after(GROWTH_TICK, () => {
      const from = this.pendingGrowth?.fromIndex ?? index;
      this.pendingGrowth = null;
      this.counters.growthTicks += 1;
      this.publishIncrement(from, this.residentRows.filter((r) => r.index >= from));
    });
    this.pendingGrowth = { handle, fromIndex: index };
  }

  /** REQ-MONITOR-220: at run end, pending publications are flushed. */
  flushPending(): void {
    if (!this.pendingGrowth) return;
    const from = this.pendingGrowth.fromIndex;
    this.cancelGrowth();
    this.publishIncrement(from, this.residentRows.filter((r) => r.index >= from));
  }

  /** A surface begins: whole-session update, then the resident transcript (REQ-MONITOR-214, REQ-SESSION-161). */
  attach(): void {
    this.publishSnapshot();
    this.publishIncrement(this.lowestIndexHeld, this.residentRows);
  }

  /** REQ-MONITOR-226: the same two publications, on request. The snapshot carries the number the surface resumes from. */
  reconcile(): void {
    this.attach();
  }

  private hold(r: TranscriptRow): void {
    this.rows.set(r.index, r);
    if (r.index < this.lowestHeld) this.lowestHeld = r.index;
    if (this.rows.size > RESIDENT_ROW_CAP) {
      // Defensive only: the writer releases before the append (REQ-SESSION-192), so this does not fire in practice.
      this.rows.delete(this.lowestHeld);
      this.lowestHeld = Math.min(...this.rows.keys());
    }
  }

  private cancelGrowth(): void {
    this.pendingGrowth?.handle.cancel();
    this.pendingGrowth = null;
  }

  private publishIncrement(earliestChanged: number, rows: readonly TranscriptRow[]): void {
    const seq = this.deps.seq.stamp(this.deps.sessionId);
    this.counters.increments += 1;
    this.deps.publisher.increment({ v: CONTRACT_SCHEMA_VERSION, sessionId: this.deps.sessionId, seq, earliestChanged, rows: [...rows], diffs: [], personas: [] });
  }

  private publishSnapshot(): void {
    const session = this.deps.readSession();
    const seq = this.deps.seq.stamp(this.deps.sessionId);
    this.counters.snapshots += 1;
    this.deps.publisher.snapshot({ v: CONTRACT_SCHEMA_VERSION, sessionId: this.deps.sessionId, seq, session });
  }
}
