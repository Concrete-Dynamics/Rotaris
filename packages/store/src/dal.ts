import type { Statement } from 'better-sqlite3';
import type { MachineId, SessionId } from '@rotaris/kernel';
import type { LockRecord } from '@rotaris/platform';
import type { StoreHandle } from './open.js';
import { RELEASE_PAGE_SIZE } from './schema.js';

/**
 * The one thin, statement-shaped data-access module (ADR-0058): every SQL
 * string in the product lives here, every statement is prepared once and
 * retained by the owner (consequence 16), and nothing above this module
 * knows the engine. That is what keeps the engine a one-module swap.
 *
 * The session writer (ADR-0008) and the event history (ADR-0009) extend this
 * module rather than bypassing it. Two rules are enforced HERE rather than
 * trusted to callers: no statement exists that updates a released transcript
 * row (REQ-SESSION-131), and no statement exists that resets the dropped-event
 * count (REQ-EVENTS-094).
 */
export interface SessionRow {
  readonly session_id: string;
  readonly schema_version: number;
  readonly execution_status: string;
  readonly workspace_root: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly history_open: number;
  readonly truncated: number;
  readonly dropped_count: number;
  readonly trim_cap: number | null;
  readonly last_trim_at: string | null;
  // v3 — what a run records on its session (REQ-ORCH-147, REQ-SESSION-095, REQ-SESSION-168, REQ-SESSION-074).
  readonly stop_reason: string | null;
  readonly iterations_completed: number;
  readonly run_started_at: string | null;
  readonly tokens_input: number;
  readonly tokens_output: number;
  /** Decimal string (ADR-0031). */
  readonly cost: string;
  readonly tool_calls: number;
  readonly compressions: number;
  readonly summary_status: string | null;
  readonly summary_severity: string | null;
  readonly summary_text: string | null;
  readonly todo: string | null;
  readonly progress: string | null;
}
/** The run-recorded columns a save may carry (REQ-SESSION-168: aggregates copied on every persist). */
export interface SessionRunPatch {
  readonly stop_reason?: string | null;
  readonly iterations_completed?: number;
  readonly run_started_at?: string | null;
  readonly tokens_input?: number;
  readonly tokens_output?: number;
  readonly cost?: string;
  readonly tool_calls?: number;
  readonly compressions?: number;
  readonly summary_status?: string | null;
  readonly summary_severity?: string | null;
  readonly summary_text?: string | null;
  readonly todo?: string | null;
  readonly progress?: string | null;
}
export interface LockRow extends LockRecord {
  readonly session_id: string;
}
export interface TranscriptRowRecord {
  readonly session_id: string;
  readonly row_index: number;
  readonly kind: string;
  readonly settled: number;
  readonly body: string;
  readonly page: number | null;
  readonly at: string;
  readonly persona: string | null;
  readonly name: string | null;
  /** Local wall-clock HH:MM:SS at append (REQ-SESSION-121). */
  readonly ts: string;
}
export interface LaunchAuditRow {
  readonly session_id: string;
  readonly recorded_at: string;
  readonly payload: string;
}
export interface TimelineRow {
  readonly session_id: string;
  readonly ordinal: number;
  readonly at: string;
  readonly name: string;
  readonly actor: string;
  readonly message: string;
  readonly metadata: string;
}
export interface EventRow {
  readonly session_id: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly at: string;
  readonly schema_version: number;
  readonly iteration: number | null;
  /** The wire line, verbatim (REQ-EVENTS-080). */
  readonly payload: string;
}

export class StoreDal {
  private readonly stmts: Record<string, Statement>;

  constructor(readonly db: StoreHandle) {
    this.stmts = {
      listSessions: db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC'),
      getSession: db.prepare('SELECT * FROM sessions WHERE session_id = ?'),
      upsertSession: db.prepare(`
        INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at)
        VALUES (@session_id, @execution_status, @workspace_root, @created_at, @updated_at)
        ON CONFLICT(session_id) DO UPDATE SET execution_status = excluded.execution_status, updated_at = excluded.updated_at`),
      touchSession: db.prepare('UPDATE sessions SET execution_status = ?, updated_at = ? WHERE session_id = ?'),
      openHistory: db.prepare('UPDATE sessions SET history_open = 1 WHERE session_id = ?'),
      // REQ-SESSION-168: a save copies the aggregates; COALESCE keeps a column the patch did not name.
      updateSessionRun: db.prepare(`
        UPDATE sessions SET
          stop_reason = coalesce(@stop_reason, stop_reason),
          iterations_completed = coalesce(@iterations_completed, iterations_completed),
          run_started_at = coalesce(@run_started_at, run_started_at),
          tokens_input = coalesce(@tokens_input, tokens_input),
          tokens_output = coalesce(@tokens_output, tokens_output),
          cost = coalesce(@cost, cost),
          tool_calls = coalesce(@tool_calls, tool_calls),
          compressions = coalesce(@compressions, compressions),
          summary_status = coalesce(@summary_status, summary_status),
          summary_severity = coalesce(@summary_severity, summary_severity),
          summary_text = coalesce(@summary_text, summary_text),
          todo = coalesce(@todo, todo),
          progress = coalesce(@progress, progress)
        WHERE session_id = @session_id`),
      // REQ-SESSION-138: a plain INSERT — the one-shot is the primary key, not a check a caller could skip.
      insertLaunchAudit: db.prepare('INSERT INTO launch_audits (session_id, recorded_at, payload) VALUES (?, ?, ?)'),
      getLaunchAudit: db.prepare('SELECT * FROM launch_audits WHERE session_id = ?'),
      insertTimeline: db.prepare('INSERT INTO timeline (session_id, ordinal, at, name, actor, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      maxTimelineOrdinal: db.prepare('SELECT max(ordinal) AS m FROM timeline WHERE session_id = ?'),
      timelineOf: db.prepare('SELECT * FROM timeline WHERE session_id = ? ORDER BY ordinal'),
      listLocks: db.prepare('SELECT * FROM session_locks'),
      getLock: db.prepare('SELECT * FROM session_locks WHERE session_id = ?'),
      // REQ-SESSION-046: claimed by an operation that either succeeds or reports the existing holder.
      claimLock: db.prepare('INSERT OR IGNORE INTO session_locks (session_id, pid, host, acquired_at) VALUES (?, ?, ?, ?)'),
      releaseLock: db.prepare('DELETE FROM session_locks WHERE session_id = ? AND pid = ? AND host = ?'),
      deleteLocksNotOnHost: db.prepare('DELETE FROM session_locks WHERE host IS NOT ?'),

      countRows: db.prepare('SELECT count(*) AS c FROM transcript_rows WHERE session_id = ?'),
      countResident: db.prepare('SELECT count(*) AS c FROM transcript_rows WHERE session_id = ? AND page IS NULL'),
      maxRowIndex: db.prepare('SELECT max(row_index) AS m FROM transcript_rows WHERE session_id = ?'),
      maxPage: db.prepare('SELECT max(page) AS m FROM transcript_rows WHERE session_id = ?'),
      appendRow: db.prepare('INSERT INTO transcript_rows (session_id, row_index, kind, settled, body, at, persona, name, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      // REQ-SESSION-131: the settle path can only reach a RESIDENT row; a released row has no statement that updates it.
      settleRow: db.prepare('UPDATE transcript_rows SET body = ?, settled = 1 WHERE session_id = ? AND row_index = ? AND page IS NULL'),
      // REQ-SESSION-192: release the oldest resident rows as one whole page, index untouched.
      releaseOldest: db.prepare(`
        UPDATE transcript_rows SET page = ? WHERE rowid IN (
          SELECT rowid FROM transcript_rows WHERE session_id = ? AND page IS NULL ORDER BY row_index LIMIT ${RELEASE_PAGE_SIZE})`),
      residentRows: db.prepare('SELECT * FROM transcript_rows WHERE session_id = ? AND page IS NULL ORDER BY row_index'),
      rowsBefore: db.prepare('SELECT * FROM transcript_rows WHERE session_id = ? AND row_index < ? ORDER BY row_index DESC LIMIT ?'),
      minRowIndex: db.prepare('SELECT min(row_index) AS m FROM transcript_rows WHERE session_id = ?'),

      insertEvent: db.prepare('INSERT INTO events (session_id, ordinal, kind, at, schema_version, iteration, payload) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      maxOrdinal: db.prepare('SELECT max(ordinal) AS m FROM events WHERE session_id = ?'),
      countEvents: db.prepare('SELECT count(*) AS c FROM events WHERE session_id = ?'),
      // REQ-EVENTS-091: keep the newest `cap`, counted from the history's CURRENT contents.
      trimEvents: db.prepare('DELETE FROM events WHERE session_id = ? AND ordinal <= (SELECT max(ordinal) - ? FROM events WHERE session_id = ?)'),
      // REQ-EVENTS-092/094: four facts; the count only ever rises.
      recordTrim: db.prepare('UPDATE sessions SET truncated = 1, dropped_count = dropped_count + ?, trim_cap = ?, last_trim_at = ? WHERE session_id = ?'),
      eventsFrom: db.prepare('SELECT * FROM events WHERE session_id = ? AND ordinal >= ? ORDER BY ordinal LIMIT ?'),
      eventsOfKind: db.prepare('SELECT * FROM events WHERE session_id = ? AND kind = ? ORDER BY ordinal'),
      // REQ-EVENTS-126: count and span without decoding a single event.
      eventSummary: db.prepare('SELECT count(*) AS c, min(at) AS first, max(at) AS last FROM events WHERE session_id = ?'),

      countAllRows: db.prepare('SELECT count(*) AS c FROM transcript_rows'),
      countAllSessions: db.prepare('SELECT count(*) AS c FROM sessions'),
    };
  }

  /** One transaction as the unit of work (ADR-0008). Runs `fn` inside BEGIN IMMEDIATE; commits on return, rolls back on throw. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate();
  }

  /**
   * ADR-0058: ordinary commits run at the weaker durability setting; the two writes the
   * record forces to the stronger one — a terminal-status save and an explicit flush —
   * come through here. The setting is restored whatever `fn` does.
   */
  durableTransaction<T>(fn: () => T): T {
    this.db.pragma('synchronous = FULL');
    try {
      return this.transaction(fn);
    } finally {
      this.db.pragma('synchronous = NORMAL');
    }
  }

  listSessions(): SessionRow[] {
    return this.stmts['listSessions']!.all() as SessionRow[];
  }
  getSession(id: SessionId): SessionRow | undefined {
    return this.stmts['getSession']!.get(id) as SessionRow | undefined;
  }
  upsertSession(row: Pick<SessionRow, 'session_id' | 'execution_status' | 'workspace_root' | 'created_at' | 'updated_at'>): void {
    this.stmts['upsertSession']!.run(row);
  }
  touchSession(id: SessionId, status: string, updatedAt: string): void {
    this.stmts['touchSession']!.run(status, updatedAt, id);
  }
  /** REQ-EVENTS-087: the history is brought into existence as open and empty; no placeholder row of any kind. */
  openHistory(id: SessionId): void {
    this.stmts['openHistory']!.run(id);
  }
  /** REQ-SESSION-168: the run's columns, inside the save's transaction. Unnamed columns are kept. */
  updateSessionRun(id: SessionId, patch: SessionRunPatch): void {
    this.stmts['updateSessionRun']!.run({
      session_id: id,
      stop_reason: patch.stop_reason ?? null, iterations_completed: patch.iterations_completed ?? null, run_started_at: patch.run_started_at ?? null,
      tokens_input: patch.tokens_input ?? null, tokens_output: patch.tokens_output ?? null, cost: patch.cost ?? null,
      tool_calls: patch.tool_calls ?? null, compressions: patch.compressions ?? null,
      summary_status: patch.summary_status ?? null, summary_severity: patch.summary_severity ?? null, summary_text: patch.summary_text ?? null,
      todo: patch.todo ?? null, progress: patch.progress ?? null,
    });
  }
  /** REQ-SESSION-138: false when the audit already exists — the statement refuses, the caller does not check first. */
  insertLaunchAudit(id: SessionId, recordedAt: string, payload: string): boolean {
    try {
      this.stmts['insertLaunchAudit']!.run(id, recordedAt, payload);
      return true;
    } catch (e) {
      if (String((e as { code?: string }).code).startsWith('SQLITE_CONSTRAINT')) return false;
      throw e;
    }
  }
  getLaunchAudit(id: SessionId): LaunchAuditRow | undefined {
    return this.stmts['getLaunchAudit']!.get(id) as LaunchAuditRow | undefined;
  }
  insertTimeline(id: SessionId, ordinal: number, at: string, name: string, actor: string, message: string, metadata: string): void {
    this.stmts['insertTimeline']!.run(id, ordinal, at, name, actor, message, metadata);
  }
  nextTimelineOrdinal(id: SessionId): number {
    const m = (this.stmts['maxTimelineOrdinal']!.get(id) as { m: number | null }).m;
    return m === null ? 1 : m + 1;
  }
  timelineOf(id: SessionId): TimelineRow[] {
    return this.stmts['timelineOf']!.all(id) as TimelineRow[];
  }

  listLocks(): LockRow[] {
    return this.stmts['listLocks']!.all() as LockRow[];
  }
  getLock(id: SessionId): LockRow | undefined {
    return this.stmts['getLock']!.get(id) as LockRow | undefined;
  }
  /** Returns the holder if the claim did not succeed. */
  claimLock(id: SessionId, pid: number, host: MachineId, acquiredAt: string): { claimed: true } | { claimed: false; holder: LockRow } {
    const r = this.stmts['claimLock']!.run(id, pid, host, acquiredAt);
    if (r.changes === 1) return { claimed: true };
    return { claimed: false, holder: this.getLock(id)! };
  }
  releaseLock(id: SessionId, pid: number, host: MachineId): boolean {
    return this.stmts['releaseLock']!.run(id, pid, host).changes === 1;
  }
  /** ADR-0005 consequence 11: foreign-host lock rows are dropped on the way IN from a backup artifact. */
  deleteLocksNotOnHost(host: MachineId): number {
    return this.stmts['deleteLocksNotOnHost']!.run(host).changes;
  }

  appendRow(id: SessionId, index: number, kind: string, settled: boolean, body: string, at = '', extra: { persona?: string | null; name?: string | null; ts?: string } = {}): void {
    this.stmts['appendRow']!.run(id, index, kind, settled ? 1 : 0, body, at, extra.persona ?? null, extra.name ?? null, extra.ts ?? '');
  }
  /** False when the row is not resident — which REQ-SESSION-131 makes a refusal, not a repair. */
  settleRow(id: SessionId, index: number, body: string): boolean {
    return this.stmts['settleRow']!.run(body, id, index).changes === 1;
  }
  /** Release the oldest whole page of resident rows into `page`. Returns how many rows moved. */
  releaseOldestPage(id: SessionId, page: number): number {
    return this.stmts['releaseOldest']!.run(page, id).changes;
  }
  nextPageNumber(id: SessionId): number {
    const m = (this.stmts['maxPage']!.get(id) as { m: number | null }).m;
    return m === null ? 1 : m + 1;
  }
  rowCount(id: SessionId): number {
    return (this.stmts['countRows']!.get(id) as { c: number }).c;
  }
  residentCount(id: SessionId): number {
    return (this.stmts['countResident']!.get(id) as { c: number }).c;
  }
  /** The next index to assign: contiguous from 0 (REQ-EVENTS-052), across resident and released rows alike. */
  nextRowIndex(id: SessionId): number {
    const m = (this.stmts['maxRowIndex']!.get(id) as { m: number | null }).m;
    return m === null ? 0 : m + 1;
  }
  residentRows(id: SessionId): TranscriptRowRecord[] {
    return this.stmts['residentRows']!.all(id) as TranscriptRowRecord[];
  }
  /** Up to `limit` rows older than `beforeIndex`, newest first; the caller reverses. Served from any page (REQ-SESSION-192). */
  rowsBefore(id: SessionId, beforeIndex: number, limit: number): TranscriptRowRecord[] {
    return this.stmts['rowsBefore']!.all(id, beforeIndex, limit) as TranscriptRowRecord[];
  }
  oldestRowIndex(id: SessionId): number | null {
    return (this.stmts['minRowIndex']!.get(id) as { m: number | null }).m;
  }

  insertEvent(id: SessionId, ordinal: number, kind: string, at: string, schemaVersion: number, iteration: number | null, line: string): void {
    this.stmts['insertEvent']!.run(id, ordinal, kind, at, schemaVersion, iteration, line);
  }
  nextOrdinal(id: SessionId): number {
    const m = (this.stmts['maxOrdinal']!.get(id) as { m: number | null }).m;
    return m === null ? 1 : m + 1;
  }
  eventCount(id: SessionId): number {
    return (this.stmts['countEvents']!.get(id) as { c: number }).c;
  }
  /** Keep the newest `cap` events; returns how many were dropped. */
  trimEvents(id: SessionId, cap: number): number {
    return this.stmts['trimEvents']!.run(id, cap, id).changes;
  }
  recordTrim(id: SessionId, dropped: number, cap: number | null, at: string): void {
    this.stmts['recordTrim']!.run(dropped, cap, at, id);
  }
  eventsFrom(id: SessionId, fromOrdinal: number, limit: number): EventRow[] {
    return this.stmts['eventsFrom']!.all(id, fromOrdinal, limit) as EventRow[];
  }
  eventsOfKind(id: SessionId, kind: string): EventRow[] {
    return this.stmts['eventsOfKind']!.all(id, kind) as EventRow[];
  }
  eventSummary(id: SessionId): { count: number; first: string | null; last: string | null } {
    const r = this.stmts['eventSummary']!.get(id) as { c: number; first: string | null; last: string | null };
    return { count: r.c, first: r.first, last: r.last };
  }

  totals(): { sessions: number; rows: number } {
    return {
      sessions: (this.stmts['countAllSessions']!.get() as { c: number }).c,
      rows: (this.stmts['countAllRows']!.get() as { c: number }).c,
    };
  }
}
