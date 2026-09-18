## `plan_cycles` is the one session-scoped table with no foreign key, so deleting a session leaves its plan text in the store

Fourteen tables carry `session_id TEXT … REFERENCES sessions(session_id) ON DELETE CASCADE`, which is how a
session delete removes everything that belongs to the session in one statement. `plan_cycles` (schema v17,
REQ-ORCH-154) carries `session_id TEXT NOT NULL` with `PRIMARY KEY (session_id, cycle)` and NO reference, so
its rows are not cascaded and nothing deletes them by hand — `packages/store/src/dal.ts` has an insert, two
updates and two reads for the table, and no delete anywhere.

What is left behind is not a counter: each row holds `plan`, the role's plan text VERBATIM (never rewritten
after the insert, by REQ-ORCH-154's own rule), plus the classified intent, the implied todo, the user's
`changes` sentence and their `edited` text. A user who deletes a session to remove its content removes the
transcript, the artifacts, the checkpoints and the audit — and keeps the plans, indefinitely, keyed by a
session id that no longer names a row.

The one other table that carries `session_id` without a reference, `delivery_runs`, is deliberate and ruled
(REQ-TRACE-476, ADR-0041's first execution: a requirement's run history outlives the session it names).
`plan_cycles` is not covered by that ruling and nothing records a decision to exempt it — it reads as an
omission when v17 was appended.

Measured: `pnpm sessions-proof` derives the cascade set from the schema rather than pinning a count, and
reports `tables carrying session_id as a fact: delivery_runs, plan_cycles` where it expects
`["delivery_runs"]`. The proof has never reached that line until now because it failed earlier on a stale
assertion (`docs/defects/fixed/the-proofs-assert-a-timeline-name-the-audit-corrected.md`), which is how a
defect from v17 stayed invisible.

## Specs

REQ-SESSION-166 — "remove the session's record and its files (REQ-SESSION-002) together … so a deletion never
leaves a listed session with no record, or files with no session" — is what the missing reference breaks:
a plan cycle is part of the session's record, and the requirement's single named exemption is the
workspace-scoped improvement library (REQ-SESSION-007), which is not this. REQ-ORCH-154 is what makes the
residue sensitive, because it requires the plan to be stored VERBATIM. No requirement asks `plan_cycles` to
outlive its session, and the store's one other unreferenced table, `delivery_runs`, carries a ruling that
says why (REQ-TRACE-476).

## Relevant files

- `packages/store/src/schema.ts` — v17's `CREATE TABLE plan_cycles`, the fourteen tables above it that carry
  the reference, and `delivery_runs`, the ruled exception.
- `packages/store/src/dal.ts` — `insertPlanCycle`, `editPlanCycle`, `decidePlanCycle`, `planCycle`,
  `planCyclesOf`: no delete.
- `apps/desktop/scripts/sessions-proof.mjs` — the cascade premise read from the schema, and the assertion
  that names the residue.

**Repair shape, not performed here.** SQLite cannot add a foreign key in place, so the repair is an APPENDED
migration that rebuilds `plan_cycles` with the reference and copies the rows whose session still exists
(dropping the ones already orphaned is the same delete the user asked for), and `sessions-proof`'s cascade
count moves from 15 to 16 with it. That is a store change belonging to the plan gate's own part, not to the
retrospective pass.

Noticed 2026-09-17 by Part AT (`PD-LIBRARY-002`) while running the wider proof sweep, and confirmed to
pre-date that work: `plan_cycles` has been reference-free since v17 landed on `main`.

## Repaired — 2026-09-18

Appended migration v20 (`packages/store/src/schema.ts`): `plan_cycles` rebuilt with
`REFERENCES sessions(session_id) ON DELETE CASCADE`, live rows copied, already-orphaned rows
dropped. `delivery_runs` untouched under its REQ-TRACE-476 ruling.

Regression tests: `packages/store/src/store.test.ts`, in "REQ-SESSION-166: a v19 store migrates
to v20" — live cycles survive verbatim, the orphan drops, the reference is read from the schema,
and `deleteSession` takes the deleted session's cycles leaving another session's; and the delete
test now plants a plan cycle and expects `plan_cycles` among the fifteen dependants. Built-app
proof: `apps/desktop/scripts/sessions-proof.mjs` plants A's plan text, pins sixteen cascaded
tables with `delivery_runs` the one fact, and asserts `plan_cycles` 1 before and 0 after A's
delete.
