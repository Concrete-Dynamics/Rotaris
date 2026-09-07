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

export class StoreDal {
  private readonly stmts: Record<string, Statement>;

  constructor(readonly db: StoreHandle) {
    this.stmts = {
      listSessions: db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC'),
      getSession: db.prepare('SELECT * FROM sessions WHERE session_id = ?'),
      // v8: the binding and the sandbox mode are written with the row at creation (REQ-GIT-022: saved with the session record) and never moved.
      upsertSession: db.prepare(`
        INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at, worktree, sandbox_mode)
        VALUES (@session_id, @execution_status, @workspace_root, @created_at, @updated_at, @worktree, coalesce(@sandbox_mode, 'off'))
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
          progress = coalesce(@progress, progress),
          message_limit = coalesce(@message_limit, message_limit),
          token_samples = coalesce(@token_samples, token_samples)
        WHERE session_id = @session_id`),
      // REQ-ORCH-087 / REQ-SESSION-110: the pause recorded with its count; the resolution clears it in the same act that writes the status.
      setPause: db.prepare('UPDATE sessions SET execution_status = ?, paused_at_count = ?, message_limit = ?, updated_at = ? WHERE session_id = ?'),
      // REQ-CHAT-038: the prompt records; the QUEUED → TRIGGERED move is one conditional update whose row count is the claim.
      insertQueuedPrompt: db.prepare('INSERT INTO queued_prompts (session_id, prompt_id, position, content, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
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
      // REQ-MONITOR-167: per-tool totals across the agents of one session, most-called first.
      toolCallCounts: db.prepare('SELECT tool_name, COUNT(*) AS count, COUNT(DISTINCT agent_name) AS agents FROM tool_calls WHERE session_id = ? GROUP BY tool_name ORDER BY count DESC, tool_name'),
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
      // Part U (REQ-SESSION-166): the one delete statement. Every child table declares ON DELETE CASCADE and the open
      // enables enforcement (open.ts, defect 40), so the row's removal takes its thirteen dependants in the same statement;
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
  upsertSession(row: Pick<SessionRow, 'session_id' | 'execution_status' | 'workspace_root' | 'created_at' | 'updated_at'> & Partial<Pick<SessionRow, 'worktree' | 'sandbox_mode'>>): void {
    this.stmts['upsertSession']!.run({ ...row, worktree: row.worktree ?? null, sandbox_mode: row.sandbox_mode ?? null });
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
      todo: patch.todo ?? null, progress: patch.progress ?? null, message_limit: patch.message_limit ?? null,
      token_samples: patch.token_samples ?? null,
    });
  }
  /** REQ-ORCH-087 / REQ-SESSION-110: status, the count reached (null clears the pause) and the limit in force, one statement. */
  setPause(id: SessionId, status: string, pausedAtCount: number | null, messageLimit: number | null, updatedAt: string): void {
    this.stmts['setPause']!.run(status, pausedAtCount, messageLimit, updatedAt, id);
  }
  insertQueuedPrompt(id: SessionId, promptId: string, content: string, createdAt: string): QueuedPromptRow {
    const position = ((this.stmts['maxQueuedPosition']!.get(id) as { m: number | null }).m ?? 0) + 1;
    this.stmts['insertQueuedPrompt']!.run(id, promptId, position, content, 'QUEUED', createdAt);
    return { session_id: id, prompt_id: promptId, position, content, status: 'QUEUED', created_at: createdAt, triggered_at: null };
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

  totals(): { sessions: number; rows: number } {
    return {
      sessions: (this.stmts['countAllSessions']!.get() as { c: number }).c,
      rows: (this.stmts['countAllRows']!.get() as { c: number }).c,
    };
  }
}
