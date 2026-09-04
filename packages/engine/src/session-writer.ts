import { randomBytes } from 'node:crypto';
import { err, maskArguments, ok, redactRowString, toIsoUtc, type Instant, type MachineId, type Result, type SessionId, type WallClock } from '@rotaris/kernel';
import { RELEASE_PAGE_SIZE, RESIDENT_ROW_CAP, type ChildInsert, type ChildRow, type RowToolFields, type SessionRunPatch, type StoreDal, type TranscriptRowRecord } from '@rotaris/store';
import { isLegalChildMove, isTerminalChildState, type ChildState, type SettlingPath, type TranscriptRow } from '@rotaris/contracts';
import { EVENT_SCHEMA_VERSION, locator, serializeEvent, type EventKind, type WireEvent } from './events.js';
import { isActiveStatus } from './run/stop-conditions.js';

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
  /** The events this commit recorded, in ordinal order, as the wire lines the bus forwards (REQ-SESSION-147). */
  readonly events?: readonly CommittedEvent[];
}
export interface CommittedEvent {
  readonly ordinal: number;
  readonly event: WireEvent;
  readonly line: string;
}
export interface RowExtra {
  readonly persona?: string;
  readonly name?: string;
  /** REQ-CHAT-046: the tool-row fields, in the row's own (wire) spelling. */
  readonly toolName?: string;
  readonly toolStatus?: string;
  readonly callKey?: string;
  readonly durationMs?: number;
  readonly startedAt?: string;
  readonly input?: string;
  readonly output?: string;
  readonly diff?: string;
  readonly blockedReason?: string;
}
/** What a settle may add to a tool row (REQ-CHAT-060: the outcome, the duration, the output, a blocked reason). */
export interface RowSettle {
  readonly toolStatus?: string;
  readonly durationMs?: number;
  readonly output?: string;
  readonly diff?: string;
  readonly blockedReason?: string;
}

function toolColumns(x: RowExtra | RowSettle): RowToolFields {
  const e = x as RowExtra;
  return {
    ...(e.toolName === undefined ? {} : { tool_name: e.toolName }), ...(e.toolStatus === undefined ? {} : { tool_status: e.toolStatus }),
    ...(e.callKey === undefined ? {} : { call_key: e.callKey }), ...(e.durationMs === undefined ? {} : { duration_ms: e.durationMs }),
    ...(e.startedAt === undefined ? {} : { started_at: e.startedAt }), ...(e.input === undefined ? {} : { input: e.input }),
    ...(e.output === undefined ? {} : { output: e.output }), ...(e.diff === undefined ? {} : { diff: e.diff }),
    ...(e.blockedReason === undefined ? {} : { blocked_reason: e.blockedReason }),
  };
}

/** REQ-EVENTS-059/063: every string inside `row` on the wire is masked THEN clipped; the record keeps the full row. */
export function maskRow(row: TranscriptRow): TranscriptRow {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'string' ? redactRowString(v) : v;
  return out as TranscriptRow;
}

/** REQ-SESSION-135: 12 lowercase hex characters. */
export function issueId(): string {
  return randomBytes(6).toString('hex');
}

/** REQ-TOOLS-079: a decision entry; `id` is the ordinal the ring assigns (ADR-0024). */
export interface DecisionEntry {
  readonly timestamp: string;
  readonly session_id: string;
  readonly agent_id: string;
  readonly persona: string;
  readonly tool_name: string;
  readonly decision: string;
  readonly rule_id: string;
  readonly source: string;
  readonly summary: string;
  readonly reason: string;
  readonly request_id?: string;
}
/** REQ-TOOLS-082: a mode-change entry; `skipped_personas` always present. */
export interface ModeChangeEntry {
  readonly timestamp: string;
  readonly event: 'permission_mode_change';
  readonly session_id: string;
  readonly agent_id: string;
  readonly requested_mode: string;
  readonly effective_mode: string;
  readonly previous_mode: string;
  readonly source: string;
  readonly reason: string;
  readonly skipped_personas: readonly string[];
}
/** REQ-SESSION-136: what is known at start; the rest at settle. */
export interface ToolCallOpen {
  readonly call_id: string;
  readonly agent_name: string;
  readonly tool_name: string;
  readonly args: Readonly<Record<string, unknown>>;
}
export interface ToolCallSettle {
  readonly status: 'ok' | 'failed' | 'blocked';
  readonly elapsed_ms: number;
  readonly is_error: boolean;
  readonly result: string;
  readonly error?: string | null;
  readonly outcome_kind?: string;
  readonly exit_code?: number | null;
  readonly failure_kind?: string | null;
  readonly warnings?: readonly string[];
}
export interface IssueInput {
  readonly kind: string;
  readonly severity: 'debug' | 'info' | 'warning' | 'error';
  readonly actor: string;
  readonly message: string;
  readonly evidence_ref?: string;
  readonly metadata?: Record<string, unknown>;
}

const DECISION_FIELDS: ReadonlySet<string> = new Set(['id', 'timestamp', 'session_id', 'agent_id', 'persona', 'tool_name', 'decision', 'rule_id', 'source', 'summary', 'reason', 'request_id']);
const MODE_CHANGE_FIELDS: ReadonlySet<string> = new Set(['timestamp', 'event', 'session_id', 'agent_id', 'requested_mode', 'effective_mode', 'previous_mode', 'source', 'reason', 'skipped_personas']);
/** REQ-SESSION-094's terminal transaction, as one unit. */
export interface EndRunArgs {
  readonly status: string;
  readonly patch: SessionRunPatch;
  /** `session.end` then `result`, in that order (REQ-EVENTS-076). */
  readonly events: readonly { readonly kind: EventKind; readonly payload: Record<string, unknown> }[];
  /** REQ-SESSION-093's system row, recorded before the terminal pair. */
  readonly systemRow?: string;
  readonly pid: number;
  readonly host: MachineId;
}

/** REQ-SESSION-121: local wall-clock HH:MM:SS. */
export function localHms(i: Instant): string {
  const d = new Date(i);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
  /** REQ-SESSION-090: what session.start carries. */
  readonly task?: string;
  readonly persona?: string;
  readonly maxIterations?: number;
  /** REQ-TOOLS-181 / REQ-TOOLS-071: the effective preset and the sandbox verdict. */
  readonly permissionMode?: string;
  readonly sandboxed?: boolean;
}

export interface OpenExistingSessionArgs {
  readonly pid: number;
  readonly host: MachineId;
  /** Resolve uncertainty toward alive before it reaches this port. */
  readonly isProcessAlive: (pid: number) => boolean;
}

export type SessionOpenError =
  | { readonly code: 'no-session'; readonly sessionId: string }
  | { readonly code: 'lock-held'; readonly holder: { readonly pid: number; readonly host: string; readonly acquiredAt: string } }
  | { readonly code: 'store'; readonly reason: string };

/** REQ-SESSION-070's "terminal": a status outside REQ-SESSION-055's active six and not the initial `idle`. */
function isTerminalStatus(status: string): boolean {
  return status !== 'idle' && !isActiveStatus(status);
}

export function toTranscriptRow(r: TranscriptRowRecord): TranscriptRow {
  const row: TranscriptRow = { index: r.row_index, kind: r.kind, settled: r.settled === 1, body: r.body, at: r.at, ts: r.ts };
  return {
    ...row, ...(r.persona === null ? {} : { persona: r.persona }), ...(r.name === null ? {} : { name: r.name }),
    ...(r.tool_name === null ? {} : { toolName: r.tool_name }), ...(r.tool_status === null ? {} : { toolStatus: r.tool_status }),
    ...(r.call_key === null ? {} : { callKey: r.call_key }), ...(r.duration_ms === null ? {} : { durationMs: r.duration_ms }),
    ...(r.started_at === null ? {} : { startedAt: r.started_at }), ...(r.input === null ? {} : { input: r.input }),
    ...(r.output === null ? {} : { output: r.output }), ...(r.diff === null ? {} : { diff: r.diff }),
    ...(r.blocked_reason === null ? {} : { blockedReason: r.blocked_reason }),
  };
}

export class SessionWriter {
  private nextIndex: number;
  private nextOrdinal: number;
  private residentCount: number;
  private dropped: number;
  private generation = 0;
  private failedReason: string | null = null;
  /** The status the row carries; a row append touches `updated_at` without changing it. */
  private status: string;

  constructor(private readonly deps: SessionWriterDeps) {
    const { dal, sessionId } = deps;
    // REQ-SESSION-169's rehydration in miniature: the counters are rebuilt from the store exactly once.
    this.nextIndex = dal.nextRowIndex(sessionId);
    this.nextOrdinal = dal.nextOrdinal(sessionId);
    this.residentCount = dal.residentCount(sessionId);
    const s = dal.getSession(sessionId);
    this.dropped = s?.dropped_count ?? 0;
    this.status = s?.execution_status ?? 'idle';
  }

  get currentStatus(): string {
    return this.status;
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
    // REQ-SESSION-089 / REQ-SESSION-090: published immediately after the record is opened, carrying enough
    // to describe the run without opening the record. Its own transaction (no paired durable record).
    w.recordEvent('session.start', {
      task: args.task ?? '', workspace: args.workspaceRoot, persona: args.persona ?? 'orchestrator',
      permission_mode: args.permissionMode ?? 'ask', sandboxed: args.sandboxed ?? false, max_iterations: args.maxIterations ?? null,
    });
    return ok(w);
  }

  /** REQ-SESSION-047/083/112: claim an existing session, with one local-dead-pid reap. */
  static open(deps: SessionWriterDeps, args: OpenExistingSessionArgs): Result<SessionWriter, SessionOpenError> {
    const { dal, sessionId, wall } = deps;
    if (!dal.getSession(sessionId)) return err({ code: 'no-session', sessionId });
    const now = toIsoUtc(wall.instant());
    try {
      let claimed = dal.claimLock(sessionId, args.pid, args.host, now);
      if (!claimed.claimed) {
        const holder = claimed.holder;
        const locallyReapable = holder.host === args.host && Number.isInteger(holder.pid) && holder.pid > 0 && !args.isProcessAlive(holder.pid);
        if (locallyReapable) {
          dal.releaseLock(sessionId, holder.pid, args.host);
          claimed = dal.claimLock(sessionId, args.pid, args.host, now);
        }
      }
      if (!claimed.claimed) return err({ code: 'lock-held', holder: { pid: claimed.holder.pid, host: claimed.holder.host, acquiredAt: claimed.holder.acquired_at } });
      return ok(new SessionWriter(deps));
    } catch (cause) {
      return err({ code: 'store', reason: String(cause) });
    }
  }

  /** REQ-EVENTS-052 first appearance (or the only event, when the row arrives settled). One transaction. */
  appendRow(kind: string, body: string, settled: boolean, extra: RowExtra = {}): Result<TranscriptRow, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const now = wall.instant();
    const at = toIsoUtc(now);
    const ts = localHms(now);
    const index = this.nextIndex;
    const { persona, name, ...tool } = extra;
    const definedTool = Object.fromEntries(Object.entries(tool).filter(([, v]) => v !== undefined));
    const row: TranscriptRow = { index, kind, settled, body, at, ts, ...(persona === undefined ? {} : { persona }), ...(name === undefined ? {} : { name }), ...definedTool };
    const ev = this.envelope('transcript.row', at, { index, row: maskRow(row) });
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
        dal.appendRow(sessionId, index, kind, settled, body, at, { persona: extra.persona ?? null, name: extra.name ?? null, ts, ...toolColumns(extra) });
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'transcript.row', at, EVENT_SCHEMA_VERSION, null, line.value);
        dal.touchSession(sessionId, this.status, at);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    this.nextIndex += 1;
    this.residentCount += 1;
    const ordinal = line.ok ? this.nextOrdinal++ : undefined;
    const events = ordinal === undefined || !line.ok ? [] : [{ ordinal, event: ev, line: line.value }];
    const c: Committed = released ? { kind: 'row', row, released, events, ...(ordinal === undefined ? {} : { ordinal }) } : { kind: 'row', row, events, ...(ordinal === undefined ? {} : { ordinal }) };
    this.deps.onCommitted(c);
    this.trimIfOverflowed(at);
    return ok(row);
  }

  /** REQ-EVENTS-052 settled form: the second and last event for an index. One transaction. */
  settleRow(index: number, body: string, settle: RowSettle = {}): Result<TranscriptRow, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const current = dal.residentRows(sessionId).find((r) => r.row_index === index);
    if (!current) return err({ code: 'row-not-resident', index });
    if (current.settled === 1) return err({ code: 'row-already-settled', index });
    const definedSettle = Object.fromEntries(Object.entries(settle).filter(([, v]) => v !== undefined));
    const row: TranscriptRow = { ...toTranscriptRow(current), ...definedSettle, settled: true, body };
    const ev = this.envelope('transcript.row', at, { index, row: maskRow(row) });
    const line = serializeEvent(ev);
    if (!line.ok) this.deps.warn(`event transcript.row (settled) for row ${index} could not be serialised and was not recorded: ${line.error.reason}`);
    try {
      dal.transaction(() => {
        if (!dal.settleRow(sessionId, index, body, toolColumns(settle))) throw new Error(`row ${index} is not resident`);
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'transcript.row', at, EVENT_SCHEMA_VERSION, null, line.value);
        dal.touchSession(sessionId, this.status, at);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    const ordinal = line.ok ? this.nextOrdinal++ : undefined;
    const events = ordinal === undefined || !line.ok ? [] : [{ ordinal, event: ev, line: line.value }];
    this.deps.onCommitted({ kind: 'row', row, events, ...(ordinal === undefined ? {} : { ordinal }) });
    this.trimIfOverflowed(at);
    return ok(row);
  }

  /** An event with no paired durable record: its own transaction (ADR-0009 "Append"). `iteration` fills the derived column. */
  recordEvent(kind: EventKind, payload: Record<string, unknown>, iteration: number | null = null): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const ev = this.envelope(kind, at, iteration === null ? payload : { ...payload, iteration });
    const line = serializeEvent(ev);
    if (!line.ok) {
      this.deps.warn(`event ${kind} could not be serialised and was not recorded: ${line.error.reason}`);
      return err({ code: 'not-serializable', reason: line.error.reason });
    }
    const ordinal = this.nextOrdinal;
    try {
      dal.transaction(() => {
        dal.insertEvent(sessionId, ordinal, kind, at, EVENT_SCHEMA_VERSION, iteration, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    this.nextOrdinal += 1;
    this.deps.onCommitted({ kind: 'event', ordinal, events: [{ ordinal, event: ev, line: line.value }] });
    this.trimIfOverflowed(at);
    return ok(ordinal);
  }

  /**
   * REQ-SESSION-138: exactly once per session, by run start-up. The statement refuses a second;
   * this writer reports it as `false` rather than trusting call sites. Its own transaction.
   */
  recordLaunchAudit(payload: Record<string, unknown>): Result<boolean, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    try {
      return ok(dal.transaction(() => dal.insertLaunchAudit(sessionId, at, JSON.stringify(payload))));
    } catch (cause) {
      return this.fail(cause);
    }
  }

  /** REQ-ORCH-139 / REQ-SESSION-087: a timeline entry, ordinal assigned here (ADR-0008 "Emission order"). Own transaction. */
  appendTimeline(name: string, actor: string, message: string, metadata: Record<string, unknown>): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    try {
      return ok(dal.transaction(() => {
        const ordinal = dal.nextTimelineOrdinal(sessionId);
        dal.insertTimeline(sessionId, ordinal, at, name, actor, message, JSON.stringify(metadata));
        return ordinal;
      }));
    } catch (cause) {
      return this.fail(cause);
    }
  }

  /**
   * REQ-SESSION-067/068: durable when it returns; captures the state at the instant of the
   * call (the status and, REQ-SESSION-168, the aggregates the patch carries). REQ-SESSION-070:
   * a terminal status takes the stronger setting, so "readable by any other reader before the
   * call returns" is literal.
   */
  save(status: string, patch: SessionRunPatch = {}): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const generation = this.generation + 1;
    const run = () => {
      dal.touchSession(sessionId, status, at);
      dal.updateSessionRun(sessionId, patch);
    };
    try {
      if (isTerminalStatus(status)) dal.durableTransaction(run);
      else dal.transaction(run);
    } catch (cause) {
      return this.fail(cause);
    }
    this.status = status;
    this.generation = generation;
    this.deps.onCommitted({ kind: 'save' });
    return ok(generation);
  }

  /**
   * REQ-SESSION-094's terminal unit, ONE durable transaction in the requirement's order: the
   * system row of REQ-SESSION-093; the lock release; `session.end` then `result`
   * (REQ-EVENTS-076); the terminal status with its patch. The writer holds the lock at the
   * instant it records the pair and holds nothing when the commit is visible, which is the
   * reading that satisfies REQ-EVENTS-098 and REQ-SESSION-094 together (recorded on ADR-0008).
   * The commit hand-off carries the row, the events and the save, in that order.
   */
  endRun(args: EndRunArgs): Result<{ ordinals: number[] }, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const now = wall.instant();
    const at = toIsoUtc(now);
    const ts = localHms(now);
    const rowIndex = this.nextIndex;
    const row: TranscriptRow | undefined = args.systemRow === undefined ? undefined : { index: rowIndex, kind: 'system', settled: true, body: args.systemRow, at, ts };
    const rowEv = row ? this.envelope('transcript.row', at, { index: rowIndex, row }) : undefined;
    const rowLine = rowEv ? serializeEvent(rowEv) : undefined;
    const lines = args.events.map((e) => ({ kind: e.kind, ev: this.envelope(e.kind, at, e.payload) })).map((x) => ({ ...x, line: serializeEvent(x.ev) }));
    for (const l of lines) if (!l.line.ok) this.deps.warn(`event ${l.kind} could not be serialised and was not recorded: ${l.line.error.reason}`);
    const committed: CommittedEvent[] = [];
    const generation = this.generation + 1;
    try {
      dal.durableTransaction(() => {
        let ordinal = this.nextOrdinal;
        if (row) {
          dal.appendRow(sessionId, rowIndex, 'system', true, row.body, at, { ts });
          if (rowLine?.ok && rowEv) { dal.insertEvent(sessionId, ordinal, 'transcript.row', at, EVENT_SCHEMA_VERSION, null, rowLine.value); committed.push({ ordinal, event: rowEv, line: rowLine.value }); ordinal += 1; }
        }
        dal.releaseLock(sessionId, args.pid, args.host);
        for (const l of lines) {
          if (!l.line.ok) continue;
          dal.insertEvent(sessionId, ordinal, l.kind, at, EVENT_SCHEMA_VERSION, null, l.line.value);
          committed.push({ ordinal, event: l.ev, line: l.line.value });
          ordinal += 1;
        }
        dal.touchSession(sessionId, args.status, at);
        dal.updateSessionRun(sessionId, args.patch);
      });
    } catch (cause) {
      committed.length = 0;
      return this.fail(cause);
    }
    if (row) { this.nextIndex += 1; this.residentCount += 1; }
    this.nextOrdinal += committed.length;
    this.status = args.status;
    this.generation = generation;
    const rowEvents = row ? committed.filter((c) => c.event.event === 'transcript.row') : [];
    const terminal = committed.filter((c) => c.event.event !== 'transcript.row');
    if (row) this.deps.onCommitted({ kind: 'row', row, events: rowEvents, ...(rowEvents[0] ? { ordinal: rowEvents[0].ordinal } : {}) });
    this.deps.onCommitted({ kind: 'save' });
    this.deps.onCommitted({ kind: 'event', events: terminal, ...(terminal[0] ? { ordinal: terminal[0].ordinal } : {}) });
    this.trimIfOverflowed(at);
    return ok({ ordinals: committed.map((c) => c.ordinal) });
  }

  /**
   * ADR-0024 / REQ-TOOLS-027/078/079/081/083: a decision entry into the permission audit — the serialised entry
   * verbatim with `id` = its ordinal — and its `permission.decision` event, ONE transaction (REQ-EVENTS-072).
   * The field inventory is validated on the write path: a field outside REQ-TOOLS-079's set is a fault, never a
   * passthrough (the export's redaction-safety rests on it). Returns the ordinal, which is the entry's identifier.
   */
  recordDecision(entry: DecisionEntry): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    for (const k of Object.keys(entry)) if (!DECISION_FIELDS.has(k)) return err({ code: 'not-serializable', reason: `audit entry carries a field outside REQ-TOOLS-079's inventory: ${k}` });
    const ev = this.envelope('permission.decision', at, { request_id: entry.request_id ?? '', tool_name: entry.tool_name, decision: entry.decision, source: entry.source, rule_id: entry.rule_id, summary: entry.summary });
    const line = serializeEvent(ev);
    if (!line.ok) this.deps.warn(`event permission.decision could not be serialised and was not recorded: ${line.error.reason}`);
    let ordinal = 0;
    try {
      dal.transaction(() => {
        const r = dal.ringInsert('permission_audit', sessionId, (o) => {
          const stored = { id: o, ...entry, ...(entry.request_id === undefined ? {} : { request_id: entry.request_id }) };
          dal.insertAudit({ session_id: sessionId, ordinal: o, recorded_at: at, kind: 'decision', entry: JSON.stringify(sortKeys(stored)), agent_id: entry.agent_id, persona: entry.persona, tool_name: entry.tool_name, decision: entry.decision, rule_id: entry.rule_id, source: entry.source });
        });
        ordinal = r.ordinal;
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'permission.decision', at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (line.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    this.trimIfOverflowed(at);
    return ok(ordinal);
  }

  /** REQ-TOOLS-082: a mode-change entry in the same series, interleaved in write order; no identifier is owed to it. */
  recordModeChange(entry: ModeChangeEntry): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    for (const k of Object.keys(entry)) if (!MODE_CHANGE_FIELDS.has(k)) return err({ code: 'not-serializable', reason: `mode-change entry carries a field outside REQ-TOOLS-082's shape: ${k}` });
    try {
      return ok(dal.transaction(() => dal.ringInsert('permission_audit', sessionId, (o) => {
        dal.insertAudit({ session_id: sessionId, ordinal: o, recorded_at: at, kind: 'mode_change', entry: JSON.stringify(sortKeys(entry)), agent_id: entry.agent_id, persona: '', tool_name: '', decision: '', rule_id: '', source: entry.source });
      }).ordinal));
    } catch (cause) {
      return this.fail(cause);
    }
  }

  /**
   * REQ-SESSION-136 / REQ-EVENTS-072: the tool-call record is written at `tool.start` as `running`, with the
   * arguments unredacted, and the masked `tool.start` event in the same transaction (the reading on ADR-0024).
   */
  openToolCall(open: ToolCallOpen): Result<number, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const ev = this.envelope('tool.start', at, { tool_name: open.tool_name, call_id: open.call_id, arguments: maskArguments(open.args) });
    const line = serializeEvent(ev);
    if (!line.ok) this.deps.warn(`event tool.start could not be serialised and was not recorded: ${line.error.reason}`);
    let ordinal = 0;
    try {
      dal.transaction(() => {
        const r = dal.ringInsert('tool_calls', sessionId, (o) => {
          const entry = { timestamp: at, agent_name: open.agent_name, tool_name: open.tool_name, call_id: open.call_id, status: 'running', elapsed_ms: null, is_error: false, args: open.args };
          dal.insertToolCall({ session_id: sessionId, ordinal: o, call_id: open.call_id, agent_name: open.agent_name, tool_name: open.tool_name, status: 'running', started_at: at, elapsed_ms: null, is_error: 0, entry: JSON.stringify(sortKeys(entry)) });
        });
        ordinal = r.ordinal;
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'tool.start', at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (line.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    this.trimIfOverflowed(at);
    return ok(ordinal);
  }

  /** The one settling update, with `tool.finish` in the same transaction; on error args/result are cut to 2000 (REQ-SESSION-136). */
  settleToolCall(ordinal: number, open: ToolCallOpen, settle: ToolCallSettle): Result<boolean, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const cut = (s: string) => (settle.is_error && s.length > 2000 ? s.slice(0, 2000) : s);
    const entry: Record<string, unknown> = {
      timestamp: at, agent_name: open.agent_name, tool_name: open.tool_name, call_id: open.call_id, status: settle.status, elapsed_ms: settle.elapsed_ms, is_error: settle.is_error,
      // REQ-SESSION-136: on error the args and the result are cut to 2000 characters; an object that fits stays an object.
      args: settle.is_error && JSON.stringify(open.args).length > 2000 ? cut(JSON.stringify(open.args)) : open.args, result: cut(settle.result),
      ...(settle.outcome_kind === undefined ? {} : { outcome_kind: settle.outcome_kind }), ...(settle.exit_code === undefined ? {} : { exit_code: settle.exit_code }),
      ...(settle.failure_kind === undefined ? {} : { failure_kind: settle.failure_kind }), ...(settle.warnings === undefined ? {} : { warnings: settle.warnings }),
    };
    const ev = this.envelope('tool.finish', at, { tool_name: open.tool_name, call_id: open.call_id, status: settle.status, duration_ms: settle.elapsed_ms, error: settle.error ?? null });
    const line = serializeEvent(ev);
    if (!line.ok) this.deps.warn(`event tool.finish could not be serialised and was not recorded: ${line.error.reason}`);
    let settled = false;
    try {
      dal.transaction(() => {
        settled = dal.settleToolCall(sessionId, ordinal, settle.status, settle.elapsed_ms, settle.is_error, JSON.stringify(sortKeys(entry)));
        if (settled && line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'tool.finish', at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (settled && line.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    this.trimIfOverflowed(at);
    return ok(settled);
  }

  /**
   * REQ-SESSION-135: an issue with its `issue` timeline entry in one transaction; only an error-severity issue
   * additionally publishes an `error` event, `fatal: false`, whose `detail` is the issue's locator (REQ-EVENTS-072).
   */
  recordIssue(input: IssueInput): Result<string, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const id = issueId();
    const ref = input.evidence_ref ?? '';
    const ev = input.severity === 'error' ? this.envelope('error', at, { message: input.message, error_class: input.kind, detail: locator('issues', id), fatal: false }) : null;
    const line = ev ? serializeEvent(ev) : null;
    if (line && !line.ok) this.deps.warn(`event error could not be serialised and was not recorded: ${line.error.reason}`);
    try {
      dal.transaction(() => {
        dal.ringInsert('issues', sessionId, (o) => {
          dal.insertIssue({ session_id: sessionId, ordinal: o, id, recorded_at: at, kind: input.kind, severity: input.severity, actor: input.actor, message: input.message, evidence_ref: ref, metadata: JSON.stringify(input.metadata ?? {}) });
        });
        dal.insertTimeline(sessionId, dal.nextTimelineOrdinal(sessionId), at, 'issue', input.actor, input.message, JSON.stringify({ issue_id: id, kind: input.kind, severity: input.severity, evidence_ref: ref }));
        if (ev && line?.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'error', at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (ev && line?.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    this.trimIfOverflowed(at);
    return ok(id);
  }

  /**
   * ADR-0012: the child row and its `child.spawn` in ONE transaction (REQ-EVENTS-077: announced exactly once,
   * ahead of every other event naming the child).
   */
  spawnChild(row: Omit<ChildInsert, 'session_id' | 'spawned_at'>): Result<ChildRow, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const ev = this.envelope('child.spawn', at, { child_id: row.task_id, agent_name: row.canonical_name, task: row.task });
    const line = serializeEvent(ev);
    if (!line.ok) this.deps.warn(`event child.spawn could not be serialised and was not recorded: ${line.error.reason}`);
    try {
      dal.transaction(() => {
        dal.insertChild({ ...row, session_id: sessionId, spawned_at: at });
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'child.spawn', at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (line.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    this.trimIfOverflowed(at);
    return ok(dal.getChild(sessionId, row.task_id)!);
  }

  /**
   * ADR-0012: the SOLE implementation of REQ-MONITOR-300's moves. Validates against the table (or a settling
   * path), stamps the completion timestamp on a terminal state, writes the row and `child.transition` in ONE
   * transaction — a refused move commits nothing and names both states (REQ-MONITOR-016), and there is no
   * interval in which the row has moved but its event has not.
   */
  transitionChild(taskId: string, to: ChildState, via: SettlingPath | null = null): Result<ChildRow, WriteFailure | { code: 'illegal-move'; from: string; to: string; reason: string }> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const current = dal.getChild(sessionId, taskId);
    if (!current) return err({ code: 'illegal-move', from: '(none)', to, reason: `child ${taskId} does not exist in session ${sessionId}` });
    const from = current.state as ChildState;
    if (!isLegalChildMove(from, to, via)) {
      return err({ code: 'illegal-move', from, to, reason: `child ${taskId} is in state '${from}' and cannot move to '${to}'${via ? ` by ${via}` : ''} (REQ-MONITOR-300)` });
    }
    const at = toIsoUtc(wall.instant());
    const completedAt = isTerminalChildState(to) ? at : null;
    const ev = this.envelope('child.transition', at, { child_id: taskId, from_state: from, to_state: to });
    const line = serializeEvent(ev);
    if (!line.ok) this.deps.warn(`event child.transition could not be serialised and was not recorded: ${line.error.reason}`);
    try {
      dal.transaction(() => {
        dal.setChildState(sessionId, taskId, to, completedAt);
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'child.transition', at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (line.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    this.trimIfOverflowed(at);
    return ok(dal.getChild(sessionId, taskId)!);
  }

  /**
   * REQ-ORCH-049: the start claim — one conditional update `queued → starting`; a losing claim (zero rows)
   * is recorded IN THE SAME TRANSACTION as a `child_launch_suppressed` timeline entry and a
   * `stale_child_launch_claim` issue, so a suppressed race can never go unrecorded. The winning claim also
   * carries its `child.transition` and a `child_start` timeline entry.
   */
  claimChildStart(taskId: string, canonicalName: string): Result<boolean, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const current = dal.getChild(sessionId, taskId);
    const from = current?.state ?? '(none)';
    const ev = this.envelope('child.transition', at, { child_id: taskId, from_state: 'queued', to_state: 'starting' });
    const line = serializeEvent(ev);
    let won = false;
    let issueRef = '';
    try {
      dal.transaction(() => {
        won = dal.claimChildStart(sessionId, taskId);
        if (won) {
          if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'child.transition', at, EVENT_SCHEMA_VERSION, null, line.value);
          dal.insertTimeline(sessionId, dal.nextTimelineOrdinal(sessionId), at, 'child_start', 'rotaris', `Child ${canonicalName} (${taskId}) started.`, JSON.stringify({ task_id: taskId, canonical_name: canonicalName }));
        } else {
          const id = issueId();
          dal.ringInsert('issues', sessionId, (o) => {
            dal.insertIssue({ session_id: sessionId, ordinal: o, id, recorded_at: at, kind: 'stale_child_launch_claim', severity: 'warning', actor: 'rotaris', message: `A start claim for child ${canonicalName} (${taskId}) was suppressed: the record reads '${from}', not 'queued'.`, evidence_ref: '', metadata: JSON.stringify({ task_id: taskId, canonical_name: canonicalName, state: from }) });
          });
          issueRef = id;
          dal.insertTimeline(sessionId, dal.nextTimelineOrdinal(sessionId), at, 'child_launch_suppressed', 'rotaris', `A start of child ${canonicalName} (${taskId}) was suppressed.`, JSON.stringify({ task_id: taskId, canonical_name: canonicalName, state: from, issue_id: id }));
        }
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (won && line.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    void issueRef;
    this.trimIfOverflowed(at);
    return ok(won);
  }

  /** REQ-ORCH-051/108: the report stored with the record, and `child.complete` in the same transaction. */
  storeChildReport(taskId: string, report: Record<string, unknown>): Result<void, WriteFailure> {
    if (this.failedReason) return err({ code: 'history-failed', reason: this.failedReason });
    const { dal, sessionId, wall } = this.deps;
    const at = toIsoUtc(wall.instant());
    const ev = this.envelope('child.complete', at, { child_id: taskId, report });
    const line = serializeEvent(ev);
    if (!line.ok) this.deps.warn(`event child.complete could not be serialised and was not recorded: ${line.error.reason}`);
    try {
      dal.transaction(() => {
        dal.setChildReport(sessionId, taskId, JSON.stringify(sortKeys(report)));
        if (line.ok) dal.insertEvent(sessionId, this.nextOrdinal, 'child.complete', at, EVENT_SCHEMA_VERSION, null, line.value);
      });
    } catch (cause) {
      return this.fail(cause);
    }
    if (line.ok) { const o = this.nextOrdinal++; this.deps.onCommitted({ kind: 'event', ordinal: o, events: [{ ordinal: o, event: ev, line: line.value }] }); }
    this.trimIfOverflowed(at);
    return ok(undefined);
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

/** Compact, keys sorted at every depth — the same form the wire uses, so a stored entry is byte-stable. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => [k, sortKeys(o[k])]));
  }
  return value;
}

export { RESIDENT_ROW_CAP, RELEASE_PAGE_SIZE };
