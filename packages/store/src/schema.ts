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
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.to;

/** REQ-SESSION-192 / REQ-SESSION-131: the resident cap and the page size, defined once. */
export const RESIDENT_ROW_CAP = 5000;
export const RELEASE_PAGE_SIZE = 50;
