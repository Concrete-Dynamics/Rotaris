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
  // v6 — REQ-ORCH-084/087: the message limit in force and the count reached while paused at it.
  readonly message_limit: number | null;
  readonly paused_at_count: number | null;
  // v7 — REQ-MONITOR-166: the token history as the run sampled it, a JSON array of [at, total].
  readonly token_samples: string;
  // v8 — REQ-GIT-015/017: the worktree binding as JSON, or NULL for "no worktree"; REQ-SHELL-125's sandbox mode.
  readonly worktree: string | null;
  readonly sandbox_mode: string;
  // v9 — REQ-SESSION-195 / REQ-GIT-155: the checkpoint most recently restored into the session's tree; NULL = never.
  readonly last_restored_sequence: number | null;
  // v17 — REQ-ORCH-153/154: the plan cycle awaiting an answer (NULL = none) and whether approval released this run.
  readonly plan_cycle: number | null;
  readonly plan_released: number;
  // v18 — REQ-LIBRARY-002/036: immutable run classification and durable artifact association.
  readonly run_type: 'task_run' | 'improvement_run' | 'integration_run';
  readonly improvement_artifact_ids: string;
  // v21 — PD-MONITOR-001 revision 2 / REQ-MONITOR-166: the qualifier the run's cost total earned, recorded with it.
  readonly cost_qualifier: string;
}
/** v17 — REQ-ORCH-154's durable record: one row per plan cycle, the decision taken and the text that was approved. */
export interface PlanCycleRow {
  readonly session_id: string;
  readonly cycle: number;
  readonly opened_at: string;
  /** Verbatim, as the producing role wrote it (REQ-ORCH-153); never rewritten. */
  readonly plan: string;
  readonly intent: string;
  readonly todo: string;
  /** The changes the user stated when choosing revise into this cycle; '' on the first. */
  readonly changes: string;
  /** The user's own text; NULL while they have not edited (REQ-ORCH-154). */
  readonly edited: string | null;
  readonly decision: string | null;
  readonly decided_at: string | null;
}
/** v9 — REQ-GIT-016's record: one row per checkpoint, `files` the JSON list of changed paths, `kind` REQ-GIT-067's vocabulary. */
export interface CheckpointRow {
  readonly session_id: string;
  readonly sequence: number;
  readonly ref: string;
  readonly commit_id: string;
  readonly created_at: string;
  readonly iteration: number;
  readonly child_name: string;
  readonly files: string;
  readonly kind: string;
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
  readonly cost_qualifier?: string;
  readonly tool_calls?: number;
  readonly compressions?: number;
  readonly summary_status?: string | null;
  readonly summary_severity?: string | null;
  readonly summary_text?: string | null;
  readonly todo?: string | null;
  readonly progress?: string | null;
  readonly message_limit?: number | null;
  readonly token_samples?: string;
}
/** REQ-CHAT-038: one queued prompt as stored. */
export interface QueuedPromptRow {
  readonly session_id: string;
  readonly prompt_id: string;
  readonly position: number;
  readonly content: string;
  readonly status: string;
  readonly created_at: string;
  readonly triggered_at: string | null;
  /** REQ-CHAT-038 (v13, Part AB): the optional context snapshot, one JSON object as supplied; null when none was. */
  readonly context_snapshot: string | null;
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
  readonly attachments: string;
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

/**
 * v11 (Part X): the two saved-prompt lists and REQ-LIBRARY-139's caps, one policy table — the same shape
 * `RING_CAPS` above takes for REQ-SESSION-133, and for the same reason: the cap is enforced by the statements
 * here, so the figure belongs beside them. `contracts` declares the same two names for the wire (it and this
 * package cannot import each other); both cite REQ-LIBRARY-137, which is the single definition of the pair.
 * The two figures are "fixed by this document: neither is configurable, and no key of any scope changes them".
 */
export const PROMPT_LISTS = ['history', 'stash'] as const;
export type PromptList = (typeof PROMPT_LISTS)[number];
export const PROMPT_CAPS: Readonly<Record<PromptList, number>> = Object.freeze({ history: 200, stash: 100 });
/** Both lists as stored, newest first, capped, blank entries dropped (REQ-LIBRARY-139). */
export interface PromptLists {
  readonly history: readonly string[];
  readonly stash: readonly string[];
}

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
export interface ToolCallCountRow { readonly tool_name: string; readonly count: number; readonly agents: number }
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
  /** v22 — PD-ORCH-004: the task id of the child this one was delegated to continue; null for every other child. */
  readonly continuation_of: string | null;
  /** v23 — PD-ORCH-005: what left this child `paused` (`pause | stop | quit | crash`); null while it is not paused. */
  readonly interruption: string | null;
  /** v23 — PD-ORCH-005: the state a `paused` child moves back into when its iteration resumes; null while it is not paused. */
  readonly resume_state: string | null;
  /** v23 — PD-TOOLS-006 revision 2: the child's declared write scope, a JSON array of patterns; `'[]'` when it declared none. */
  readonly write_scope: string;
}
export type ChildInsert = Omit<ChildRow, 'completed_at' | 'report' | 'report_stored' | 'observed' | 'context_injected' | 'tool_calls' | 'launch_generation' | 'todo' | 'continuation_of' | 'interruption' | 'resume_state' | 'write_scope'> & { readonly todo?: string | null; readonly continuation_of?: string | null; readonly write_scope?: string };

/**
 * v23 — PD-ORCH-005 clause 1: one execution iteration and the task id of its root, open from the moment it begins until it
 * closes. A pause, a stop, a quit and a crash leave it open; that open row is what a continue resumes.
 */
export interface IterationRow {
  readonly session_id: string;
  readonly iteration: number;
  readonly root_task_id: string;
  readonly root_canonical_name: string;
  readonly root_persona: string;
  /** The todo item the iteration works on (a todo id, not a child's `bg_` task id), and the text its root was given. */
  readonly todo_task_id: string;
  readonly task: string;
  readonly state: 'open' | 'closed';
  /** REQ-ORCH-073/135's outcome at close; null while open. */
  readonly outcome: string | null;
  /** The last interruption that left it open; null for one never interrupted, and cleared when it resumes. */
  readonly interruption: string | null;
  readonly opened_at: string;
  readonly closed_at: string | null;
}
export type IterationInsert = Pick<IterationRow, 'session_id' | 'iteration' | 'root_task_id' | 'root_canonical_name' | 'root_persona' | 'todo_task_id' | 'task' | 'opened_at'>;

/**
 * v23 — PD-ORCH-005 clauses 1 and 12: one entry of an agent's recorded conversation. `message` is one message as the
 * model saw it; `replacement` is a compression, whose body is the whole conversation that replaced the one before.
 */
export interface AgentMessageRow {
  readonly session_id: string;
  readonly task_id: string;
  readonly seq: number;
  readonly iteration: number;
  readonly kind: 'message' | 'replacement';
  /** JSON: a message, or an array of messages for a replacement. */
  readonly body: string;
  readonly at: string;
}

/** v23 — PD-ORCH-005 clause 10: a background terminal session an agent started, and what became of it. */
export interface AgentTerminalRow {
  readonly session_id: string;
  readonly terminal_id: string;
  readonly task_id: string;
  readonly command: string;
  readonly started_at: string;
  /** REQ-TOOLS-109's status (`running`, `completed`, `failed`, `killed`, `timeout`), or the rest that ended it: a stop, a quit or a crash. */
  readonly state: 'running' | 'completed' | 'failed' | 'killed' | 'timeout' | 'stop' | 'quit' | 'crash';
  readonly exit_code: number | null;
  readonly output_tail: string;
  readonly updated_at: string;
}

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
  /** REQ-SESSION-134, v10: 12 lowercase hex characters, or empty for a row written before v10 (nothing is minted for it). */
  readonly id: string;
  /** REQ-SESSION-134, v10: `debug|info|warning|error`; a row that names none reads the requirement's own default, `info`. */
  readonly severity: string;
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
/**
 * v12 — REQ-LIBRARY-088's field set as stored. The list-valued fields are serialised JSON, `body_file` is the
 * name of the Markdown document beside the session's other files (REQ-SESSION-002) and never its content, and
 * `importance` is DERIVED at write time (REQ-LIBRARY-088: `high` exactly for a child report whose status is not
 * `succeeded`) so no caller can supply one.
 */
export interface ArtifactRow {
  readonly session_id: string;
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: string;
  readonly source_task_id: string | null;
  readonly canonical_name: string | null;
  readonly source_persona: string | null;
  readonly status: string;
  readonly summary: string;
  readonly key_findings: string;
  readonly highlight_paths: string;
  readonly snippets: string;
  readonly edited_files: string;
  readonly created_files: string;
  /** PD-LIBRARY-001: `[{command, exit_code}]`; `[]` on every kind but `child_report` and on rows written before v16. */
  readonly commands: string;
  readonly tags: string;
  readonly supersedes: string | null;
  readonly superseded_by: string | null;
  readonly created_by: string;
  readonly consumed_by: string;
  readonly timeline_event_id: string | null;
  readonly conversation_id: string | null;
  readonly importance: string;
  readonly created_at: string;
  readonly edited_at: string | null;
  readonly body_file: string;
}
export type ArtifactInsert = Omit<ArtifactRow, 'session_id'> & { readonly session_id: string };

export class StoreDal {
  private readonly stmts: Record<string, Statement>;

  constructor(readonly db: StoreHandle) {
    this.stmts = {
      listSessions: db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC'),
      getSession: db.prepare('SELECT * FROM sessions WHERE session_id = ?'),
      // v8: the binding and the sandbox mode are written with the row at creation (REQ-GIT-022: saved with the session record) and never moved.
      upsertSession: db.prepare(`
        INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at, worktree, sandbox_mode, run_type)
        VALUES (@session_id, @execution_status, @workspace_root, @created_at, @updated_at, @worktree, coalesce(@sandbox_mode, 'off'), coalesce(@run_type, 'task_run'))
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
          cost_qualifier = coalesce(@cost_qualifier, cost_qualifier),
          tool_calls = coalesce(@tool_calls, tool_calls),
          compressions = coalesce(@compressions, compressions),
          summary_status = coalesce(@summary_status, summary_status),
          summary_severity = coalesce(@summary_severity, summary_severity),
          summary_text = coalesce(@summary_text, summary_text),
          todo = coalesce(@todo, todo),
          progress = coalesce(@progress, progress),
          message_limit = coalesce(@message_limit, message_limit),
          token_samples = coalesce(@token_samples, token_samples)
        WHERE session_id = @session_id`),
      // REQ-ORCH-087 / REQ-SESSION-110: the pause recorded with its count; the resolution clears it in the same act that writes the status.
      setPause: db.prepare('UPDATE sessions SET execution_status = ?, paused_at_count = ?, message_limit = ?, updated_at = ? WHERE session_id = ?'),
      // REQ-ORCH-153/154 (v17): the plan cycle record, and the two session columns that hold a gate open across a restart.
      insertPlanCycle: db.prepare('INSERT INTO plan_cycles (session_id, cycle, opened_at, plan, intent, todo, changes) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      editPlanCycle: db.prepare('UPDATE plan_cycles SET edited = ? WHERE session_id = ? AND cycle = ? AND decision IS NULL'),
      decidePlanCycle: db.prepare('UPDATE plan_cycles SET decision = ?, decided_at = ? WHERE session_id = ? AND cycle = ? AND decision IS NULL'),
      planCycle: db.prepare('SELECT * FROM plan_cycles WHERE session_id = ? AND cycle = ?'),
      planCyclesOf: db.prepare('SELECT * FROM plan_cycles WHERE session_id = ? ORDER BY cycle'),
      setPlanGate: db.prepare('UPDATE sessions SET execution_status = ?, plan_cycle = ?, updated_at = ? WHERE session_id = ?'),
      setPlanReleased: db.prepare('UPDATE sessions SET plan_released = ?, updated_at = ? WHERE session_id = ?'),
      // REQ-CHAT-038: the prompt records; the QUEUED → TRIGGERED move is one conditional update whose row count is the claim.
      insertQueuedPrompt: db.prepare('INSERT INTO queued_prompts (session_id, prompt_id, position, content, status, created_at, context_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      queuedPromptsOf: db.prepare('SELECT * FROM queued_prompts WHERE session_id = ? ORDER BY position'),
      maxQueuedPosition: db.prepare('SELECT max(position) AS m FROM queued_prompts WHERE session_id = ?'),
      updateQueuedPrompt: db.prepare("UPDATE queued_prompts SET content = ? WHERE session_id = ? AND prompt_id = ? AND status = 'QUEUED'"),
      deleteQueuedPrompt: db.prepare("DELETE FROM queued_prompts WHERE session_id = ? AND prompt_id = ? AND status = 'QUEUED'"),
      triggerQueuedPrompt: db.prepare("UPDATE queued_prompts SET status = 'TRIGGERED', triggered_at = ? WHERE session_id = ? AND prompt_id = ? AND status = 'QUEUED'"),
      completeQueuedPrompt: db.prepare("UPDATE queued_prompts SET status = 'COMPLETED' WHERE session_id = ? AND prompt_id = ? AND status = 'TRIGGERED'"),
      // REQ-SESSION-138: a plain INSERT — the one-shot is the primary key, not a check a caller could skip.
      insertLaunchAudit: db.prepare('INSERT INTO launch_audits (session_id, recorded_at, payload) VALUES (?, ?, ?)'),
      getLaunchAudit: db.prepare('SELECT * FROM launch_audits WHERE session_id = ?'),
      insertTimeline: db.prepare('INSERT INTO timeline (session_id, ordinal, at, name, actor, message, metadata, id, severity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
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
        (session_id, row_index, kind, settled, body, at, persona, name, ts, tool_name, tool_status, call_key, duration_ms, started_at, input, output, diff, blocked_reason, attachments)
        VALUES (@session_id, @row_index, @kind, @settled, @body, @at, @persona, @name, @ts, @tool_name, @tool_status, @call_key, @duration_ms, @started_at, @input, @output, @diff, @blocked_reason, @attachments)`),
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
      // Part AO — REQ-CHAT-084: every row of the session, whichever page holds it, in one statement.
      clearTranscriptRows: db.prepare('DELETE FROM transcript_rows WHERE session_id = ?'),

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
      // REQ-MONITOR-167: per-tool totals across the agents of one session, most-called first.
      toolCallCounts: db.prepare('SELECT tool_name, COUNT(*) AS count, COUNT(DISTINCT agent_name) AS agents FROM tool_calls WHERE session_id = ? GROUP BY tool_name ORDER BY count DESC, tool_name'),
      insertIssue: db.prepare(`INSERT INTO issues (session_id, ordinal, id, recorded_at, kind, severity, actor, message, evidence_ref, metadata)
        VALUES (@session_id, @ordinal, @id, @recorded_at, @kind, @severity, @actor, @message, @evidence_ref, @metadata)`),
      oldestIssue: db.prepare('DELETE FROM issues WHERE session_id = ? AND ordinal = (SELECT min(ordinal) FROM issues WHERE session_id = ?)'),
      issuesOf: db.prepare('SELECT * FROM issues WHERE session_id = ? ORDER BY ordinal'),

      // ADR-0012: the child ledger. Every statement carries session_id (REQ-ORCH-151, asserted by a test over this text).
      insertChild: db.prepare(`INSERT INTO children (session_id, task_id, canonical_name, given_name, persona, state, parent_id, depth, iteration, model_key, category, background, task, depends_on, inherited_context, granted_tools, granted_mcp, todo, spawned_at, continuation_of, write_scope)
        VALUES (@session_id, @task_id, @canonical_name, @given_name, @persona, @state, @parent_id, @depth, @iteration, @model_key, @category, @background, @task, @depends_on, @inherited_context, @granted_tools, @granted_mcp, @todo, @spawned_at, @continuation_of, @write_scope)`),
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
      // PD-ORCH-005: the two facts a rest records beside the move to `paused`, and their clearing when the child resumes.
      setChildRest: db.prepare('UPDATE children SET interruption = ?, resume_state = ? WHERE session_id = ? AND task_id = ?'),
      pausedChildrenOfIteration: db.prepare("SELECT * FROM children WHERE session_id = ? AND iteration = ? AND state = 'paused' ORDER BY spawned_at, task_id"),

      // v23 — PD-ORCH-005: the iterations, each carrying its root's task id.
      insertIteration: db.prepare(`INSERT INTO iterations (session_id, iteration, root_task_id, root_canonical_name, root_persona, todo_task_id, task, state, opened_at)
        VALUES (@session_id, @iteration, @root_task_id, @root_canonical_name, @root_persona, @todo_task_id, @task, 'open', @opened_at)`),
      getIteration: db.prepare('SELECT * FROM iterations WHERE session_id = ? AND iteration = ?'),
      openIterationOf: db.prepare("SELECT * FROM iterations WHERE session_id = ? AND state = 'open' ORDER BY iteration DESC LIMIT 1"),
      iterationsOf: db.prepare('SELECT * FROM iterations WHERE session_id = ? ORDER BY iteration'),
      closeIteration: db.prepare("UPDATE iterations SET state = 'closed', outcome = ?, closed_at = ? WHERE session_id = ? AND iteration = ? AND state = 'open'"),
      setIterationInterruption: db.prepare("UPDATE iterations SET interruption = ? WHERE session_id = ? AND iteration = ? AND state = 'open'"),

      // v23 — PD-ORCH-005: the agents' conversations. The sequence is per agent and taken inside the insert, as the slot queue's is.
      insertAgentMessage: db.prepare(`INSERT INTO agent_messages (session_id, task_id, seq, iteration, kind, body, at)
        VALUES (@session_id, @task_id, (SELECT coalesce(max(seq), 0) + 1 FROM agent_messages WHERE session_id = @session_id AND task_id = @task_id), @iteration, @kind, @body, @at)`),
      // A resume reads from the agent's last replacement forward: the compressed conversation, then what followed it.
      agentConversation: db.prepare(`SELECT * FROM agent_messages WHERE session_id = ? AND task_id = ?
        AND seq >= coalesce((SELECT max(seq) FROM agent_messages WHERE session_id = ? AND task_id = ? AND kind = 'replacement'), 0) ORDER BY seq`),
      agentMessagesOf: db.prepare('SELECT * FROM agent_messages WHERE session_id = ? AND task_id = ? ORDER BY seq'),
      // Clause 12: the transcript clear removes the records of closed iterations and keeps the open one's.
      clearClosedAgentMessages: db.prepare("DELETE FROM agent_messages WHERE session_id = ? AND iteration NOT IN (SELECT iteration FROM iterations WHERE session_id = ? AND state = 'open')"),

      // v23 — PD-ORCH-005 clause 10: the background terminal sessions agents started.
      upsertAgentTerminal: db.prepare(`INSERT INTO agent_terminals (session_id, terminal_id, task_id, command, started_at, state, exit_code, output_tail, updated_at)
        VALUES (@session_id, @terminal_id, @task_id, @command, @started_at, @state, @exit_code, @output_tail, @updated_at)
        ON CONFLICT (session_id, terminal_id) DO UPDATE SET state = excluded.state, exit_code = excluded.exit_code, output_tail = excluded.output_tail, updated_at = excluded.updated_at
        WHERE agent_terminals.task_id = excluded.task_id AND agent_terminals.command = excluded.command`),
      agentTerminalsOf: db.prepare('SELECT * FROM agent_terminals WHERE session_id = ? ORDER BY started_at, terminal_id'),
      enqueueSlot: db.prepare('INSERT INTO model_slot_queue (session_id, model_key, position, task_id) VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1 FROM model_slot_queue WHERE session_id = ? AND model_key = ?), ?)'),
      slotQueueOf: db.prepare('SELECT task_id FROM model_slot_queue WHERE session_id = ? AND model_key = ? ORDER BY position'),
      dequeueSlot: db.prepare('DELETE FROM model_slot_queue WHERE session_id = ? AND model_key = ? AND task_id = ?'),

      // ADR-0039 (v9): the checkpoint table. A plain INSERT — REQ-GIT-046's "no two records carry the same sequence" is the
      // primary key, not a check a caller could skip; the listing is an ORDER BY under that key (REQ-SESSION-019, REQ-GIT-037).
      insertCheckpoint: db.prepare(`INSERT INTO checkpoints (session_id, sequence, ref, commit_id, created_at, iteration, child_name, files, kind)
        VALUES (@session_id, @sequence, @ref, @commit_id, @created_at, @iteration, @child_name, @files, @kind)`),
      checkpointsOf: db.prepare('SELECT * FROM checkpoints WHERE session_id = ? ORDER BY sequence'),
      countCheckpoints: db.prepare('SELECT count(*) AS c FROM checkpoints WHERE session_id = ?'),
      maxCheckpointSequence: db.prepare('SELECT max(sequence) AS m FROM checkpoints WHERE session_id = ?'),
      // REQ-GIT-049: the rows outside the newest `keep`, read then deleted in the caller's transaction (their refs go after the commit).
      checkpointsBeyond: db.prepare('SELECT * FROM checkpoints WHERE session_id = ? ORDER BY sequence DESC LIMIT -1 OFFSET ?'),
      deleteCheckpoint: db.prepare('DELETE FROM checkpoints WHERE session_id = ? AND sequence = ?'),
      setLastRestored: db.prepare('UPDATE sessions SET last_restored_sequence = ?, updated_at = ? WHERE session_id = ?'),

      // Part Y (v12): the session artifact store. The record and its index entry are ONE insert — the declared index is
      // maintained by the engine inside the caller's transaction (REQ-LIBRARY-087), so there is no second write to
      // sequence and no window in which one exists without the other. Every statement names session_id (REQ-ORCH-151,
      // REQ-ORCH-149's session scope), and there is NO statement that updates anything but the body and its timestamp,
      // the supersession links or the consumer list: REQ-LIBRARY-094's "everything else stays immutable through every
      // editing surface" is enforced by the absence of a statement, as REQ-SESSION-131's is.
      insertArtifact: db.prepare(`INSERT INTO artifacts (session_id, id, slug, title, kind, source_task_id, canonical_name, source_persona, status, summary, key_findings,
        highlight_paths, snippets, edited_files, created_files, commands, tags, supersedes, superseded_by, created_by, consumed_by, timeline_event_id, conversation_id, importance, created_at, edited_at, body_file)
        VALUES (@session_id, @id, @slug, @title, @kind, @source_task_id, @canonical_name, @source_persona, @status, @summary, @key_findings,
        @highlight_paths, @snippets, @edited_files, @created_files, @commands, @tags, @supersedes, @superseded_by, @created_by, @consumed_by, @timeline_event_id, @conversation_id, @importance, @created_at, @edited_at, @body_file)`),
      // REQ-LIBRARY-096: ascending by creation time, the index's own order; the plan is asserted in `store.test.ts`.
      artifactsOf: db.prepare('SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at, id'),
      artifactById: db.prepare('SELECT * FROM artifacts WHERE session_id = ? AND id = ?'),
      artifactBySlug: db.prepare('SELECT * FROM artifacts WHERE session_id = ? AND slug = ?'),
      artifactByTask: db.prepare('SELECT * FROM artifacts WHERE session_id = ? AND source_task_id = ?'),
      artifactByCanonical: db.prepare("SELECT * FROM artifacts WHERE session_id = ? AND canonical_name = ? AND kind = 'child_report' ORDER BY created_at, id"),
      slugsLike: db.prepare('SELECT slug FROM artifacts WHERE session_id = ? AND (slug = ? OR slug LIKE ?)'),
      // REQ-LIBRARY-094: only the body's timestamp moves here — the body itself is a file, so the row records that it changed and nothing more.
      touchArtifactEdited: db.prepare('UPDATE artifacts SET edited_at = ? WHERE session_id = ? AND id = ?'),
      // REQ-LIBRARY-092: a re-materialisation updates in place and preserves id, slug, title, creation time, supersession links, consumers and edit timestamp.
      rematerialiseArtifact: db.prepare(`UPDATE artifacts SET status = @status, summary = @summary, key_findings = @key_findings, highlight_paths = @highlight_paths,
        snippets = @snippets, edited_files = @edited_files, created_files = @created_files, commands = @commands, tags = @tags, source_persona = @source_persona, canonical_name = @canonical_name,
        created_by = @created_by, importance = @importance, timeline_event_id = coalesce(@timeline_event_id, timeline_event_id), conversation_id = coalesce(@conversation_id, conversation_id)
        WHERE session_id = @session_id AND id = @id`),
      // REQ-LIBRARY-095: both directions, each its own statement so neither can be written without the other being available.
      setArtifactSupersedes: db.prepare('UPDATE artifacts SET supersedes = ? WHERE session_id = ? AND id = ?'),
      setArtifactSupersededBy: db.prepare('UPDATE artifacts SET superseded_by = ? WHERE session_id = ? AND id = ?'),
      // REQ-LIBRARY-096: the actor appended at most once — the caller reads, decides, writes, inside one transaction.
      setArtifactConsumers: db.prepare('UPDATE artifacts SET consumed_by = ? WHERE session_id = ? AND id = ?'),
      setArtifactTimelineEvent: db.prepare('UPDATE artifacts SET timeline_event_id = ? WHERE session_id = ? AND id = ?'),
      countArtifacts: db.prepare('SELECT count(*) AS c FROM artifacts WHERE session_id = ?'),
      // Part U (REQ-SESSION-166): the one delete statement. Every child table declares ON DELETE CASCADE and the open
      // enables enforcement (open.ts, defect 40), so the row's removal takes its fifteen dependants in the same statement;
      // `store.test.ts` plants a row in every table and asserts each is gone.
      deleteSession: db.prepare('DELETE FROM sessions WHERE session_id = ?'),
      // Part U (REQ-SESSION-153/189): the whole history in stored order — the trajectory's events, read in one transaction.
      eventsOf: db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ordinal'),

      // v11 (Part X): the saved prompts. One statement pair per list rather than a table name spliced into SQL —
      // every SQL string in the product is prepared here and none is built from a value (ADR-0058, consequence 16).
      // The reader takes `LIMIT cap` so a store holding more than the cap (an older build, a restored artifact)
      // still answers with at most the cap while the trim runs beside it: REQ-LIBRARY-139 enforces "on both load
      // and save", and the read must not depend on the write having happened first.
      readHistory: db.prepare('SELECT text FROM prompt_history ORDER BY seq DESC LIMIT ?'),
      readStash: db.prepare('SELECT text FROM prompt_stash ORDER BY seq DESC LIMIT ?'),
      frontHistory: db.prepare('SELECT text FROM prompt_history ORDER BY seq DESC LIMIT 1'),
      frontStash: db.prepare('SELECT text FROM prompt_stash ORDER BY seq DESC LIMIT 1'),
      insertHistory: db.prepare('INSERT INTO prompt_history (text, at) VALUES (?, ?)'),
      insertStash: db.prepare('INSERT INTO prompt_stash (text, at) VALUES (?, ?)'),
      // REQ-LIBRARY-139: the oldest beyond the cap, by the same OFFSET form the checkpoint trim uses — exact
      // under the gaps AUTOINCREMENT leaves, which `max(seq) - cap` would not be.
      trimHistory: db.prepare('DELETE FROM prompt_history WHERE seq IN (SELECT seq FROM prompt_history ORDER BY seq DESC LIMIT -1 OFFSET ?)'),
      trimStash: db.prepare('DELETE FROM prompt_stash WHERE seq IN (SELECT seq FROM prompt_stash ORDER BY seq DESC LIMIT -1 OFFSET ?)'),
      // REQ-LIBRARY-139: a blank entry is discarded on load, and is discarded FROM THE STORE so the next load
      // does not have to discard it again (a load that keeps answering around a row it will not show is a store
      // disagreeing with every surface over it).
      pruneBlankHistory: db.prepare("DELETE FROM prompt_history WHERE trim(text) = ''"),
      pruneBlankStash: db.prepare("DELETE FROM prompt_stash WHERE trim(text) = ''"),
      // REQ-LIBRARY-107: by the entry's own position from the newest, so a filtered view removes the right item.
      historyAt: db.prepare('SELECT seq, text FROM prompt_history ORDER BY seq DESC LIMIT 1 OFFSET ?'),
      stashAt: db.prepare('SELECT seq, text FROM prompt_stash ORDER BY seq DESC LIMIT 1 OFFSET ?'),
      deleteHistoryAt: db.prepare('DELETE FROM prompt_history WHERE seq = ?'),
      deleteStashAt: db.prepare('DELETE FROM prompt_stash WHERE seq = ?'),
    };
  }

  insertChild(row: ChildInsert): void {
    this.stmts['insertChild']!.run({ ...row, todo: row.todo ?? null, continuation_of: row.continuation_of ?? null, write_scope: row.write_scope ?? '[]' });
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
  /** PD-ORCH-005: the interruption and the resume state a rest records, or both cleared (null) when the child resumes. */
  setChildRest(id: SessionId, taskId: string, interruption: string | null, resumeState: string | null): void {
    this.stmts['setChildRest']!.run(interruption, resumeState, id, taskId);
  }
  pausedChildrenOfIteration(id: SessionId, iteration: number): ChildRow[] {
    return this.stmts['pausedChildrenOfIteration']!.all(id, iteration) as ChildRow[];
  }

  // ---- v23 — PD-ORCH-005: the iterations, the conversations, the background terminals -----------------------

  insertIteration(row: IterationInsert): void {
    this.stmts['insertIteration']!.run(row);
  }
  getIteration(id: SessionId, iteration: number): IterationRow | undefined {
    return this.stmts['getIteration']!.get(id, iteration) as IterationRow | undefined;
  }
  /** The open iteration a continue resumes; at most one per session (`iterations_one_open` enforces it). */
  openIterationOf(id: SessionId): IterationRow | undefined {
    return this.stmts['openIterationOf']!.get(id) as IterationRow | undefined;
  }
  iterationsOf(id: SessionId): IterationRow[] {
    return this.stmts['iterationsOf']!.all(id) as IterationRow[];
  }
  /** True when an open iteration was closed; closing a closed or unknown iteration changes nothing. */
  closeIteration(id: SessionId, iteration: number, outcome: string, closedAt: string): boolean {
    return this.stmts['closeIteration']!.run(outcome, closedAt, id, iteration).changes === 1;
  }
  /** The rest that left an open iteration open; a resume sets it back to NULL, so a later crash is not read as the earlier rest. */
  setIterationInterruption(id: SessionId, iteration: number, interruption: string | null): boolean {
    return this.stmts['setIterationInterruption']!.run(interruption, id, iteration).changes === 1;
  }
  insertAgentMessage(row: Omit<AgentMessageRow, 'seq'>): void {
    this.stmts['insertAgentMessage']!.run(row);
  }
  /** The conversation a resume sends: from the agent's last replacement forward, in order. */
  agentConversation(id: SessionId, taskId: string): AgentMessageRow[] {
    return this.stmts['agentConversation']!.all(id, taskId, id, taskId) as AgentMessageRow[];
  }
  /** Every entry of an agent's record, replacements included, in order. */
  agentMessagesOf(id: SessionId, taskId: string): AgentMessageRow[] {
    return this.stmts['agentMessagesOf']!.all(id, taskId) as AgentMessageRow[];
  }
  /** Clause 12: the records of every closed iteration removed, an open iteration's kept; the count removed. */
  clearClosedAgentMessages(id: SessionId): number {
    return this.stmts['clearClosedAgentMessages']!.run(id, id).changes;
  }
  /**
   * A new terminal, or the state, exit code and tail of a recorded one; `false` when the id names a terminal another agent
   * started with another command (an id collision across two managers), which is left as it was.
   */
  upsertAgentTerminal(row: AgentTerminalRow): boolean {
    return this.stmts['upsertAgentTerminal']!.run(row).changes === 1;
  }
  agentTerminalsOf(id: SessionId): AgentTerminalRow[] {
    return this.stmts['agentTerminalsOf']!.all(id) as AgentTerminalRow[];
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
  /** REQ-MONITOR-167: `{ tool_name, count, agents }` per tool, most-called first (ties by name). */
  toolCallCounts(id: SessionId): ToolCallCountRow[] {
    return this.stmts['toolCallCounts']!.all(id) as ToolCallCountRow[];
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

  /**
   * Part U (ADR-0024 c.5, REQ-SESSION-199): a READ transaction — `BEGIN` deferred — so an export's entries and its ring
   * headers come from one consistent state; a displacement landing between two reads cannot make a healthy record
   * fail its own completeness arithmetic. No write may run inside it.
   */
  readTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn).deferred();
  }

  /** REQ-SESSION-166: true when a row was removed (and, through the cascade, everything keyed by it); false for a missing session. */
  deleteSession(id: SessionId): boolean {
    return this.stmts['deleteSession']!.run(id).changes === 1;
  }
  listSessions(): SessionRow[] {
    return this.stmts['listSessions']!.all() as SessionRow[];
  }
  getSession(id: SessionId): SessionRow | undefined {
    return this.stmts['getSession']!.get(id) as SessionRow | undefined;
  }
  upsertSession(row: Pick<SessionRow, 'session_id' | 'execution_status' | 'workspace_root' | 'created_at' | 'updated_at'> & Partial<Pick<SessionRow, 'worktree' | 'sandbox_mode' | 'run_type'>>): void {
    this.stmts['upsertSession']!.run({ ...row, worktree: row.worktree ?? null, sandbox_mode: row.sandbox_mode ?? null, run_type: row.run_type ?? null });
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
      tokens_input: patch.tokens_input ?? null, tokens_output: patch.tokens_output ?? null, cost: patch.cost ?? null, cost_qualifier: patch.cost_qualifier ?? null,
      tool_calls: patch.tool_calls ?? null, compressions: patch.compressions ?? null,
      summary_status: patch.summary_status ?? null, summary_severity: patch.summary_severity ?? null, summary_text: patch.summary_text ?? null,
      todo: patch.todo ?? null, progress: patch.progress ?? null, message_limit: patch.message_limit ?? null,
      token_samples: patch.token_samples ?? null,
    });
  }
  /** REQ-ORCH-087 / REQ-SESSION-110: status, the count reached (null clears the pause) and the limit in force, one statement. */
  setPause(id: SessionId, status: string, pausedAtCount: number | null, messageLimit: number | null, updatedAt: string): void {
    this.stmts['setPause']!.run(status, pausedAtCount, messageLimit, updatedAt, id);
  }

  /** REQ-ORCH-154 (v17): one cycle's opening record — the plan verbatim, never rewritten after this insert. */
  insertPlanCycle(id: SessionId, cycle: number, openedAt: string, plan: string, intent: string, todo: string, changes: string): void {
    this.stmts['insertPlanCycle']!.run(id, cycle, openedAt, plan, intent, todo, changes);
  }
  /** REQ-ORCH-154: the user's own text. False when the cycle is unknown or already decided — an answered gate takes no further edit. */
  editPlanCycle(id: SessionId, cycle: number, edited: string): boolean {
    return this.stmts['editPlanCycle']!.run(edited, id, cycle).changes === 1;
  }
  /** REQ-ORCH-154: the answer, recorded once; a second answer for the same cycle changes nothing and reports false. */
  decidePlanCycle(id: SessionId, cycle: number, decision: string, decidedAt: string): boolean {
    return this.stmts['decidePlanCycle']!.run(decision, decidedAt, id, cycle).changes === 1;
  }
  planCycle(id: SessionId, cycle: number): PlanCycleRow | undefined {
    return this.stmts['planCycle']!.get(id, cycle) as PlanCycleRow | undefined;
  }
  planCyclesOf(id: SessionId): PlanCycleRow[] {
    return this.stmts['planCyclesOf']!.all(id) as PlanCycleRow[];
  }
  /** REQ-ORCH-153: the held status and the cycle awaiting an answer (null clears the gate), one statement. */
  setPlanGate(id: SessionId, status: string, cycle: number | null, updatedAt: string): void {
    this.stmts['setPlanGate']!.run(status, cycle, updatedAt, id);
  }
  /** REQ-ORCH-154: approval is one-way for the run that received it; the next user prompt clears it. */
  setPlanReleased(id: SessionId, released: boolean, updatedAt: string): void {
    this.stmts['setPlanReleased']!.run(released ? 1 : 0, updatedAt, id);
  }
  /**
   * REQ-CHAT-038/039 (v13): the owner is `id` and is the primary key's first column, so it is fixed at the insert and
   * no later statement can move it — which is "ownership MUST be preserved across edit and trigger" as a property of
   * the table. `contextSnapshot` is the optional snapshot, stored verbatim.
   */
  insertQueuedPrompt(id: SessionId, promptId: string, content: string, createdAt: string, contextSnapshot: string | null = null): QueuedPromptRow {
    const position = ((this.stmts['maxQueuedPosition']!.get(id) as { m: number | null }).m ?? 0) + 1;
    this.stmts['insertQueuedPrompt']!.run(id, promptId, position, content, 'QUEUED', createdAt, contextSnapshot);
    return { session_id: id, prompt_id: promptId, position, content, status: 'QUEUED', created_at: createdAt, triggered_at: null, context_snapshot: contextSnapshot };
  }
  queuedPromptsOf(id: SessionId): QueuedPromptRow[] {
    return this.stmts['queuedPromptsOf']!.all(id) as QueuedPromptRow[];
  }
  /** REQ-CHAT-038: false when the prompt is unknown or no longer QUEUED. */
  updateQueuedPrompt(id: SessionId, promptId: string, content: string): boolean {
    return this.stmts['updateQueuedPrompt']!.run(content, id, promptId).changes === 1;
  }
  deleteQueuedPrompt(id: SessionId, promptId: string): boolean {
    return this.stmts['deleteQueuedPrompt']!.run(id, promptId).changes === 1;
  }
  /** REQ-CHAT-038: the atomic QUEUED → TRIGGERED move; exactly one caller sees true. */
  triggerQueuedPrompt(id: SessionId, promptId: string, at: string): boolean {
    return this.stmts['triggerQueuedPrompt']!.run(at, id, promptId).changes === 1;
  }
  completeQueuedPrompt(id: SessionId, promptId: string): boolean {
    return this.stmts['completeQueuedPrompt']!.run(id, promptId).changes === 1;
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
  /**
   * REQ-SESSION-134: `entryId` and `severity` are the entry's own, not defaulted here — a caller that has neither
   * writes what it has, and the v10 note in `schema.ts` says why nothing is minted on its behalf.
   */
  insertTimeline(id: SessionId, ordinal: number, at: string, name: string, actor: string, message: string, metadata: string, entryId: string, severity: string): void {
    this.stmts['insertTimeline']!.run(id, ordinal, at, name, actor, message, metadata, entryId, severity);
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

  appendRow(id: SessionId, index: number, kind: string, settled: boolean, body: string, at = '', extra: { persona?: string | null; name?: string | null; ts?: string; attachments?: string } & RowToolFields = {}): void {
    this.stmts['appendRow']!.run({
      session_id: id, row_index: index, kind, settled: settled ? 1 : 0, body, at, persona: extra.persona ?? null, name: extra.name ?? null, ts: extra.ts ?? '',
      tool_name: extra.tool_name ?? null, tool_status: extra.tool_status ?? null, call_key: extra.call_key ?? null, duration_ms: extra.duration_ms ?? null,
      started_at: extra.started_at ?? null, input: extra.input ?? null, output: extra.output ?? null, diff: extra.diff ?? null, blocked_reason: extra.blocked_reason ?? null,
      attachments: extra.attachments ?? '[]',
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
  // Part AO
  /**
   * REQ-CHAT-084 (Part AO): the atomic clear of a session's transcript — every row, resident or released to a page, in
   * ONE statement the caller runs inside its own transaction beside the timeline entry that records the clear, so a
   * reader sees the old rows or none and never a page boundary in between. The `events` history is untouched: the
   * wire record of REQ-SESSION-147 is not the transcript, and REQ-EVENTS-052's contiguous indices stay contiguous
   * there while the next row the run appends takes the next index rather than restarting at 0. Returns how many rows
   * were removed.
   */
  clearTranscriptRows(id: SessionId): number {
    return this.stmts['clearTranscriptRows']!.run(id).changes;
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
  /** Part U: every stored event, ordinal order — the trajectory export's read (REQ-SESSION-153). */
  eventsOf(id: SessionId): EventRow[] {
    return this.stmts['eventsOf']!.all(id) as EventRow[];
  }
  eventsOfKind(id: SessionId, kind: string): EventRow[] {
    return this.stmts['eventsOfKind']!.all(id, kind) as EventRow[];
  }
  eventSummary(id: SessionId): { count: number; first: string | null; last: string | null } {
    const r = this.stmts['eventSummary']!.get(id) as { c: number; first: string | null; last: string | null };
    return { count: r.c, first: r.first, last: r.last };
  }

  // ADR-0039: the checkpoint rows. Every statement names session_id (REQ-ORCH-151's isolation as a predicate).
  insertCheckpoint(row: Omit<CheckpointRow, 'session_id'> & { readonly session_id: SessionId }): void {
    this.stmts['insertCheckpoint']!.run(row);
  }
  /** REQ-GIT-050 / REQ-SESSION-019: oldest first, by the primary key; no Git is consulted. */
  listCheckpoints(id: SessionId): CheckpointRow[] {
    return this.stmts['checkpointsOf']!.all(id) as CheckpointRow[];
  }
  /** REQ-GIT-018: derived from the rows, never stored twice (ADR-0039). */
  checkpointCount(id: SessionId): number {
    return (this.stmts['countCheckpoints']!.get(id) as { c: number }).c;
  }
  maxCheckpointSequence(id: SessionId): number | null {
    return (this.stmts['maxCheckpointSequence']!.get(id) as { m: number | null }).m;
  }
  /** REQ-GIT-049: keep the `keep` most recent by sequence; the trimmed rows come back so the caller deletes their refs AFTER the commit. */
  trimCheckpoints(id: SessionId, keep: number): CheckpointRow[] {
    const victims = (this.stmts['checkpointsBeyond']!.all(id, Math.max(0, keep)) as CheckpointRow[]).reverse();
    for (const v of victims) this.stmts['deleteCheckpoint']!.run(id, v.sequence);
    return victims;
  }
  /** REQ-GIT-155: written only in the transaction that reports a restore successful. */
  setLastRestored(id: SessionId, sequence: number, updatedAt: string): void {
    this.stmts['setLastRestored']!.run(sequence, updatedAt, id);
  }

  // v11 (Part X): the saved prompts (REQ-LIBRARY-137/138/139). Every rule the requirements state about an entry
  // lives HERE, beside the insert and the delete, and not in a caller — there is no second route to these tables,
  // so no later caller can skip the duplicate suppression or the cap by writing its own path.
  private readonly promptStmts = { history: { read: 'readHistory', front: 'frontHistory', insert: 'insertHistory', trim: 'trimHistory', pruneBlank: 'pruneBlankHistory', at: 'historyAt', deleteAt: 'deleteHistoryAt' }, stash: { read: 'readStash', front: 'frontStash', insert: 'insertStash', trim: 'trimStash', pruneBlank: 'pruneBlankStash', at: 'stashAt', deleteAt: 'deleteStashAt' } } as const;

  /**
   * REQ-LIBRARY-139, the LOAD half: blank entries removed, the cap enforced, both lists newest first. The prune
   * and the trim run in one transaction with the two reads, so no reader ever sees a list half-trimmed
   * (REQ-CHAT-045: "no reader ever observes a partly applied change to either list").
   */
  readPrompts(caps: Readonly<Record<PromptList, number>> = PROMPT_CAPS): PromptLists {
    return this.transaction(() => {
      const list = (which: PromptList): string[] => {
        const s = this.promptStmts[which];
        this.stmts[s.pruneBlank]!.run();
        this.stmts[s.trim]!.run(Math.max(0, caps[which]));
        return (this.stmts[s.read]!.all(Math.max(0, caps[which])) as { text: string }[]).map((r) => String(r.text));
      };
      return { history: list('history'), stash: list('stash') };
    });
  }

  /**
   * REQ-LIBRARY-137: front-insert, "suppressing only adjacent duplicates (a new entry equal to the current front
   * item is not added)"; the stash "front-inserts non-empty text", and REQ-LIBRARY-139 discards blank entries, so
   * a blank push is not a change to either list. REQ-LIBRARY-139's SAVE half is the trim in the same transaction.
   * `added` is false where nothing was written — the caller uses it to decide whether a library change happened
   * at all (REQ-LIBRARY-105: a write that changes nothing is not one).
   */
  pushPrompt(list: PromptList, text: string, at: string, caps: Readonly<Record<PromptList, number>> = PROMPT_CAPS): { added: boolean; lists: PromptLists } {
    const s = this.promptStmts[list];
    const added = this.transaction(() => {
      if (text.trim() === '') return false;
      const front = this.stmts[s.front]!.get() as { text: string } | undefined;
      if (front !== undefined && front.text === text) return false;
      this.stmts[s.insert]!.run(text, at);
      this.stmts[s.trim]!.run(Math.max(0, caps[list]));
      return true;
    });
    return { added, lists: this.readPrompts(caps) };
  }

  /** REQ-LIBRARY-107: remove the entry at `index` counted from the newest. False when the index names no entry. */
  removePrompt(list: PromptList, index: number): boolean {
    const s = this.promptStmts[list];
    return this.transaction(() => {
      if (!Number.isInteger(index) || index < 0) return false;
      const row = this.stmts[s.at]!.get(index) as { seq: number; text: string } | undefined;
      if (row === undefined) return false;
      return this.stmts[s.deleteAt]!.run(row.seq).changes === 1;
    });
  }

  /**
   * REQ-LIBRARY-137: "Popping a stash entry removes and returns it by index; an out-of-range index returns an
   * empty string without error." The read and the removal are one transaction, so the text returned is the text
   * of the row that went.
   */
  popPrompt(list: PromptList, index: number): string {
    const s = this.promptStmts[list];
    return this.transaction(() => {
      if (!Number.isInteger(index) || index < 0) return '';
      const row = this.stmts[s.at]!.get(index) as { seq: number; text: string } | undefined;
      if (row === undefined) return '';
      return this.removePrompt(list, index) ? String(row.text) : '';
    });
  }

  /** The entry at `index` counted from the newest, without removing it — REQ-LIBRARY-107's "Use" and the dialog's "Apply". */
  promptAt(list: PromptList, index: number): string {
    if (!Number.isInteger(index) || index < 0) return '';
    const row = this.stmts[this.promptStmts[list].at]!.get(index) as { text: string } | undefined;
    return row === undefined ? '' : String(row.text);
  }

  // Part Y (v12): the session artifact store's statements (REQ-LIBRARY-087/088/092/094/095/096).
  /** One INSERT: the row and its index entry, indivisible by construction (REQ-LIBRARY-087). */
  insertArtifact(row: ArtifactInsert): void {
    this.stmts['insertArtifact']!.run(row);
  }
  /** REQ-LIBRARY-096: ascending by creation time. Hydration reads this and tolerates whatever it finds (REQ-LIBRARY-091). */
  artifactsOf(id: SessionId): ArtifactRow[] {
    return this.stmts['artifactsOf']!.all(id) as ArtifactRow[];
  }
  /** REQ-LIBRARY-096: lookup accepts an id or a slug; the id is tried first, so a slug that looks like an id cannot shadow one. */
  artifactByRef(id: SessionId, ref: string): ArtifactRow | undefined {
    return (this.stmts['artifactById']!.get(id, ref) as ArtifactRow | undefined) ?? (this.stmts['artifactBySlug']!.get(id, ref) as ArtifactRow | undefined);
  }
  /** REQ-LIBRARY-092: idempotence keyed on the task id, falling back to the canonical agent name. */
  artifactByTask(id: SessionId, taskId: string): ArtifactRow | undefined {
    return this.stmts['artifactByTask']!.get(id, taskId) as ArtifactRow | undefined;
  }
  artifactByCanonical(id: SessionId, canonicalName: string): ArtifactRow | undefined {
    return (this.stmts['artifactByCanonical']!.all(id, canonicalName) as ArtifactRow[])[0];
  }
  /** The slugs a candidate would collide with, so REQ-LIBRARY-088's `-2`, `-3` is decided from what the session holds. */
  slugsLike(id: SessionId, base: string): string[] {
    return (this.stmts['slugsLike']!.all(id, base, `${base}-%`) as { slug: string }[]).map((r) => r.slug);
  }
  /** REQ-LIBRARY-094: the body is a file; the row records only that a person edited it, and when. */
  touchArtifactEdited(id: SessionId, artifactId: string, editedAt: string): boolean {
    return this.stmts['touchArtifactEdited']!.run(editedAt, id, artifactId).changes === 1;
  }
  /** REQ-LIBRARY-092: in place; id, slug, title, creation time, supersession links, consumers and `edited_at` are not in the statement. */
  rematerialiseArtifact(row: Pick<ArtifactRow, 'session_id' | 'id' | 'status' | 'summary' | 'key_findings' | 'highlight_paths' | 'snippets' | 'edited_files' | 'created_files' | 'commands' | 'tags' | 'source_persona' | 'canonical_name' | 'created_by' | 'importance' | 'timeline_event_id' | 'conversation_id'>): boolean {
    return this.stmts['rematerialiseArtifact']!.run(row).changes === 1;
  }
  /** REQ-LIBRARY-095: both directions, written inside one transaction by the caller. */
  linkSupersession(id: SessionId, newerId: string, olderId: string): void {
    this.stmts['setArtifactSupersedes']!.run(olderId, id, newerId);
    this.stmts['setArtifactSupersededBy']!.run(newerId, id, olderId);
  }
  setArtifactConsumers(id: SessionId, artifactId: string, consumers: readonly string[]): void {
    this.stmts['setArtifactConsumers']!.run(JSON.stringify(consumers), id, artifactId);
  }
  /** REQ-LIBRARY-092: the `artifact_published` entry's id linked back onto the record, in the transaction that wrote it. */
  setArtifactTimelineEvent(id: SessionId, artifactId: string, entryId: string): void {
    this.stmts['setArtifactTimelineEvent']!.run(entryId, id, artifactId);
  }
  artifactCount(id: SessionId): number {
    return (this.stmts['countArtifacts']!.get(id) as { c: number }).c;
  }

  totals(): { sessions: number; rows: number } {
    return {
      sessions: (this.stmts['countAllSessions']!.get() as { c: number }).c,
      rows: (this.stmts['countAllRows']!.get() as { c: number }).c,
    };
  }
}
