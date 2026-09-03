import { err, ok, toIsoUtc, type MachineId, type Result, type SessionId, type WallClock } from '@rotaris/kernel';
import { RELEASE_PAGE_SIZE, RESIDENT_ROW_CAP, type StoreDal, type TranscriptRowRecord } from '@rotaris/store';
import type { TranscriptRow } from '@rotaris/contracts';
import { EVENT_SCHEMA_VERSION, serializeEvent, type EventKind, type WireEvent } from './events.js';

/**
 * ADR-0008 — one ordered session writer per session, owning the session's
 * transactions. Lives in the run host, owned by the run that holds the
 * session's lock row (ADR-0005).
 *
 * Every unit of work is ONE transaction and the transaction is the durable
 * anchor: the transcript row and its `transcript.row` event commit together
 * (REQ-EVENTS-072, REQ-EVENTS-029), the resident-window release happens in
 * the same transaction BEFORE the append that would exceed it
 * (REQ-SESSION-192), and the session's `updated_at` moves with them
 * (REQ-SESSION-028). Publication follows the commit and never precedes it
 * (REQ-MONITOR-221); `onCommitted` is the hand-off to the projection owner
 * (ADR-0043: fed by the writer, never reading back what it saved).
 *
 * The store binding is synchronous, so the "queue" is call order on one
 * thread: a save is durable when `save()` returns (REQ-SESSION-067/068),
 * nothing is parked, and `flush()` is the no-op REQ-SESSION-067 describes
 * because nothing can be outstanding. Two writes take the stronger
 * durability setting: a terminal-status save and an explicit flush
 * (ADR-0058).
 *
 * REQ-EVENTS-088: a recording failure never raises. The first one marks the
 * history failed for the remainder of the run, records exactly ONE warning,
 * and every later recording returns a failure value without touching the
 * store. REQ-EVENTS-032: an event that cannot be serialised is dropped alone,
 * with a warning naming it, and the history stays open.
 *
 * Retention (ADR-0009, REQ-EVENTS-091): the trim is its OWN transaction on
 * the same queue, immediately after the append that overflowed
 * `cap + cap ÷ 8`, keeping the newest `cap`; the truncation record is inside
 * the trim's transaction (REQ-EVENTS-092). A failed trim leaves the history
 * over its cap with a warning — a bounded, visible cost — and never ends it.
 */
export type WriteFailure =
  | { readonly code: 'history-failed'; readonly reason: string }
  | { readonly code: 'not-serializable'; readonly reason: string }
  | { readonly code: 'row-not-resident'; readonly index: number }
  | { readonly code: 'row-already-settled'; readonly index: number };

export interface Committed {
  readonly kind: 'row' | 'save' | 'event';
  /** The row as recorded, when the unit of work carried one. */
  readonly row?: TranscriptRow;
  /** Rows released from the resident window in this transaction, by index range. */
  readonly released?: { readonly fromIndex: number; readonly toIndex: number };
  readonly ordinal?: number;
}

export interface SessionWriterDeps {
  readonly dal: StoreDal;
  readonly sessionId: SessionId;
  readonly wall: WallClock;
  /** REQ-CONFIG-473: 0 never trims. */
  readonly retentionCap: number;
  readonly onCommitted: (c: Committed) => void;
  readonly warn: (message: string) => void;
}

export interface OpenSessionArgs {
  readonly workspaceRoot: string;
  readonly pid: number;
  readonly host: MachineId;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'error']);

export function toTranscriptRow(r: TranscriptRowRecord): TranscriptRow {
  return { index: r.row_index, kind: r.kind, settled: r.settled === 1, body: r.body, at: r.at };
}

export class SessionWriter {
  private nextIndex: number;
  private nextOrdinal: number;
  private residentCount: number;
  private dropped: number;
  private generation = 0;
  private failedReason: string | null = null;

  constructor(private readonly deps: SessionWriterDeps) {
    const { dal, sessionId } = deps;
    // REQ-SESSION-169's rehydration in miniature: the counters are rebuilt from the store exactly once.
    this.nextIndex = dal.nextRowIndex(sessionId);
    this.nextOrdinal = dal.nextOrdinal(sessionId);
    this.residentCount = dal.residentCount(sessionId);
    this.dropped = dal.getSession(sessionId)?.dropped_count ?? 0;
  }

  get sessionId(): SessionId {
    return this.deps.sessionId;
  }
  /** REQ-EVENTS-088: sticky for the remainder of the run. */
  get failed(): string | null {
    return this.failedReason;
  }
  /** The generation of the last committed save — the checkable expression of last-requested-wins (REQ-SESSION-069). */
  get lastGeneration(): number {
    return this.generation;
  }

  /**
   * REQ-SESSION-089 / REQ-EVENTS-087 / REQ-EVENTS-035: the record is opened before the run
   * starts — session row, lock row, history open — as one transaction, and `session.start`
   * is the first event any consumer observes. The store's write probe (REQ-EVENTS-179)
   * already ran at open, exactly once, before any of this.
   */
  static create(deps: SessionWriterDeps, args: OpenSessionArgs): Result<SessionWriter, { code: 'lock-held'; holder: { pid: number; host: string } } | { code: 'store'; reason: string }> {
    const { dal, sessionId, wall } = deps;
    const now = toIsoUtc(wall.instant());
    try {
      const outcome = dal.transaction(() => {
        dal.upsertSession({ session_id: sessionId, execution_status: 'idle', workspace_root: args.workspaceRoot, created_at: now, updated_at: now });
        const lock = dal.claimLock(sessionId, args.pid, args.host, now);
        if (!lock.claimed) return lock;
        dal.openHistory(sessionId);
        return lock;
      });
      if (!outcome.claimed) return err({ code: 'lock-held', holder: { pid: outcome.holder.pid, host: outcome.holder.host } });
    } catch (cause) {
      return err({ code: 'store', reason: String(cause) });
    }
    const w = new SessionWriter(deps);
    // REQ-SESSION-089: published immediately after the record is opened. Its own transaction (no paired durable record).
    w.recordEvent('session.start', { workspace_root: args.workspaceRoot, sandbox: false, permission_mode: 'default' });
    return ok(w);
  }

  /** REQ-EVENTS-052 first appearance (or the only event, when the row arrives settled). One transaction. */
  appendRow(kind: string, body: string, settled: boolean): Result<TranscriptRow, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const index = this.nextIndex;
    const row: TranscriptRow = { index, kind, settled, body, at };
    const ev = this.envelope('transcript.row', at, { index, row });
    const line = serializeEvent(ev);
    if (!line.ok) {
      // REQ-EVENTS-032: the row is recorded, its event alone is dropped, and every later event lands.
      this.deps.warn(`event transcript.row for row ${index} could not be serialised and was not recorded: ${line.error.reason}`);
    }
    let released: Committed['released'];
    try {
      dal.transaction(() => {
        // REQ-SESSION-192: release BEFORE the append that would exceed the cap, in the same transaction.
        if (this.residentCount + 1 > RESIDENT_ROW_CAP) {
          const page = dal.nextPageNumber(sessionId);
          const oldest = dal.residentRows(sessionId)[0]!.row_index;
          const moved = dal.releaseOldestPage(sessionId, page);
          this.residentCount -= moved;
          released = { fromIndex: oldest, toIndex: oldest + moved - 1 };
        }
        dal.appendRow(sessionId, index, kind, settled, body, at);
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'transcript.row', at, EVENT_SCHEMA_VERSION, null, line.value);
        dal.touchSession(sessionId, 'idle', at);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    this.nextIndex += 1;
    this.residentCount += 1;
    const ordinal = line.ok ? this.nextOrdinal++ : undefined;
    const c: Committed = released ? { kind: 'row', row, released, ...(ordinal === undefined ? {} : { ordinal }) } : { kind: 'row', row, ...(ordinal === undefined ? {} : { ordinal }) };
    this.deps.onCommitted(c);
    this.trimIfOverflowed(at);
    return ok(row);
  }

  /** REQ-EVENTS-052 settled form: the second and last event for an index. One transaction. */
  settleRow(index: number, body: string): Result<TranscriptRow, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const current = dal.residentRows(sessionId).find((r) => r.row_index === index);
    if (!current) return err({ code: 'row-not-resident', index });
    if (current.settled === 1) return err({ code: 'row-already-settled', index });
    const row: TranscriptRow = { index, kind: current.kind, settled: true, body, at: current.at };
    const line = serializeEvent(this.envelope('transcript.row', at, { index, row }));
    if (!line.ok) this.deps.warn(`event transcript.row (settled) for row ${index} could not be serialised and was not recorded: ${line.error.reason}`);
    try {
      dal.transaction(() => {
        if (!dal.settleRow(sessionId, index, body)) throw new Error(`row ${index} is not resident`);
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'transcript.row', at, EVENT_SCHEMA_VERSION, null, line.value);
        dal.touchSession(sessionId, 'idle', at);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    const ordinal = line.ok ? this.nextOrdinal++ : undefined;
    this.deps.onCommitted({ kind: 'row', row, ...(ordinal === undefined ? {} : { ordinal }) });
    this.trimIfOverflowed(at);
    return ok(row);
  }

  /** An event with no paired durable record: its own transaction (ADR-0009 "Append"). */
  recordEvent(kind: EventKind, payload: Record<string, unknown>): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const line = serializeEvent(this.envelope(kind, at, payload));
    if (!line.ok) {
      this.deps.warn(`event ${kind} could not be serialised and was not recorded: ${line.error.reason}`);
      return err({ code: 'not-serializable', reason: line.error.reason });
    }
    const ordinal = this.nextOrdinal;
    try {
      dal.transaction(() => {
        dal.insertEvent(sessionId, ordinal, kind, at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    this.nextOrdinal += 1;
    this.deps.onCommitted({ kind: 'event', ordinal });
    this.trimIfOverflowed(at);
    return ok(ordinal);
  }

  /**
   * REQ-SESSION-067/068: durable when it returns; captures the state at the instant of the
   * call (here: the status). REQ-SESSION-070: a terminal status takes the stronger setting,
   * so "readable by any other reader before the call returns" is literal.
   */
  save(status: string): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const generation = this.generation + 1;
    const run = () => dal.touchSession(sessionId, status, at);
    try {
      if (TERMINAL.has(status)) dal.durableTransaction(run);
      else dal.transaction(run);
    } catch (cause) {
      return this.fail(cause);
    }
    this.generation = generation;
    this.deps.onCommitted({ kind: 'save' });
    return ok(generation);
  }

  /** REQ-SESSION-067: a no-op where nothing is outstanding — and with synchronous commits nothing ever is. */
  flush(): void {
    /* every requested save has already returned durable */
  }

  release(pid: number, host: MachineId): void {
    this.deps.dal.releaseLock(this.deps.sessionId, pid, host);
  }

  private envelope(event: EventKind, timestamp: string, payload: Record<string, unknown>): WireEvent {
    return { ...payload, event, session_id: this.deps.sessionId, timestamp, schema_version: EVENT_SCHEMA_VERSION };
  }

  private fail(cause: unknown): Result<never, WriteFailure> {
    const reason = String(cause);
    if (!this.failedReason) {
      this.failedReason = reason;
      // REQ-EVENTS-088: exactly one warning for the run.
      this.deps.warn(`the session's history is incomplete from this point: a recording step failed (${reason})`);
    }
    return err({ code: 'history-failed', reason });
  }

  /** REQ-EVENTS-091: after the append that overflowed the headroom, before any further event. Its own transaction. */
  private trimIfOverflowed(at: string): void {
    const cap = this.deps.retentionCap;
    if (cap <= 0) return;
    const headroom = cap + Math.floor(cap / 8);
    const { dal, sessionId } = this.deps;
    const held = this.nextOrdinal - 1 - this.dropped;
    if (held <= headroom) return;
    try {
      const dropped = dal.transaction(() => {
        const n = dal.trimEvents(sessionId, cap);
        if (n > 0) dal.recordTrim(sessionId, n, cap, at);
        return n;
      });
      this.dropped += dropped;
    } catch (cause) {
      // The previous contents stay in force; the history sits above its cap behind this warning.
      this.deps.warn(`the event history could not be trimmed and exceeds its cap of ${cap}: ${String(cause)}`);
    }
  }

  /** REQ-EVENTS-094: cumulative over the session's life, never reset. */
  get droppedCount(): number {
    return this.dropped;
  }
}

export { RESIDENT_ROW_CAP, RELEASE_PAGE_SIZE };
