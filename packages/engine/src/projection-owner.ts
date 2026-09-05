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

/** The event kinds after which the whole-session record differs from the one last published (the agents, their tools). */
const RECORD_CHANGING_EVENTS: ReadonlySet<string> = new Set(['child.spawn', 'child.transition', 'tool.start', 'tool.finish']);
/** Well inside REQ-MONITOR-038's 250 ms visibility budget, and one read for a burst of tool events. */
const RECORD_TICK = millis(80);

export class ProjectionOwner {
  private readonly rows = new Map<number, TranscriptRow>();
  private lowestHeld = Number.POSITIVE_INFINITY;
  private pendingGrowth: { handle: TimerHandle; fromIndex: number } | null = null;
  /** A record publication owed to a child or tool event, coalesced (REQ-SHELL-076's spirit; one read per interval, not one per event). */
  private pendingRecord: TimerHandle | null = null;
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
    if (c.kind === 'save') { this.publishSnapshot(); return; }
    // Part R found the twenty-eighth defect here: the record was published on a SAVE only, because when this owner was built
    // (2026-09-03) the run's status saves were the only thing that changed it. From Part B on the ledger changes it too —
    // a child spawned, claimed or settled, a tool started or finished — with no save, so every agent surface showed a
    // child's state up to one sampling period (10 s) late, and never saw a tool as active. A commit that changed the
    // record publishes it (ADR-0043's note); the rows are untouched by it (REQ-MONITOR-216).
    if (c.kind === 'event' && (c.events ?? []).some((e) => RECORD_CHANGING_EVENTS.has(e.event.event))) this.scheduleRecord();
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

  /** One record publication per RECORD_TICK for a burst of child and tool events; a save in between publishes at once and clears it. */
  private scheduleRecord(): void {
    if (this.pendingRecord) return;
    this.pendingRecord = this.deps.timers.after(RECORD_TICK, () => { this.pendingRecord = null; this.publishSnapshot(); });
  }

  private publishSnapshot(): void {
    if (this.pendingRecord) { this.pendingRecord.cancel(); this.pendingRecord = null; }
    const session = this.deps.readSession();
    const seq = this.deps.seq.stamp(this.deps.sessionId);
    this.counters.snapshots += 1;
    this.deps.publisher.snapshot({ v: CONTRACT_SCHEMA_VERSION, sessionId: this.deps.sessionId, seq, session });
  }
}
