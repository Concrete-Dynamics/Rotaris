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
  // v4 — REQ-TOOLS-071 / REQ-TOOLS-060.
  readonly permission_mode: string | null;
  readonly sandboxed: number;
  readonly pending_approvals: string;
}
/** The run-recorded columns a save may carry (REQ-SESSION-168: aggregates copied on every persist). */
export interface SessionRunPatch {
  readonly permission_mode?: string | null;
  readonly sandboxed?: number;
  readonly pending_approvals?: string;
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
  // v4 — REQ-CHAT-046's tool-row fields; null on text rows.
  readonly tool_name: string | null;
  readonly tool_status: string | null;
  readonly call_key: string | null;
  readonly duration_ms: number | null;
  readonly started_at: string | null;
  readonly input: string | null;
  readonly output: string | null;
  readonly diff: string | null;
  readonly blocked_reason: string | null;
}
/** The tool-row fields a row may carry at append and at settle (REQ-CHAT-046). */
export interface RowToolFields {
  readonly tool_name?: string | null;
  readonly tool_status?: string | null;
  readonly call_key?: string | null;
  readonly duration_ms?: number | null;
  readonly started_at?: string | null;
  readonly input?: string | null;
  readonly output?: string | null;
  readonly diff?: string | null;
  readonly blocked_reason?: string | null;
}

/** ADR-0024: the ring kinds and REQ-SESSION-133's caps, one policy table. */
export const RING_KINDS = ['permission_audit', 'tool_calls', 'issues'] as const;
export type RingKind = (typeof RING_KINDS)[number];
export const RING_CAPS: Readonly<Record<RingKind, number>> = Object.freeze({ permission_audit: 5000, tool_calls: 5000, issues: 500 });

export interface RingState {
  readonly next_ordinal: number;
  readonly held: number;
  readonly dropped: number;
}
export interface AuditRow {
  readonly session_id: string;
  readonly ordinal: number;
  readonly recorded_at: string;
  readonly kind: 'decision' | 'mode_change';
  /** The serialised entry, verbatim — the record; the columns beside it are indexes. */
  readonly entry: string;
  readonly agent_id: string;
  readonly persona: string;
  readonly tool_name: string;
  readonly decision: string;
  readonly rule_id: string;
  readonly source: string;
}
export interface ToolCallRow {
  readonly session_id: string;
  readonly ordinal: number;
  readonly call_id: string;
  readonly agent_name: string;
  readonly tool_name: string;
  readonly status: string;
  readonly started_at: string;
  readonly elapsed_ms: number | null;
  readonly is_error: number;
  readonly entry: string;
}
/** v5 — REQ-ORCH-043 / REQ-MONITOR-022: one row per delegated child. */
export interface ChildRow {
  readonly session_id: string;
  readonly task_id: string;
  readonly canonical_name: string;
  readonly given_name: string;
  readonly persona: string;
  readonly state: string;
  readonly parent_id: string;
  readonly depth: number;
  readonly iteration: number;
  readonly launch_generation: number;
  readonly model_key: string;
  readonly category: string;
  readonly background: number;
  readonly task: string;
  readonly depends_on: string;
  readonly inherited_context: string;
  readonly granted_tools: string;
  readonly granted_mcp: string;
  readonly todo: string | null;
  readonly spawned_at: string;
  readonly completed_at: string | null;
  readonly report: string | null;
  readonly report_stored: number;
  readonly observed: number;
  readonly context_injected: number;
  readonly tool_calls: number;
}
export type ChildInsert = Omit<ChildRow, 'completed_at' | 'report' | 'report_stored' | 'observed' | 'context_injected' | 'tool_calls' | 'launch_generation' | 'todo'> & { readonly todo?: string | null };

export interface IssueRow {
  readonly session_id: string;
  readonly ordinal: number;
  readonly id: string;
  readonly recorded_at: string;
  readonly kind: string;
  readonly severity: string;
  readonly actor: string;
  readonly message: string;
  readonly evidence_ref: string;
  readonly metadata: string;
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
          permission_mode = coalesce(@permission_mode, permission_mode),
          sandboxed = coalesce(@sandboxed, sandboxed),
          pending_approvals = coalesce(@pending_approvals, pending_approvals),
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
      appendRow: db.prepare(`INSERT INTO transcript_rows
        (session_id, row_index, kind, settled, body, at, persona, name, ts, tool_name, tool_status, call_key, duration_ms, started_at, input, output, diff, blocked_reason)
        VALUES (@session_id, @row_index, @kind, @settled, @body, @at, @persona, @name, @ts, @tool_name, @tool_status, @call_key, @duration_ms, @started_at, @input, @output, @diff, @blocked_reason)`),
      // REQ-SESSION-131: the settle path can only reach a RESIDENT row; a released row has no statement that updates it.
      settleRow: db.prepare(`UPDATE transcript_rows SET body = @body, settled = 1,
        tool_status = coalesce(@tool_status, tool_status), duration_ms = coalesce(@duration_ms, duration_ms), output = coalesce(@output, output),
        diff = coalesce(@diff, diff), blocked_reason = coalesce(@blocked_reason, blocked_reason)
        WHERE session_id = @session_id AND row_index = @row_index AND page IS NULL`),
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

      // ADR-0024: the rings. Exactly these statements exist per kind — insert, delete-oldest, read — plus the one
      // settling update the tool-call record alone permits.
      ringState: db.prepare('SELECT next_ordinal, held, dropped FROM ring_state WHERE session_id = ? AND kind = ?'),
      putRingState: db.prepare('INSERT OR REPLACE INTO ring_state (session_id, kind, next_ordinal, held, dropped) VALUES (?, ?, ?, ?, ?)'),
      insertAudit: db.prepare(`INSERT INTO permission_audit (session_id, ordinal, recorded_at, kind, entry, agent_id, persona, tool_name, decision, rule_id, source)
        VALUES (@session_id, @ordinal, @recorded_at, @kind, @entry, @agent_id, @persona, @tool_name, @decision, @rule_id, @source)`),
      oldestAudit: db.prepare('DELETE FROM permission_audit WHERE session_id = ? AND ordinal = (SELECT min(ordinal) FROM permission_audit WHERE session_id = ?)'),
      auditOf: db.prepare('SELECT * FROM permission_audit WHERE session_id = ? ORDER BY ordinal'),
      insertToolCall: db.prepare(`INSERT INTO tool_calls (session_id, ordinal, call_id, agent_name, tool_name, status, started_at, elapsed_ms, is_error, entry)
        VALUES (@session_id, @ordinal, @call_id, @agent_name, @tool_name, @status, @started_at, @elapsed_ms, @is_error, @entry)`),
      settleToolCall: db.prepare('UPDATE tool_calls SET status = ?, elapsed_ms = ?, is_error = ?, entry = ? WHERE session_id = ? AND ordinal = ? AND status = \'running\''),
      oldestToolCall: db.prepare('DELETE FROM tool_calls WHERE session_id = ? AND ordinal = (SELECT min(ordinal) FROM tool_calls WHERE session_id = ?)'),
      toolCallsOf: db.prepare('SELECT * FROM tool_calls WHERE session_id = ? ORDER BY ordinal'),
      insertIssue: db.prepare(`INSERT INTO issues (session_id, ordinal, id, recorded_at, kind, severity, actor, message, evidence_ref, metadata)
        VALUES (@session_id, @ordinal, @id, @recorded_at, @kind, @severity, @actor, @message, @evidence_ref, @metadata)`),
      oldestIssue: db.prepare('DELETE FROM issues WHERE session_id = ? AND ordinal = (SELECT min(ordinal) FROM issues WHERE session_id = ?)'),
      issuesOf: db.prepare('SELECT * FROM issues WHERE session_id = ? ORDER BY ordinal'),

      // ADR-0012: the child ledger. Every statement carries session_id (REQ-ORCH-151, asserted by a test over this text).
      insertChild: db.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, category, background, task, depends_on, inherited_context, granted_tools, granted_mcp, todo, spawned_at)
        VALUES (@session_id, @task_id, @canonical_name, @given_name, @persona, @state, @parent_id, @depth, @iteration, @model_key, @category, @background, @task, @depends_on, @inherited_context, @granted_tools, @granted_mcp, @todo, @spawned_at)`),
      getChild: db.prepare('SELECT * FROM children WHERE session_id = ? AND task_id = ?'),
      childrenOf: db.prepare('SELECT * FROM children WHERE session_id = ? ORDER BY spawned_at, task_id'),
      childrenOfIteration: db.prepare('SELECT * FROM children WHERE session_id = ? AND iteration = ? ORDER BY spawned_at, task_id'),
      // The transition's one write: state and, on a terminal state, the completion timestamp (REQ-MONITOR-017).
      setChildState: db.prepare('UPDATE children SET state = ?, completed_at = coalesce(?, completed_at) WHERE session_id = ? AND task_id = ?'),
      // REQ-ORCH-049: the start claim is ONE conditional update; its affected-row count is the claim's outcome.
      claimChildStart: db.prepare("UPDATE children SET state = 'starting', launch_generation = launch_generation + 1 WHERE session_id = ? AND task_id = ? AND state = 'queued'"),
      setChildReport: db.prepare('UPDATE children SET report = ?, report_stored = 1 WHERE session_id = ? AND task_id = ?'),
      setChildObserved: db.prepare('UPDATE children SET observed = 1 WHERE session_id = ? AND task_id = ?'),
      setChildContextInjected: db.prepare('UPDATE children SET context_injected = 1 WHERE session_id = ? AND task_id = ?'),
      setChildTodo: db.prepare('UPDATE children SET todo = ?, tool_calls = ? WHERE session_id = ? AND task_id = ?'),
      enqueueSlot: db.prepare('INSERT INTO model_slot_queue (session_id, model_key, position, task_id) VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1 FROM model_slot_queue WHERE session_id = ? AND model_key = ?), ?)'),
      slotQueueOf: db.prepare('SELECT task_id FROM model_slot_queue WHERE session_id = ? AND model_key = ? ORDER BY position'),
      dequeueSlot: db.prepare('DELETE FROM model_slot_queue WHERE session_id = ? AND model_key = ? AND task_id = ?'),
    };
  }

  insertChild(row: ChildInsert): void {
    this.stmts['insertChild']!.run({ ...row, todo: row.todo ?? null });
  }
  getChild(id: SessionId, taskId: string): ChildRow | undefined {
    return this.stmts['getChild']!.get(id, taskId) as ChildRow | undefined;
  }
  childrenOf(id: SessionId): ChildRow[] {
    return this.stmts['childrenOf']!.all(id) as ChildRow[];
  }
  childrenOfIteration(id: SessionId, iteration: number): ChildRow[] {
    return this.stmts['childrenOfIteration']!.all(id, iteration) as ChildRow[];
  }
  setChildState(id: SessionId, taskId: string, state: string, completedAt: string | null): boolean {
    return this.stmts['setChildState']!.run(state, completedAt, id, taskId).changes === 1;
  }
  /** True when THIS pass won the claim; zero rows is a losing claim, an observation the caller records (REQ-ORCH-049). */
  claimChildStart(id: SessionId, taskId: string): boolean {
    return this.stmts['claimChildStart']!.run(id, taskId).changes === 1;
  }
  setChildReport(id: SessionId, taskId: string, report: string): void {
    this.stmts['setChildReport']!.run(report, id, taskId);
  }
  setChildObserved(id: SessionId, taskId: string): void {
    this.stmts['setChildObserved']!.run(id, taskId);
  }
  setChildContextInjected(id: SessionId, taskId: string): void {
    this.stmts['setChildContextInjected']!.run(id, taskId);
  }
  setChildTodo(id: SessionId, taskId: string, todo: string | null, toolCalls: number): void {
    this.stmts['setChildTodo']!.run(todo, toolCalls, id, taskId);
  }
  enqueueSlot(id: SessionId, modelKey: string, taskId: string): void {
    this.stmts['enqueueSlot']!.run(id, modelKey, id, modelKey, taskId);
  }
  slotQueueOf(id: SessionId, modelKey: string): string[] {
    return (this.stmts['slotQueueOf']!.all(id, modelKey) as { task_id: string }[]).map((r) => r.task_id);
  }
  dequeueSlot(id: SessionId, modelKey: string, taskId: string): boolean {
    return this.stmts['dequeueSlot']!.run(id, modelKey, taskId).changes === 1;
  }

  /**
   * ADR-0024 / REQ-SESSION-133: ONE ring implementation. Inside the caller's transaction: assign the next ordinal
   * (never reset, never reused), run the insert, displace the oldest when the cap is exceeded, and move the
   * counts — all in the same durable operation, so a reader never sees more than the cap or a partial trim.
   */
  ringInsert(kind: RingKind, id: SessionId, insert: (ordinal: number) => void): { ordinal: number; displaced: boolean } {
    const state = this.ringState(id, kind);
    const ordinal = state.next_ordinal;
    insert(ordinal);
    let held = state.held + 1;
    let dropped = state.dropped;
    let displaced = false;
    if (held > RING_CAPS[kind]) {
      const stmt = kind === 'permission_audit' ? 'oldestAudit' : kind === 'tool_calls' ? 'oldestToolCall' : 'oldestIssue';
      const n = this.stmts[stmt]!.run(id, id).changes;
      held -= n;
      dropped += n;
      displaced = n > 0;
    }
    this.stmts['putRingState']!.run(id, kind, ordinal + 1, held, dropped);
    return { ordinal, displaced };
  }
  ringState(id: SessionId, kind: RingKind): RingState {
    return (this.stmts['ringState']!.get(id, kind) as RingState | undefined) ?? { next_ordinal: 1, held: 0, dropped: 0 };
  }
  insertAudit(row: Omit<AuditRow, 'session_id'> & { readonly session_id: SessionId }): void {
    this.stmts['insertAudit']!.run(row);
  }
  auditOf(id: SessionId): AuditRow[] {
    return this.stmts['auditOf']!.all(id) as AuditRow[];
  }
  insertToolCall(row: Omit<ToolCallRow, 'session_id'> & { readonly session_id: SessionId }): void {
    this.stmts['insertToolCall']!.run(row);
  }
  /** False when the row is not `running` — the trigger refuses a second settle; this reports it without raising. */
  settleToolCall(id: SessionId, ordinal: number, status: string, elapsedMs: number | null, isError: boolean, entry: string): boolean {
    return this.stmts['settleToolCall']!.run(status, elapsedMs, isError ? 1 : 0, entry, id, ordinal).changes === 1;
  }
  toolCallsOf(id: SessionId): ToolCallRow[] {
    return this.stmts['toolCallsOf']!.all(id) as ToolCallRow[];
  }
  insertIssue(row: Omit<IssueRow, 'session_id'> & { readonly session_id: SessionId }): void {
    this.stmts['insertIssue']!.run(row);
  }
  issuesOf(id: SessionId): IssueRow[] {
    return this.stmts['issuesOf']!.all(id) as IssueRow[];
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
      permission_mode: patch.permission_mode ?? null, sandboxed: patch.sandboxed ?? null, pending_approvals: patch.pending_approvals ?? null,
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

  appendRow(id: SessionId, index: number, kind: string, settled: boolean, body: string, at = '', extra: { persona?: string | null; name?: string | null; ts?: string } & RowToolFields = {}): void {
    this.stmts['appendRow']!.run({
      session_id: id, row_index: index, kind, settled: settled ? 1 : 0, body, at, persona: extra.persona ?? null, name: extra.name ?? null, ts: extra.ts ?? '',
      tool_name: extra.tool_name ?? null, tool_status: extra.tool_status ?? null, call_key: extra.call_key ?? null, duration_ms: extra.duration_ms ?? null,
      started_at: extra.started_at ?? null, input: extra.input ?? null, output: extra.output ?? null, diff: extra.diff ?? null, blocked_reason: extra.blocked_reason ?? null,
    });
  }
  /** False when the row is not resident — which REQ-SESSION-131 makes a refusal, not a repair. */
  settleRow(id: SessionId, index: number, body: string, tool: RowToolFields = {}): boolean {
    return this.stmts['settleRow']!.run({
      body, session_id: id, row_index: index,
      tool_status: tool.tool_status ?? null, duration_ms: tool.duration_ms ?? null, output: tool.output ?? null, diff: tool.diff ?? null, blocked_reason: tool.blocked_reason ?? null,
    }).changes === 1;
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
