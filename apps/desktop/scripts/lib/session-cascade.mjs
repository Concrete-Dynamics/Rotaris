/**
 * The premise `sessions-proof`'s delete scenario measures REQ-SESSION-166 against, read from the store's schema.
 *
 * A session delete is ONE `DELETE FROM sessions`, and the store's foreign keys carry it to every table that belongs to
 * the session (`completeDelete`, the runtime view §6a). Which tables those are is a fact of the schema, and the schema
 * grows: v20 gave `plan_cycles` its reference, v23 added `iterations`, `agent_messages` and `agent_terminals`, v24
 * `agent_fingerprints` (PD-ORCH-005 clause 12: "the conversation record belongs to its session and is deleted with it").
 * The proof pinned the COUNT of the cascading tables, twice, and each migration that added one broke the proof before
 * anything after the pin was measured
 * (`docs/defects/fixed/sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md`). What the delete
 * relies on is not a count but a shape, and that is what is checked here, whatever the count:
 *
 * - every table whose foreign key names `sessions` names it FROM its `session_id` column, TO the session id, with
 *   `ON DELETE CASCADE` — otherwise the one DELETE is refused, or leaves the rows behind;
 * - every other table carrying a `session_id` column is a deliberate fact about a session that outlives it, and there
 *   is exactly one: `delivery_runs` (REQ-TRACE-476; ADR-0041's first execution, ruled 2026-09-09).
 *
 * A table a later migration adds under either shape passes; a table that carries a `session_id` under neither fails,
 * naming itself.
 */

/** The tables whose `session_id` names a session as a fact about a record that outlives it (REQ-TRACE-476). */
export const SESSION_FACT_TABLES = Object.freeze(['delivery_runs']);

const TABLES_WITH_SESSION_ID = "SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'session_id')";
const TABLES_REFERENCING_SESSIONS = "SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) WHERE \"table\" = 'sessions')";
const REFERENCES_TO_SESSIONS = "SELECT \"from\" AS fromColumn, \"to\" AS toColumn, on_delete AS onDelete FROM pragma_foreign_key_list(?) WHERE \"table\" = 'sessions'";

/**
 * Reads the cascade premise from an open store (any handle with better-sqlite3's `prepare`).
 * @returns {{ tables: string[], cascaded: string[], facts: string[], problems: string[] }} `tables` carry a
 *   `session_id` column; `cascaded` is `sessions` and every table referencing it, in schema order; `facts` is the rest;
 *   `problems` is empty when the premise holds, else one sentence per table that breaks it.
 */
export function sessionCascade(db) {
  const tables = db.prepare(TABLES_WITH_SESSION_ID).all().map((t) => t.name);
  const referencing = db.prepare(TABLES_REFERENCING_SESSIONS).all().map((t) => t.name);
  const cascaded = ['sessions', ...referencing.filter((t) => t !== 'sessions')];
  const facts = tables.filter((t) => !cascaded.includes(t));
  const problems = [];
  if (!tables.includes('sessions')) problems.push('the store has no sessions table carrying session_id');
  for (const table of referencing) {
    for (const fk of db.prepare(REFERENCES_TO_SESSIONS).all(table)) {
      // `to` is NULL when the reference names the parent's primary key implicitly, which for `sessions` is session_id.
      const shape = fk.fromColumn === 'session_id' && (fk.toColumn === 'session_id' || fk.toColumn === null) && fk.onDelete === 'CASCADE';
      if (!shape) problems.push(`${table} references sessions as ${fk.fromColumn} → ${fk.toColumn ?? '(primary key)'} ON DELETE ${fk.onDelete}, not session_id → session_id ON DELETE CASCADE, so a session delete does not take its rows`);
    }
  }
  for (const table of facts) {
    if (!SESSION_FACT_TABLES.includes(table)) problems.push(`${table} carries session_id with no reference to sessions and is not a deliberate fact table (${SESSION_FACT_TABLES.join(', ')}), so a session delete leaves its rows`);
  }
  for (const table of SESSION_FACT_TABLES) {
    if (cascaded.includes(table)) problems.push(`${table} references sessions, so a session delete takes the record REQ-TRACE-476 keeps`);
    else if (!tables.includes(table)) problems.push(`${table}, the fact table REQ-TRACE-476 keeps, carries no session_id`);
  }
  return { tables, cascaded, facts, problems };
}
