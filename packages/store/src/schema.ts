/**
 * The store schema, as an ordered list of migrations keyed by `user_version`.
 *
 * Only the workspace service runs a migration, at workspace open, before the
 * run host is told the workspace is open (W-02, SR-4). Table schema versioning
 * is W-07's; a RECORD's `schema_version` is a column read forward-tolerantly
 * and never migrated in place (D-22).
 *
 * v1 is the skeleton's: enough for the walking skeleton and the lock predicate.
 * v2 lands with the session writer (ADR-0008) and the event history (ADR-0009):
 * transcript residency as a column, the truncation record as four columns on
 * the session row, the derived event envelope, and the DECLARED indexes that
 * spike 8 prices. Every later table lands with the mechanism that writes it,
 * in its own migration, so that the checkpoint period of the publish path
 * (measured at 135–136 commits, spike 21) is moved knowingly rather than by
 * accident. v3 lands with the run loop: the run's columns on the session row,
 * the launch audit and the timeline.
 */
export interface Migration {
  readonly to: number;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    to: 1,
    sql: `
      CREATE TABLE sessions (
        session_id       TEXT PRIMARY KEY,
        schema_version   INTEGER NOT NULL DEFAULT 1,
        execution_status TEXT NOT NULL,
        workspace_root   TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      -- REQ-SESSION-046: the lock is a record in the same store as the session it locks.
      CREATE TABLE session_locks (
        session_id  TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
        pid         INTEGER NOT NULL,
        host        TEXT NOT NULL,
        acquired_at TEXT NOT NULL
      );
      -- REQ-SESSION-192: the resident window; released pages land with ADR-0008.
      CREATE TABLE transcript_rows (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        row_index  INTEGER NOT NULL,
        kind       TEXT NOT NULL,
        settled    INTEGER NOT NULL DEFAULT 0,
        body       TEXT NOT NULL,
        PRIMARY KEY (session_id, row_index)
      );
      -- ADR-0009: the event history as a table; the line-delimited form is an export.
      CREATE TABLE events (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        ordinal    INTEGER NOT NULL,
        kind       TEXT NOT NULL,
        at         TEXT NOT NULL,
        payload    TEXT NOT NULL,
        PRIMARY KEY (session_id, ordinal)
      );
      -- REQ-SESSION-042: a listing reads nothing but listing records.
      CREATE INDEX sessions_by_updated ON sessions(updated_at DESC);
    `,
  },
  {
    to: 2,
    sql: `
      -- ADR-0008 "Residency is a column, and release is a transaction": NULL is resident,
      -- a number is the page the row was released into (REQ-SESSION-192, REQ-SESSION-131).
      ALTER TABLE transcript_rows ADD COLUMN page INTEGER;
      -- REQ-CHAT-011: a row carries the instant it was recorded.
      ALTER TABLE transcript_rows ADD COLUMN at TEXT NOT NULL DEFAULT '';
      -- The resident window is what the projection owner and a reattach read (REQ-SESSION-196).
      CREATE INDEX transcript_resident ON transcript_rows(session_id, row_index) WHERE page IS NULL;

      -- REQ-EVENTS-087: "the fact that the history is open is a column".
      ALTER TABLE sessions ADD COLUMN history_open INTEGER NOT NULL DEFAULT 0;
      -- REQ-EVENTS-092: the truncation record is exactly four facts on the session's own row;
      -- its absence (the defaults) reads as not truncated with zero drops.
      ALTER TABLE sessions ADD COLUMN truncated     INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN dropped_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN trim_cap      INTEGER;
      ALTER TABLE sessions ADD COLUMN last_trim_at  TEXT;

      -- ADR-0009: the derived envelope, for querying only; \`payload\` holds the wire line verbatim
      -- (REQ-EVENTS-080) and is the record wherever a derived column disagrees.
      ALTER TABLE events ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE events ADD COLUMN iteration      INTEGER;
      -- REQ-EVENTS-117's four filter axes and REQ-EVENTS-126's summary as index reads, not scans.
      -- Each index adds WAL frames per insert (ADR-0009 consequence 2); spike 8 priced exactly this:
      -- +36 % on the publish-path commit at p50, and the checkpoint period shortened below 100 commits.
      -- Spike 8 also found the first shape of the iteration index — partial, WHERE iteration IS NOT
      -- NULL, without the ordinal — was never chosen by the planner: the filter cost 137 ms against
      -- REQ-EVENTS-175's 100 ms, the same as a scan. Full index, ordinal last, so the axis and the
      -- emission order are one index read.
      CREATE INDEX events_by_kind      ON events(session_id, kind, ordinal);
      CREATE INDEX events_by_at        ON events(session_id, at, ordinal);
      CREATE INDEX events_by_iteration ON events(session_id, iteration, ordinal);
    `,
  },
  {
    to: 3,
    // v3 lands with the run loop (ADR-0008 aggregates / launch audit, ADR-0013, ADR-0014). Columns and two
    // tables, NO new index: no budgeted query reads any of this yet. When one does, declare the index and
    // assert its plan in store.test.ts (spike 8's rule).
    sql: `
      -- REQ-SESSION-121: the row dictionary's agent/thinking/tool rows carry name and persona; every row
      -- carries ts in local HH:MM:SS as appended (the ISO instant stays in at).
      ALTER TABLE transcript_rows ADD COLUMN persona TEXT;
      ALTER TABLE transcript_rows ADD COLUMN name    TEXT;
      ALTER TABLE transcript_rows ADD COLUMN ts      TEXT NOT NULL DEFAULT '';

      -- REQ-ORCH-147 / REQ-SESSION-095: what the run records on the session it ran.
      ALTER TABLE sessions ADD COLUMN stop_reason          TEXT;
      ALTER TABLE sessions ADD COLUMN iterations_completed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN run_started_at       TEXT;
      -- REQ-SESSION-168: the aggregates, copied in on every save, never computed by a scan. Cost is a
      -- decimal string (ADR-0031): money is never a binary float.
      ALTER TABLE sessions ADD COLUMN tokens_input  INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN tokens_output INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN cost          TEXT NOT NULL DEFAULT '0';
      ALTER TABLE sessions ADD COLUMN tool_calls    INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN compressions  INTEGER NOT NULL DEFAULT 0;
      -- REQ-SESSION-074: the end-of-run summarisation, persisted beside the record.
      ALTER TABLE sessions ADD COLUMN summary_status   TEXT;
      ALTER TABLE sessions ADD COLUMN summary_severity TEXT;
      ALTER TABLE sessions ADD COLUMN summary_text     TEXT;
      -- REQ-ORCH-147: the todo state and the loop progress record, as documents carrying their own version.
      ALTER TABLE sessions ADD COLUMN todo     TEXT;
      ALTER TABLE sessions ADD COLUMN progress TEXT;

      -- REQ-SESSION-138: exactly once per session; the primary key IS the one-shot. Absence reads as an
      -- empty configuration snapshot (REQ-SESSION-036); no placeholder is ever created (REQ-SESSION-132).
      CREATE TABLE launch_audits (
        session_id  TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
        recorded_at TEXT NOT NULL,
        payload     TEXT NOT NULL
      );
      -- REQ-ORCH-139 / REQ-SESSION-087 / REQ-SESSION-094: the timeline, append-ordered by the writer's
      -- ordinal (ADR-0008 "Emission order"). No cap: REQ-SESSION-133 names none for it.
      CREATE TABLE timeline (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        ordinal    INTEGER NOT NULL,
        at         TEXT NOT NULL,
        name       TEXT NOT NULL,
        actor      TEXT NOT NULL,
        message    TEXT NOT NULL,
        metadata   TEXT NOT NULL,
        PRIMARY KEY (session_id, ordinal)
      );
    `,
  },
  {
    to: 4,
    // v4 lands with the permission gate and the first tools (ADR-0024's evidence rings, REQ-SESSION-133/135/136/137,
    // REQ-TOOLS-078/079/082, REQ-CHAT-046). NO new index: every query below is served by a primary key — ring reads
    // are ordered by (session_id, ordinal) and a settle names its ordinal. When a budgeted query needs one, declare
    // it and assert its plan in store.test.ts (spike 8's rule).
    sql: `
      -- REQ-CHAT-046: a tool row carries its call key, status, timing and the UNTRUNCATED input and output; an
      -- edit-diff row carries the structured diff. Text rows leave these null.
      ALTER TABLE transcript_rows ADD COLUMN tool_name      TEXT;
      ALTER TABLE transcript_rows ADD COLUMN tool_status    TEXT;
      ALTER TABLE transcript_rows ADD COLUMN call_key       TEXT;
      ALTER TABLE transcript_rows ADD COLUMN duration_ms    REAL;
      ALTER TABLE transcript_rows ADD COLUMN started_at     TEXT;
      ALTER TABLE transcript_rows ADD COLUMN input          TEXT;
      ALTER TABLE transcript_rows ADD COLUMN output         TEXT;
      ALTER TABLE transcript_rows ADD COLUMN diff           TEXT;
      ALTER TABLE transcript_rows ADD COLUMN blocked_reason TEXT;

      -- REQ-TOOLS-071 / REQ-TOOLS-060: the effective mode, the sandbox verdict, and the pending-approval mirror.
      ALTER TABLE sessions ADD COLUMN permission_mode   TEXT;
      ALTER TABLE sessions ADD COLUMN sandboxed         INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN pending_approvals TEXT NOT NULL DEFAULT '[]';

      -- ADR-0024: one writer per kind per session; the serialised entry VERBATIM in 'entry' (the columns beside
      -- it are indexes, never read back in its place); a per-session ordinal from a counter that is never reset and
      -- never reused after a displacement (ring_state). The permission audit and the issues record expose NO
      -- update path: the store refuses one (REQ-TOOLS-078 "never altered").
      CREATE TABLE permission_audit (
        session_id  TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        ordinal     INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        kind        TEXT NOT NULL,   -- 'decision' | 'mode_change' (REQ-TOOLS-082, interleaved in one series)
        entry       TEXT NOT NULL,
        agent_id    TEXT NOT NULL,
        persona     TEXT NOT NULL,
        tool_name   TEXT NOT NULL,
        decision    TEXT NOT NULL,
        rule_id     TEXT NOT NULL,
        source      TEXT NOT NULL,
        PRIMARY KEY (session_id, ordinal)
      );
      CREATE TRIGGER permission_audit_no_update BEFORE UPDATE ON permission_audit
        BEGIN SELECT RAISE(ABORT, 'permission_audit is append-only (REQ-TOOLS-078)'); END;

      -- REQ-SESSION-136: the tool-call evidence record, arguments UNREDACTED (never exported, REQ-TOOLS-190).
      -- Written at tool.start as 'running' and settled exactly once at tool.finish (the reading recorded on
      -- ADR-0024): the trigger refuses any second update and any change to the identity columns.
      CREATE TABLE tool_calls (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        ordinal    INTEGER NOT NULL,
        call_id    TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        tool_name  TEXT NOT NULL,
        status     TEXT NOT NULL,
        started_at TEXT NOT NULL,
        elapsed_ms REAL,
        is_error   INTEGER NOT NULL DEFAULT 0,
        entry      TEXT NOT NULL,
        PRIMARY KEY (session_id, ordinal)
      );
      CREATE TRIGGER tool_calls_settle_once BEFORE UPDATE ON tool_calls
        WHEN OLD.status <> 'running' OR NEW.status = 'running'
          OR NEW.session_id <> OLD.session_id OR NEW.ordinal <> OLD.ordinal OR NEW.call_id <> OLD.call_id
          OR NEW.agent_name <> OLD.agent_name OR NEW.tool_name <> OLD.tool_name OR NEW.started_at <> OLD.started_at
        BEGIN SELECT RAISE(ABORT, 'a tool-call record is settled exactly once (REQ-SESSION-136)'); END;

      -- REQ-SESSION-135: the issues record; 'id' is the 12-hex identifier a locator names.
      CREATE TABLE issues (
        session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        ordinal      INTEGER NOT NULL,
        id           TEXT NOT NULL,
        recorded_at  TEXT NOT NULL,
        kind         TEXT NOT NULL,
        severity     TEXT NOT NULL,
        actor        TEXT NOT NULL,
        message      TEXT NOT NULL,
        evidence_ref TEXT NOT NULL,
        metadata     TEXT NOT NULL,
        PRIMARY KEY (session_id, ordinal)
      );
      CREATE TRIGGER issues_no_update BEFORE UPDATE ON issues
        BEGIN SELECT RAISE(ABORT, 'issues is append-only (REQ-SESSION-135)'); END;

      -- REQ-SESSION-133: the ring's own state — the next ordinal (never reused), how many are held, and how many
      -- the cap has dropped, maintained in the SAME transaction as the insert that moved them.
      CREATE TABLE ring_state (
        session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        kind         TEXT NOT NULL,
        next_ordinal INTEGER NOT NULL,
        held         INTEGER NOT NULL,
        dropped      INTEGER NOT NULL,
        PRIMARY KEY (session_id, kind)
      );
    `,
  },
  {
    to: 5,
    // v5 lands with children and the scheduler (ADR-0012 under SR-4: the ledger is one row per child, written
    // through the session writer; every state change is one transaction with its child.transition event).
    // NO new index: every query names (session_id, task_id) or scans one session's children, which the
    // primary key serves; REQ-ORCH-151's isolation is a predicate — every statement over these tables
    // carries session_id, and a test reads the statements to say so.
    sql: `
      -- REQ-ORCH-043 / REQ-MONITOR-022: the persisted per-child record.
      CREATE TABLE children (
        session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        task_id           TEXT NOT NULL,
        canonical_name    TEXT NOT NULL,
        given_name        TEXT NOT NULL,
        persona           TEXT NOT NULL,
        state             TEXT NOT NULL,
        parent_id         TEXT NOT NULL,
        depth             INTEGER NOT NULL,
        iteration         INTEGER NOT NULL,
        launch_generation INTEGER NOT NULL DEFAULT 0,
        model_key         TEXT NOT NULL,
        category          TEXT NOT NULL DEFAULT '',
        background        INTEGER NOT NULL DEFAULT 1,
        task              TEXT NOT NULL,
        depends_on        TEXT NOT NULL DEFAULT '[]',
        inherited_context TEXT NOT NULL DEFAULT '[]',
        granted_tools     TEXT NOT NULL DEFAULT '[]',
        granted_mcp       TEXT NOT NULL DEFAULT '{}',
        todo              TEXT,
        spawned_at        TEXT NOT NULL,
        completed_at      TEXT,
        report            TEXT,
        report_stored     INTEGER NOT NULL DEFAULT 0,
        observed          INTEGER NOT NULL DEFAULT 0,
        context_injected  INTEGER NOT NULL DEFAULT 0,
        tool_calls        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, task_id)
      );
      -- REQ-ORCH-050 / REQ-MONITOR-020: held children per model key, released in the order they were held.
      CREATE TABLE model_slot_queue (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        model_key  TEXT NOT NULL,
        position   INTEGER NOT NULL,
        task_id    TEXT NOT NULL,
        PRIMARY KEY (session_id, model_key, position)
      );
    `,
  },
  {
    to: 6,
    // v6 lands with the control channel (Part J): queued prompts as a session-owned table (REQ-CHAT-038/039/041,
    // REQ-MONITOR-139) and the message-limit pause on the session row (REQ-ORCH-084/085/087, REQ-SESSION-107/110).
    // NO new index: every statement names (session_id, prompt_id) or scans one session's prompts.
    sql: `
      CREATE TABLE queued_prompts (
        session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        prompt_id    TEXT NOT NULL,
        position     INTEGER NOT NULL,
        content      TEXT NOT NULL,
        status       TEXT NOT NULL,
        created_at   TEXT NOT NULL,
        triggered_at TEXT,
        PRIMARY KEY (session_id, prompt_id)
      );
      -- REQ-ORCH-084: the limit in force for the session (null = disabled); REQ-ORCH-087: the count reached while paused at it.
      ALTER TABLE sessions ADD COLUMN message_limit   INTEGER;
      ALTER TABLE sessions ADD COLUMN paused_at_count INTEGER;
    `,
  },
  {
    to: 7,
    // v7 lands with the Overview view (Part M): REQ-MONITOR-166's token history, sampled by the run every 10 s while
    // live and once at the terminal save, the most recent 120 kept, persisted with the session so the sparkline is
    // the same when the session is reopened. A JSON array of [at, total] pairs. NO new index: read with the row.
    sql: `
      ALTER TABLE sessions ADD COLUMN token_samples TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    to: 8,
    // v8 lands with the Git view and worktrees (Part O): REQ-GIT-015's binding as one JSON value on the session row —
    // NULL is "no worktree" (REQ-GIT-017: a row written before worktrees existed loads as an absence, nothing invented)
    // — and REQ-SHELL-125's sandbox mode as chosen at launch (recorded, not honoured: ADR-0022). NO new index: both are
    // read with the row; a listing still reads listing records only (REQ-GIT-018, REQ-SESSION-042).
    sql: `
      ALTER TABLE sessions ADD COLUMN worktree     TEXT;
      ALTER TABLE sessions ADD COLUMN sandbox_mode TEXT NOT NULL DEFAULT 'off';
    `,
  },
  {
    to: 9,
    // v9 lands with checkpoints (Part P, ADR-0039 "The checkpoint index is a table"): one row per checkpoint keyed by
    // session and sequence with REQ-GIT-016's field set unchanged — `files` as one serialised value (consequence 7),
    // `kind` its own column because listing and retention read it — and REQ-SESSION-195 / REQ-GIT-155's
    // `last_restored_sequence` on the session row, absent by default. `checkpoint_count` is derived, never stored twice.
    // NO new index: the listing is `ORDER BY sequence` under the primary key (a plan the store test asserts, spike 8's rule).
    sql: `
      CREATE TABLE checkpoints (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        sequence   INTEGER NOT NULL,
        ref        TEXT NOT NULL,
        commit_id  TEXT NOT NULL,
        created_at TEXT NOT NULL,
        iteration  INTEGER NOT NULL DEFAULT 0,
        child_name TEXT NOT NULL DEFAULT '',
        files      TEXT NOT NULL DEFAULT '[]',
        kind       TEXT NOT NULL DEFAULT 'iteration',
        PRIMARY KEY (session_id, sequence)
      );
      ALTER TABLE sessions ADD COLUMN last_restored_sequence INTEGER;
    `,
  },
  {
    to: 10,
    // v10 repairs the thirty-second first-execution defect (Part U, ADR-0024 note "defect 42"): `REQ-SESSION-134`
    // fixes the timeline entry's shape with an `id` of 12 hex characters and a `severity` from `debug|info|warning|
    // error` defaulting to `info`, and the table held neither, so the record could not yield them and the export of
    // `REQ-SESSION-199` carried the ordinal as the entry's position and no severity at all.
    //
    // A row written before this version keeps the empty id it is given here rather than being handed a minted one:
    // an identifier the record never had is not recovered by inventing it afterwards, and `REQ-SESSION-199` requires
    // the export to carry an identifier for every entry "that has one" — so an empty id reads as an absence and the
    // export omits the field (the same discipline as v8's NULL worktree, REQ-GIT-017). The severity default is the
    // requirement's own default and not an invention, so an old row reads `info` exactly as a new one that names none.
    // NO new index: the timeline is read whole per session under `(session_id, ordinal)`; neither column is a predicate.
    sql: `
      ALTER TABLE timeline ADD COLUMN id       TEXT NOT NULL DEFAULT '';
      ALTER TABLE timeline ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';
    `,
  },
  {
    to: 11,
    // v11 lands with the Library's Prompts tab (Part X): the saved prompt history and the prompt stash
    // (REQ-LIBRARY-137/138/139, REQ-CHAT-045). Workspace-scoped and NOT session-scoped — saved prompts outlive
    // every session, so neither table references `sessions` and neither is touched by REQ-SESSION-166's delete.
    //
    // ONE ROW PER ENTRY, and the reason is a sentence of the requirement rather than a preference: REQ-LIBRARY-138
    // says "persisting one entry MUST NOT require rewriting the others", and one JSON list per column would fail
    // that sentence on every write. ADR-0042's earlier reading — both lists as one pretty-printed JSON document at
    // `<workspace>/.rotaris/rotaris-prompts.json`, byte-exact — is FALSIFIED and kept beside this replacement:
    // REQ-CHAT-045 was amended to defer the question to REQ-LIBRARY-138 and now fixes no path, no file name and no
    // document format, and REQ-LIBRARY-138 names the workspace's durable store. The ADR carries the same note.
    //
    // `seq` is the entry's arrival order and its identity; the newest entry is the highest `seq`, so a
    // front-insertion is an INSERT and nothing already stored moves. AUTOINCREMENT so a displaced `seq` is never
    // handed to a later entry — REQ-LIBRARY-139's caps delete the lowest rows, and a reused number would make
    // "newest first" ambiguous after a trim. NO index: both readers are `ORDER BY seq DESC LIMIT <cap>` over one
    // small table, which the INTEGER PRIMARY KEY serves in reverse with no sort (a plan `store.test.ts` asserts,
    // spike 8's rule).
    sql: `
      CREATE TABLE prompt_history ( seq INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at TEXT NOT NULL );
      CREATE TABLE prompt_stash   ( seq INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at TEXT NOT NULL );
    `,
  },
  {
    to: 12,
    // v12 lands with the session artifact store (Part Y; REQ-LIBRARY-087/088, REQ-ORCH-149). v11 is the saved-prompt
    // tables' (Part X); the list is append-only and the two numbers were reserved before either was written.
    //
    // REQ-LIBRARY-087 asks for "one full record per artifact together with a metadata entry in an index ordered by
    // creation time … written together as one indivisible step". The falsified reading, kept beside its replacement:
    // that sentence was written when artifacts were files, and reads there as a record document plus a separate index
    // document whose two writes have to be made atomic by hand. On rows it is ONE table row and its DECLARED index,
    // maintained by the engine inside the same transaction as the insert — so "no reader ever finds a record without
    // its index entry" is a property of the store rather than of a caller's discipline, and there is no second
    // document to keep in step. `artifacts_by_created` IS that index, ordered by creation time as the requirement
    // words it; `store.test.ts` asserts the listing's query plan uses it (spike 8's rule).
    //
    // The BODY is never a column (REQ-LIBRARY-087, REQ-SESSION-002): `body_file` holds the file's NAME, not a path,
    // because the directory is resolved from the store's own location at read time — REQ-SESSION-198 keeps the store
    // machine-local and a stored absolute path would not survive the profile it lives in moving.
    //
    // `slug` is UNIQUE per session, so REQ-LIBRARY-088's `-2`, `-3` uniquification is enforced where the rows are
    // rather than trusted to whoever mints one. `status` carries NO check constraint: REQ-LIBRARY-088 forms that set
    // from REQ-ORCH-112's plus `published`, and a CHECK would be a second copy that stops widening when that
    // requirement widens. Validation lives with the vocabulary (`contracts/artifacts.ts`) and hydration skips a row
    // that fails it (REQ-LIBRARY-091).
    sql: `
      CREATE TABLE artifacts (
        session_id        TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        id                TEXT NOT NULL,
        slug              TEXT NOT NULL,
        title             TEXT NOT NULL,
        kind              TEXT NOT NULL,
        source_task_id    TEXT,
        canonical_name    TEXT,
        source_persona    TEXT,
        status            TEXT NOT NULL,
        summary           TEXT NOT NULL DEFAULT '',
        key_findings      TEXT NOT NULL DEFAULT '',
        highlight_paths   TEXT NOT NULL DEFAULT '[]',
        snippets          TEXT NOT NULL DEFAULT '[]',
        edited_files      TEXT NOT NULL DEFAULT '[]',
        created_files     TEXT NOT NULL DEFAULT '[]',
        tags              TEXT NOT NULL DEFAULT '[]',
        supersedes        TEXT,
        superseded_by     TEXT,
        created_by        TEXT NOT NULL DEFAULT '',
        consumed_by       TEXT NOT NULL DEFAULT '[]',
        timeline_event_id TEXT,
        conversation_id   TEXT,
        importance        TEXT NOT NULL DEFAULT 'normal',
        created_at        TEXT NOT NULL,
        edited_at         TEXT,
        body_file         TEXT NOT NULL,
        PRIMARY KEY (session_id, id),
        UNIQUE (session_id, slug)
      );
      -- REQ-LIBRARY-087's index: the metadata entry, ordered by creation time. REQ-LIBRARY-096 sorts ascending by it
      -- and REQ-LIBRARY-097 reads the same order reversed; \`id\` last so a tie is broken and the order is total.
      CREATE INDEX artifacts_by_created ON artifacts(session_id, created_at, id);
    `,
  },
  {
    to: 13,
    // v13 lands with the composer (Part AB): REQ-CHAT-038's "optional context snapshot" on the queued prompt, which the
    // table has never held, and which REQ-CHAT-039 makes load-bearing — "ownership may come from an explicit session id
    // OR from a `session_id` key in the context snapshot". Without a column the second route has nothing to read and the
    // requirement could only be half-quoted. One nullable JSON text column; NULL is "no snapshot was supplied", which is
    // every prompt written before this migration and every prompt the composer queues.
    //
    // NO new index and NO new statement shape: every reader still names `(session_id, prompt_id)` or scans one session's
    // prompts, and the QUEUED → TRIGGERED move is the same one conditional UPDATE whose row count is the claim
    // (REQ-CHAT-038). Ownership is the primary key's first column and NOTHING updates it, which is how "ownership MUST be
    // preserved across edit and trigger" is a property of the schema rather than of a caller's discipline.
    //
    // **What this migration deliberately does NOT do.** REQ-CHAT-038 admits an UNSCOPED prompt ("empty = unscoped") that
    // any run may consume. `session_id` is `TEXT NOT NULL REFERENCES sessions(session_id)` and has been since v6, so no
    // such row can exist; and on 2026-09-07 the owner amended REQ-CHAT-041 to "one session-scoped queue" per application
    // instance without amending 039 alongside it. Whether an unscoped prompt still exists is OQ-51, raised against
    // REQ-CHAT-039 rather than decided here; dropping the NOT NULL would be deciding it.
    sql: `
      ALTER TABLE queued_prompts ADD COLUMN context_snapshot TEXT;
    `,
  },
  {
    to: 14,
    // REQ-CHAT-046/173: ordered attachment metadata belongs to the user row. Bytes live under the session files
    // directory; the JSON stores relative path, media type, size and SHA-256 digest only.
    sql: `
      ALTER TABLE transcript_rows ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    to: 15,
    // v15 lands with the delivery store (Part AK; ADR-0041's first execution; REQ-CONFIG-192, REQ-TRACE-382..405,
    // REQ-TRACE-464, REQ-TRACE-476). Every table is WORKSPACE-scoped and references `sessions` in no column: a delivery
    // record outlives every session (REQ-CONFIG-192 "operational records only"), and a run row names its session by id
    // as a fact about the run, not as a foreign key a session delete may cascade through (REQ-TRACE-476: "its worktree,
    // its branch and its partial output SHALL all be kept").
    //
    // Three commitments of ADR-0041 §"Forward-tolerant records survive the move" are the SHAPE of the `delivery` table
    // and not a preference: (1) `schema_version` is the RECORD's, carried on the row and read back as it was stored —
    // the column has no NOT NULL, no DEFAULT and no CHECK, so a value below 1, absent or not an integer sits there and
    // reads as "unreadable" (REQ-CONFIG-192) rather than being coerced into something the build can interpret; (2) the
    // record body is ONE opaque serialised value (`body`), decoded only once the version is supported, so a record a
    // later build wrote is storable, reportable and untouched; the columns beside it are exactly what the store must
    // query on — the identifier and the delivery state — plus the two hashes REQ-TRACE-387/402 compare and the
    // origin state REQ-TRACE-233 returns a blocked requirement to; (3) no write on read, anywhere: no statement in
    // the DAL updates a row it did not transition.
    //
    // `transitions_ever` is ADR-0041 commitment 3 (consequence 8): a monotonic count of transitions ever recorded per
    // requirement, incremented in the SAME transaction that appends the history entry and applies REQ-CONFIG-192's
    // 200-entry prune (a DELETE), so REQ-TRACE-405's "how many were dropped" is the counter minus the retained rows
    // and can never disagree with the rows it describes. An implementer who finds it unused will find this sentence.
    //
    // `delivery_audit` is append-only by trigger, on `permission_audit`'s terms (REQ-TRACE-405: "no state-changing
    // action SHALL complete without leaving such a record"; REQ-TRACE-401: an override is marked as one and stays
    // visible). It is one series for the workspace, ordered by its own rowid, and interleaves every requirement's
    // transitions in the order they were admitted (ADR-0041 §"Ordering guarantees are still ours to state").
    //
    // NO new index: every reader names `req_id`, the first column of every composite primary key, and the history
    // prune is `DELETE … WHERE req_id = ? AND seq <= ?`, which the same key serves. `delivery.test.ts` asserts both
    // plans (spike 8's rule). NO queue table: REQ-TRACE-480's two persisted controls belong to the workspace
    // configuration (`requirements.scheduling.*`, REQ-CONFIG-196), which Part AP registers; until then they are
    // in-memory defaults in the service, and a stop is never persisted anywhere by requirement.
    sql: `
      CREATE TABLE delivery (
        req_id           TEXT PRIMARY KEY,
        schema_version,
        state            TEXT NOT NULL,
        return_to        TEXT,
        accepted_hash    TEXT,
        snapshot_hash    TEXT,
        transitions_ever INTEGER NOT NULL DEFAULT 0,
        updated_at       TEXT NOT NULL,
        body             TEXT NOT NULL
      );
      CREATE TABLE delivery_history (
        req_id     TEXT NOT NULL,
        seq        INTEGER NOT NULL,
        at         TEXT NOT NULL,
        action     TEXT NOT NULL,
        actor      TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state   TEXT NOT NULL,
        hash       TEXT NOT NULL,
        reason     TEXT,
        override   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (req_id, seq)
      );
      CREATE TABLE delivery_audit (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        at         TEXT NOT NULL,
        req_id     TEXT NOT NULL,
        action     TEXT NOT NULL,
        actor      TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state   TEXT NOT NULL,
        hash       TEXT NOT NULL,
        reason     TEXT,
        override   INTEGER NOT NULL DEFAULT 0
      );
      CREATE TRIGGER delivery_audit_no_update BEFORE UPDATE ON delivery_audit
        BEGIN SELECT RAISE(ABORT, 'delivery_audit is append-only (REQ-TRACE-405)'); END;
      CREATE TABLE delivery_runs (
        req_id       TEXT NOT NULL,
        unit         TEXT NOT NULL,
        session_id   TEXT,
        worktree_ref TEXT,
        permissions  TEXT NOT NULL DEFAULT '',
        status       TEXT NOT NULL,
        stage        TEXT,
        outcome      TEXT,
        started_at   TEXT NOT NULL,
        ended_at     TEXT,
        PRIMARY KEY (req_id, unit)
      );
      CREATE TABLE delivery_worktrees (
        ref        TEXT PRIMARY KEY,
        req_id     TEXT NOT NULL,
        unit       TEXT NOT NULL,
        path       TEXT NOT NULL,
        branch     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        kept       INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE delivery_blockers (
        req_id       TEXT NOT NULL,
        seq          INTEGER NOT NULL,
        kind         TEXT NOT NULL,
        reason       TEXT NOT NULL,
        options      TEXT NOT NULL DEFAULT '[]',
        blocking_ids TEXT NOT NULL DEFAULT '[]',
        run_unit     TEXT,
        raised_at    TEXT NOT NULL,
        answered_at  TEXT,
        answer       TEXT,
        PRIMARY KEY (req_id, seq)
      );
      CREATE TABLE delivery_tombstones (
        req_id     TEXT PRIMARY KEY,
        retired_at TEXT NOT NULL,
        last_hash  TEXT
      );
    `,
  },
  {
    to: 16,
    // PD-LIBRARY-001: the commands a child ran, on the record that materialises its report. The column is
    // NOT NULL DEFAULT '[]' like every other serialised list here, so a record written before this migration
    // reads back as "ran no commands" rather than as the parse failure REQ-LIBRARY-091 would skip the record
    // for. That is the honest reading: the figure was never captured for those rows and cannot be recovered,
    // and REQ-LIBRARY-090 omits an empty section entirely, so an older artifact renders exactly as it did
    // rather than growing an empty heading that would claim the child ran nothing.
    sql: `
      ALTER TABLE artifacts ADD COLUMN commands TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    to: 17,
    /*
     * REQ-ORCH-154 (ADR-0062): "Every plan cycle, the decision taken, and the text that was approved MUST be
     * recorded in the session's durable record." One row per cycle, never rewritten in place: `plan` is the text
     * the producing role wrote, VERBATIM, and `edited` is the user's own, NULL until they edit one — the two kept
     * apart is what makes REQ-ORCH-154's "editing alone never approves it" structural, and what lets a window
     * closed mid-edit reopen on both.
     *
     * On the session: `plan_cycle` names the cycle awaiting an answer (NULL = none), which together with
     * `execution_status = 'awaiting_plan_decision'` is what survives a restart on the same terms as
     * `paused_at_count` does for a message-limit pause (REQ-ORCH-087). `plan_released` is REQ-ORCH-154's one-way
     * approval across a process boundary: set once approval releases execution, read at every launch, cleared
     * only by the next user prompt — because a change to the mode setting "takes effect only for the next run".
     */
    sql: `
      CREATE TABLE plan_cycles (
        session_id TEXT NOT NULL,
        cycle      INTEGER NOT NULL,
        opened_at  TEXT NOT NULL,
        plan       TEXT NOT NULL,
        intent     TEXT NOT NULL,
        todo       TEXT NOT NULL DEFAULT '',
        changes    TEXT NOT NULL DEFAULT '',
        edited     TEXT,
        decision   TEXT,
        decided_at TEXT,
        PRIMARY KEY (session_id, cycle)
      );
      ALTER TABLE sessions ADD COLUMN plan_cycle    INTEGER;
      ALTER TABLE sessions ADD COLUMN plan_released INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    to: 18,
    /*
     * ADR-0061 / REQ-LIBRARY-002, 036, 042..054. The artifact row is the current workspace-scoped
     * state. `versions_due` is allocated in the same transaction as every current-state write, while
     * immutable version rows and `versions_pruned` are committed together by the following best-effort
     * operation. A gap between due and retained+pruned rows is therefore a version that was never recorded.
     *
     * Session association stays on the durable session snapshot. The source session column on the artifact
     * remains deliberately free of a foreign key because REQ-LIBRARY-042 says the workspace artifact outlives
     * the session that produced it.
     */
    sql: `
      ALTER TABLE sessions ADD COLUMN run_type TEXT NOT NULL DEFAULT 'task_run'
        CHECK (run_type IN ('task_run', 'improvement_run', 'integration_run'));
      ALTER TABLE sessions ADD COLUMN improvement_artifact_ids TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE improvement_artifacts (
        artifact_id       TEXT PRIMARY KEY,
        source_session_id TEXT NOT NULL,
        source_run_type   TEXT NOT NULL,
        generated_at      TEXT NOT NULL,
        body              TEXT NOT NULL,
        versions_due      INTEGER NOT NULL DEFAULT 0 CHECK (versions_due >= 0),
        versions_pruned   INTEGER NOT NULL DEFAULT 0 CHECK (versions_pruned >= 0)
      );
      CREATE INDEX improvement_artifacts_newest
        ON improvement_artifacts(generated_at DESC, artifact_id ASC);
      CREATE INDEX improvement_artifacts_by_session
        ON improvement_artifacts(source_session_id, generated_at DESC, artifact_id ASC);

      CREATE TABLE improvement_artifact_versions (
        artifact_id TEXT NOT NULL REFERENCES improvement_artifacts(artifact_id) ON DELETE CASCADE,
        version     INTEGER NOT NULL CHECK (version >= 1),
        recorded_at TEXT NOT NULL,
        cause       TEXT NOT NULL,
        body        TEXT NOT NULL,
        PRIMARY KEY (artifact_id, version)
      );
    `,
  },
  {
    to: 19,
    /*
     * ADR-0065 / PD-LIBRARY-002. A retrospective belongs to no session, so the source column is relaxed to
     * NULL and `source_kind` says which pass wrote the row. SQLite cannot drop a NOT NULL in place, so both
     * tables are rebuilt — inside the one transaction `migrateStore` already wraps a migration in, which is
     * why a crash here leaves v18 whole rather than half of v19. Every existing row is a post-run artifact by
     * construction, because no other writer existed.
     *
     * The CHILD is copied and dropped FIRST, and that order is the whole point: `foreign_keys` is ON for the
     * migration (`migrateStore`), a pragma cannot be changed inside a transaction, and `DROP TABLE` on a
     * parent under an enforced `ON DELETE CASCADE` performs an implicit delete that would take every recorded
     * version with it (REQ-LIBRARY-162's history). With the child already gone the cascade has nothing to
     * find. Renaming the new parent rewrites the FK clause the new child carries, so the child ends up
     * referencing `improvement_artifacts` under its own name again.
     *
     * Both indexes are recreated with their v18 definitions. `improvement_artifacts_by_session` keeps serving
     * REQ-LIBRARY-045's by-session query; a retrospective row holds NULL there and can never match it, which
     * is the point — it is not any session's artifact.
     */
    sql: `
      CREATE TABLE improvement_artifacts_v19 (
        artifact_id       TEXT PRIMARY KEY,
        source_session_id TEXT,
        source_kind       TEXT NOT NULL DEFAULT 'post_run'
          CHECK (source_kind IN ('post_run', 'retrospective')),
        source_run_type   TEXT NOT NULL,
        generated_at      TEXT NOT NULL,
        body              TEXT NOT NULL,
        versions_due      INTEGER NOT NULL DEFAULT 0 CHECK (versions_due >= 0),
        versions_pruned   INTEGER NOT NULL DEFAULT 0 CHECK (versions_pruned >= 0),
        CHECK (source_kind <> 'post_run' OR source_session_id IS NOT NULL)
      );
      INSERT INTO improvement_artifacts_v19
        (artifact_id, source_session_id, source_kind, source_run_type, generated_at, body, versions_due, versions_pruned)
        SELECT artifact_id, source_session_id, 'post_run', source_run_type, generated_at, body, versions_due, versions_pruned
        FROM improvement_artifacts;

      CREATE TABLE improvement_artifact_versions_v19 (
        artifact_id TEXT NOT NULL REFERENCES improvement_artifacts_v19(artifact_id) ON DELETE CASCADE,
        version     INTEGER NOT NULL CHECK (version >= 1),
        recorded_at TEXT NOT NULL,
        cause       TEXT NOT NULL,
        body        TEXT NOT NULL,
        PRIMARY KEY (artifact_id, version)
      );
      INSERT INTO improvement_artifact_versions_v19 (artifact_id, version, recorded_at, cause, body)
        SELECT artifact_id, version, recorded_at, cause, body FROM improvement_artifact_versions;

      DROP TABLE improvement_artifact_versions;
      DROP INDEX improvement_artifacts_newest;
      DROP INDEX improvement_artifacts_by_session;
      DROP TABLE improvement_artifacts;

      ALTER TABLE improvement_artifacts_v19 RENAME TO improvement_artifacts;
      ALTER TABLE improvement_artifact_versions_v19 RENAME TO improvement_artifact_versions;

      CREATE INDEX improvement_artifacts_newest
        ON improvement_artifacts(generated_at DESC, artifact_id ASC);
      CREATE INDEX improvement_artifacts_by_session
        ON improvement_artifacts(source_session_id, generated_at DESC, artifact_id ASC);
    `,
  },
  {
    to: 20,
    /*
     * REQ-SESSION-166 / REQ-ORCH-154. `plan_cycles` (v17) was the one session-scoped table whose
     * `session_id` carried no foreign key, so a session delete removed the transcript, the artifacts,
     * the checkpoints and the audit — and kept the VERBATIM plan text indefinitely, keyed by a session
     * id that no longer names a row. SQLite cannot add a foreign key in place, so v20 rebuilds the
     * table with `REFERENCES sessions(session_id) ON DELETE CASCADE` and copies only the rows whose
     * session still exists: dropping the already-orphaned ones IS the delete the user asked for, and
     * nothing requires `plan_cycles` to outlive its session (the ruled exception is `delivery_runs`,
     * REQ-TRACE-476, which this migration does not touch). The table has no child of its own, so the
     * child-first order v19 needed does not apply; the rebuild still runs inside the one transaction
     * `migrateStore` wraps a migration in, with `foreign_keys` ON.
     */
    sql: `
      CREATE TABLE plan_cycles_v20 (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        cycle      INTEGER NOT NULL,
        opened_at  TEXT NOT NULL,
        plan       TEXT NOT NULL,
        intent     TEXT NOT NULL,
        todo       TEXT NOT NULL DEFAULT '',
        changes    TEXT NOT NULL DEFAULT '',
        edited     TEXT,
        decision   TEXT,
        decided_at TEXT,
        PRIMARY KEY (session_id, cycle)
      );
      INSERT INTO plan_cycles_v20
        (session_id, cycle, opened_at, plan, intent, todo, changes, edited, decision, decided_at)
        SELECT session_id, cycle, opened_at, plan, intent, todo, changes, edited, decision, decided_at
        FROM plan_cycles WHERE session_id IN (SELECT session_id FROM sessions);
      DROP TABLE plan_cycles;
      ALTER TABLE plan_cycles_v20 RENAME TO plan_cycles;
    `,
  },
  {
    to: 21,
    /*
     * PD-MONITOR-001 revision 2 (R-049) / REQ-MONITOR-166: the qualifier a run's cost total earned — `unknown`,
     * `incomplete`, `reported` or `configured` — recorded beside the total, because the label can no longer be read
     * off the amount alone once a total may rest on configured rates. A row written before this version could only
     * have held figures the provider reported (revision 1 multiplied no rate), so a total with any non-zero digit is
     * backfilled `reported`, which is the label it already showed, and every other row stays `unknown`. The test is
     * on the decimal string's digits, so no amount is compared in floating point here either.
     */
    sql: `
      ALTER TABLE sessions ADD COLUMN cost_qualifier TEXT NOT NULL DEFAULT 'unknown'
        CHECK (cost_qualifier IN ('unknown', 'incomplete', 'reported', 'configured'));
      UPDATE sessions SET cost_qualifier = 'reported' WHERE cost GLOB '*[1-9]*';
    `,
  },
  {
    to: 22,
    /*
     * PD-ORCH-004 (R-057): "A child delegated as a continuation carries that relationship in its record." The task id of
     * the child it continues, NULL for every other child — which is also what a row written before this version reads
     * as, since no continuation existed then. NO new index: the one reader (the admission check that a piece of work is
     * continued once) scans one session's children, which the primary key already serves.
     */
    sql: `
      ALTER TABLE children ADD COLUMN continuation_of TEXT;
    `,
  },
  {
    to: 23,
    /*
     * PD-ORCH-005 revisions 2 and 3 (R-060, R-061), with PD-TOOLS-006 revision 2 (R-059): the record a paused, stopped,
     * quit or crashed run is resumed from.
     *
     * This migration lands ahead of most of its writers, which is the one exception to the rule stated at the top of
     * this file: PD-ORCH-005 is built in phases on one branch, the schema first, and every table and column here gains its
     * writer in a later phase of the same build, before the build reaches `main`. Its shape was settled against every
     * clause before it was appended (OQ-95, on clause 1's record, aside), because once it ships it is never edited.
     *
     * On `children`: `interruption` is what left the agent `paused` (`pause | stop | quit | crash`, NULL for an agent that
     * is not paused), `resume_state` the state it moves back into when its iteration resumes (REQ-MONITOR-300 narrowed:
     * `queued | waiting_on_dependencies | waiting_on_model_slot | running | summarizing`), and `write_scope` the patterns it
     * declared, which a resumed child claims again (PD-TOOLS-006 revision 2) — `'[]'` for every row written before this
     * version, which is what a child that declared nothing reads as, and true of them: no row before this version could be
     * resumed. The writer keeps `interruption` and `resume_state` set or cleared together.
     *
     * `iterations`: one row per execution iteration, carrying the ROOT's task id and canonical name (clause 1: "the root's
     * task id is recorded with its iteration") and the todo task it works on (`todo_task_id`, a todo item's id — not a
     * child's `bg_` task id, REQ-ORCH-036). An iteration opens when it begins and closes when it ends; a pause, a stop, a
     * quit and a crash leave it open (clause 2), and it is resumed from here. At most one is open per session, which the
     * partial unique index enforces rather than trusts. A plan cycle is not an iteration (REQ-ORCH-153's ruling) and has
     * no row: it runs while the plan gate holds, where clause 11 refuses a pause and has a quit record no interruption (a
     * stop or a crash during one is the interruption phase's open question). `interruption` is the last interruption while
     * open, cleared when the iteration resumes; `outcome` is the run loop's iteration outcome at close (REQ-ORCH-073/135).
     *
     * `agent_messages`: every agent's conversation, appended as it happens (clause 1) under the agent's task id — the
     * root's and every child's. `kind = 'message'` is one message; `kind = 'replacement'` is a compression, whose body is
     * the whole conversation that replaced the one before it (clause 12: "a compression is written into the record"),
     * so a resume reads from an agent's last replacement forward and the full history stays in the table. `iteration`
     * is what the transcript clear reads: it removes the records of closed iterations and keeps an open one's.
     *
     * `agent_terminals`: the background terminal sessions an agent started (clause 10), what became of each and the last
     * output recorded for it, so a resumed agent can be told — after a quit or a crash, when the process that held them
     * is gone. `state` is REQ-TOOLS-109's closed vocabulary (`running | completed | failed | killed | timeout`) with the
     * three ways a rest ends a session beside it (`stop | quit | crash`).
     *
     * Every table cascades with its session: the record is deleted with it (clause 12). Every read is a primary-key prefix
     * except the terminal listing's order by start time over one session's few rows; the one index is the constraint.
     */
    sql: `
      ALTER TABLE children ADD COLUMN interruption TEXT
        CHECK (interruption IS NULL OR interruption IN ('pause', 'stop', 'quit', 'crash'));
      ALTER TABLE children ADD COLUMN resume_state TEXT
        CHECK (resume_state IS NULL OR resume_state IN ('queued', 'waiting_on_dependencies', 'waiting_on_model_slot', 'running', 'summarizing'));
      ALTER TABLE children ADD COLUMN write_scope TEXT NOT NULL DEFAULT '[]';

      CREATE TABLE iterations (
        session_id          TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        iteration           INTEGER NOT NULL CHECK (iteration >= 1),
        root_task_id        TEXT NOT NULL,
        root_canonical_name TEXT NOT NULL,
        root_persona        TEXT NOT NULL,
        todo_task_id        TEXT NOT NULL,
        task                TEXT NOT NULL,
        state               TEXT NOT NULL CHECK (state IN ('open', 'closed')),
        outcome             TEXT CHECK (outcome IS NULL OR outcome IN ('succeeded', 'failed', 'partial', 'cancelled', 'abandoned')),
        interruption        TEXT CHECK (interruption IS NULL OR interruption IN ('pause', 'stop', 'quit', 'crash')),
        opened_at           TEXT NOT NULL,
        closed_at           TEXT,
        PRIMARY KEY (session_id, iteration)
      );
      CREATE UNIQUE INDEX iterations_one_open ON iterations(session_id) WHERE state = 'open';

      CREATE TABLE agent_messages (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        task_id    TEXT NOT NULL,
        seq        INTEGER NOT NULL,
        iteration  INTEGER NOT NULL,
        kind       TEXT NOT NULL CHECK (kind IN ('message', 'replacement')),
        body       TEXT NOT NULL,
        at         TEXT NOT NULL,
        PRIMARY KEY (session_id, task_id, seq)
      );

      CREATE TABLE agent_terminals (
        session_id  TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        terminal_id TEXT NOT NULL,
        task_id     TEXT NOT NULL,
        command     TEXT NOT NULL,
        started_at  TEXT NOT NULL,
        state       TEXT NOT NULL CHECK (state IN ('running', 'completed', 'failed', 'killed', 'timeout', 'stop', 'quit', 'crash')),
        exit_code   INTEGER,
        output_tail TEXT NOT NULL DEFAULT '',
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (session_id, terminal_id)
      );
    `,
  },
  {
    to: 24,
    /*
     * PD-ORCH-005 revision 4 clause 14 (R-064, built under R-065): "Each agent's record SHALL also keep a fingerprint of the
     * system instructions and the tool definitions the agent started with."
     *
     * `agent_fingerprints`: one row per agent, the root's and every child's, keyed as its conversation is in
     * `agent_messages` (session, task id), so the fingerprint sits beside the agent's record. `instructions` and `tools` are
     * SHA-256 digests (hex) of the system prompt and of the tool definitions the agent's first model request carried — a
     * digest, not a second copy of the instructions (REQ-SESSION-029). The first is kept: a resume compares against what
     * the agent started with, and the writer never replaces a row (OQ-105). `iteration` is what clause 12's transcript clear
     * reads, as it is for the conversation: it removes the fingerprints of closed iterations with their records. An agent
     * recorded before this version has none, and a resume of it records one and states nothing (REQ-SESSION-132).
     *
     * The table cascades with its session (clause 12). Every read is the primary key.
     */
    sql: `
      CREATE TABLE agent_fingerprints (
        session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        task_id      TEXT NOT NULL,
        iteration    INTEGER NOT NULL,
        instructions TEXT NOT NULL,
        tools        TEXT NOT NULL,
        at           TEXT NOT NULL,
        PRIMARY KEY (session_id, task_id)
      );
    `,
  },
  {
    to: 25,
    /*
     * REQ-TOOLS-152 (R-067): "`suppress_auto_context` — omits the automatic index of prior sibling artifacts". The flag a
     * `delegate` call carried is stored with the child's record, as its `write_scope` is (PD-TOOLS-006 revision 2), so every
     * assembly of the child's payload reads it: its first, REQ-ORCH-088's retry, and a resumed child's retry in a later run,
     * whose launch-time memory is gone. `1` omits the index; `0` — every row written before this version, and true of them:
     * no call before this version could set it — gives it. The persona-level setting (REQ-CONFIG-107,
     * `skip_auto_sibling_context`) is configuration, read at each assembly, and is not copied here.
     */
    sql: `
      ALTER TABLE children ADD COLUMN suppress_auto_context INTEGER NOT NULL DEFAULT 0 CHECK (suppress_auto_context IN (0, 1));
    `,
  },
  {
    to: 26,
    /*
     * REQ-MONITOR-102 (R-067, the repair of `a-roots-calls-before-a-crash-never-reach-the-session-total.md`): "Per-agent
     * metrics are persisted with the session and comprise: tool-call count" — and a session-wide total "counts each call
     * once". A child's count is its row's `tool_calls`; the root's had no persisted count of its own, so a crash, which ends
     * the root's turn without returning, left no record of which of its recorded calls the total already held, and the
     * crash record could not add the rest without counting some twice.
     *
     * `root_tool_calls` is that count: the calls of the iteration's root the session total holds. It is raised where the
     * root's calls join the total — when its turn returns (REQ-ORCH-097's cadence, unchanged), in the same transaction as
     * the total — and by the crash record, which adds the calls the root's record shows that the column does not. Every
     * iteration inserted from this version starts at `0`. A row written before it is NULL — not known — and the crash
     * record adds nothing for such a root, as before: it cannot tell which of its calls an earlier run counted.
     */
    sql: `
      ALTER TABLE iterations ADD COLUMN root_tool_calls INTEGER CHECK (root_tool_calls IS NULL OR root_tool_calls >= 0);
    `,
  },
  {
    to: 27,
    /*
     * PD-ORCH-005 clause 3 (R-067, OQ-103's last question ruled; the repair of
     * `a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`): the cancel control's agents "end
     * `cancelled` as today, and those are never resumed" — REQ-MONITOR-126, "cannot be undone in this session". The run-level
     * explicit cancel ended its agents only in the run's teardown, so a host that died before the teardown left a store no
     * different from any mid-run crash's, and the next continue resumed what the user had cancelled.
     *
     * `cancel_accepted_at` is the durable mark: the instant the explicit cancel was accepted while this iteration was open,
     * written when it is accepted, before anything of it is carried out. The run's own close of the iteration leaves it as
     * it is, a closed row's mark being history only. An open row that carries it is one whose cancel was never carried out:
     * the next repair or continue ends its unfinished agents `cancelled` and closes it `cancelled` in the cancel's place
     * (`recordCrash`), no surface presents it as a crash left it, and the Continue action counts none of it. NULL on every
     * row written before this version, and true of them: none could record the mark.
     */
    sql: `
      ALTER TABLE iterations ADD COLUMN cancel_accepted_at TEXT;
    `,
  },
  {
    to: 28,
    /*
     * REQ-TOOLS-154 items (4) and (5), REQ-LIBRARY-098, REQ-TOOLS-152 (R-067, the repair of
     * `a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`): two parts of a child's payload were
     * held in memory by the run that accepted its `delegate` call — the artifacts it attached and its inherited-context
     * block. Since PD-ORCH-005 a child outlives that run, so a resumed child whose REQ-ORCH-088 retry, or whose follow-up
     * before it ever started (clause 22), assembles its payload again in a later run found neither, and started without
     * them with nothing said. Both are now stored with the child's record, as its `write_scope` and its
     * `suppress_auto_context` are, and every assembly reads them from there.
     *
     * `attach_artifacts` is the call's field as given, a JSON array of artifact ids or slugs in the caller's order; the
     * bodies are read from the artifact store when the payload is assembled, as they were. `inherited_context_block` is the
     * block rendered at the call from the reports of the siblings that had completed then — "as they stood when the call
     * was made"; which of the named ids counted is not recoverable later from `inherited_context`, since a sibling ignored as
     * unfinished may have completed since. `'[]'` and `''` on every row written before this version: such a row's
     * attachments and block were never recorded, and its retry in a later run carries none, as before.
     */
    sql: `
      ALTER TABLE children ADD COLUMN attach_artifacts TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE children ADD COLUMN inherited_context_block TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    to: 29,
    /*
     * REQ-MONITOR-102 with REQ-ORCH-153 (R-067, the repair of
     * `a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md`): a root's calls join the session total when
     * its turn returns, and a crash ends that turn without returning. For an execution iteration's root the crash record
     * reads what the total holds from `iterations.root_tool_calls` (v26); a plan cycle is not an iteration and has no
     * `iterations` row, so nothing told the crash record that a plan cycle's root was under way, and its calls were lost.
     *
     * `plan_root_task_id` names the plan cycle's root while its turn runs and none of its calls is counted; `plan_root_persona`
     * is the name its transcript rows carry. Both are written when the plan cycle's root starts and cleared, in the same
     * transaction that adds its calls to the total, when its turn returns or the stop's grace gives up on it — or with none
     * counted when its turn raises. A row that still names one after its process died is a crash during that plan cycle: the
     * next repair or continue answers the root's open calls, adds the calls its record holds, and clears both. At most one
     * plan cycle runs at a time in a session, so one pair of columns holds it. NULL on every row written before this
     * version, and true of them: no plan cycle's root was recorded as under way.
     */
    sql: `
      ALTER TABLE sessions ADD COLUMN plan_root_task_id TEXT;
      ALTER TABLE sessions ADD COLUMN plan_root_persona TEXT;
    `,
  },
  {
    to: 30,
    /*
     * REQ-MONITOR-044/052/069 with REQ-LIBRARY-093 and REQ-LIBRARY-099 (R-067, the repair of
     * `a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md`): the run-level agent is known by the
     * names of the session's roots — each iteration's from its `iterations` row. A plan cycle is not an iteration
     * (REQ-ORCH-153) and has no row; its root was named by its live run, and once that run parked or ended, by its publishes
     * alone. A plan cycle's root that read an artifact and published nothing was then no agent's: the read records the
     * reader by its canonical instance name (REQ-LIBRARY-099, REQ-LIBRARY-093), and the run-level agent lost that received
     * link at the gate and in every later snapshot.
     *
     * `plan_roots`: one row per plan cycle's root, written when its turn starts (in the transaction that records it under
     * way, v29) and never changed — its task id, the canonical instance name it reads and publishes under, and the name its
     * rows carry. A plan cycle's root is always a fresh root, so the pair is the one `iterations` keeps for an iteration's.
     * Unlike v29's pair it is not released when the root's calls are counted: it is who the root was, not whether it is
     * under way. The table cascades with its session; every read is the primary key's prefix. A session written before
     * this version has no rows, and true of it: its plan cycles' roots were never recorded, and those that published are
     * still named by their publishes.
     */
    sql: `
      CREATE TABLE plan_roots (
        session_id          TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        root_task_id        TEXT NOT NULL,
        root_canonical_name TEXT NOT NULL,
        root_persona        TEXT NOT NULL,
        opened_at           TEXT NOT NULL,
        PRIMARY KEY (session_id, root_task_id)
      );
    `,
  },
  {
    to: 31,
    /*
     * REQ-SANDBOX-121 with REQ-MONITOR-257 and REQ-NOTIFY-030 (the repair of
     * `no-workspace-indicator-names-the-confinement-backend.md`): the indicator names the confinement backend of the
     * focused session, and the session's record carried only `sandboxed` (v3). `sandbox_backend` is the backend the
     * session's latest run was confined by, written beside `sandboxed` when a run starts ('' when it was not confined).
     * A session written before this version takes the backend its `session.start` event recorded
     * (`sandbox.backend`, REQ-SESSION-193) where it is marked confined and that event is still held, else ''.
     * `session.start` is written once, at the session's creation, so it is the FIRST run's backend while `sandboxed`
     * describes the LATEST run's; they agree in practice, a host having one confinement backend (REQ-SANDBOX-065).
     */
    sql: `
      ALTER TABLE sessions ADD COLUMN sandbox_backend TEXT NOT NULL DEFAULT '';
      UPDATE sessions SET sandbox_backend = coalesce((
        SELECT json_extract(e.payload, '$.sandbox.backend') FROM events e
        WHERE e.session_id = sessions.session_id AND e.kind = 'session.start' AND json_valid(e.payload)
          AND json_type(e.payload, '$.sandbox.backend') = 'text'
        ORDER BY e.ordinal LIMIT 1), '')
      WHERE sandboxed = 1;
    `,
  },
  {
    to: 32,
    /*
     * REQ-MONITOR-102 with REQ-ORCH-097 as OQ-116 rules it (R-071, `PD-ORCH-008`): each tool call joins the session's total
     * as it completes, the agent's own count with it, so the displayed total follows the record during a long pass. An
     * execution iteration's root counts on its row (`iterations.root_tool_calls`, v26) and a child on its own
     * (`children.tool_calls`); a plan cycle's root has no row, and until this version none of its calls was counted before
     * its turn returned, so v29's pair said only that it was under way. `plan_root_tool_calls` is how many of the calls of
     * the plan cycle's root under way the total already holds: 0 when it starts, raised as each call completes, and 0 again
     * when it is released. A crash during the plan cycle adds what its record holds beyond it. 0 on every row written
     * before this version, and true of them: no plan cycle's root counted a call before it was released.
     */
    sql: `
      ALTER TABLE sessions ADD COLUMN plan_root_tool_calls INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    to: 33,
    /*
     * REQ-SESSION-140's Agents section with REQ-MONITOR-102 (the repair of
     * `summary-md-reads-a-plan-cycle-roots-calls-from-the-capped-tool-call-record.md`): each agent's line carries the calls
     * it counted. An iteration's root reads `iterations.root_tool_calls` (v26) and a child `children.tool_calls`; a plan
     * cycle's root had no count that outlived its release (v32's `plan_root_tool_calls` is the root UNDER WAY's, zeroed
     * when it is released), so its line was read from the tool-call record, a ring capped at 5,000 rows (REQ-SESSION-133)
     * that reads fewer calls than the root made once the cap drops its oldest. `plan_roots.tool_calls` is how many of the
     * root's calls the session's total holds: 0 when its turn starts, raised in the transaction that adds its calls to the
     * total (as each completes, at its release, and from a crash record), never lowered. NULL on every row written before
     * this version, and true of them: what those roots counted was never recorded per root, so it is unknown.
     */
    sql: `
      ALTER TABLE plan_roots ADD COLUMN tool_calls INTEGER;
    `,
  },
  {
    to: 34,
    /*
     * PD-TOOLS-006 revision 6 (OQ-220, ruled 2026-10-07 under R-072) with REQ-ORCH-028 and REQ-ORCH-029: a delegation names
     * the todo item it serves, so "no two implementation delegations for the same todo item are outstanding at once" can be
     * held at admission and read from the run's own records. `todo_item` is the 8-hex id of an item of the delegating agent's
     * own plan the `delegate` call named, inherited by a continuation; NULL where the call named none, and on every row
     * written before this version, which is true of them: no delegation named an item before it.
     */
    sql: `
      ALTER TABLE children ADD COLUMN todo_item TEXT;
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.to;

/** REQ-SESSION-192 / REQ-SESSION-131: the resident cap and the page size, defined once. */
export const RESIDENT_ROW_CAP = 5000;
export const RELEASE_PAGE_SIZE = 50;
