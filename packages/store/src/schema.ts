/**
 * The store schema, as an ordered list of migrations keyed by `user_version`.
 *
 * Only the workspace service runs a migration, at workspace open, before the
 * run host is told the workspace is open (W-02, SR-4). Table schema versioning
 * is W-07's; a RECORD's `schema_version` is a column read forward-tolerantly
 * and never migrated in place (D-22).
 *
 * v1 is the skeleton's: enough for the session writer and the lock predicate.
 * Every later table lands with the mechanism that writes it, in its own
 * migration, so that the checkpoint period of the publish path (measured at
 * 135–136 commits, spike 21) is moved knowingly rather than by accident.
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
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.to;
