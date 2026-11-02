## sessions-proof pins sixteen cascading tables where the store has twenty

`apps/desktop/scripts/sessions-proof.mjs`, before the delete scenario, asserts `cascaded.length === 16` — the count of
tables whose `session_id` references `sessions(session_id)`. Store ~~v22 to v24~~ v23 to v24 *(Corrected 2026-09-30,
the verifier's fix round 1: v22 is `PD-ORCH-004`'s `children.continuation_of`; `schema.ts` adds the first three tables at
v23 and `agent_fingerprints` at v24, as the runtime view's §6a says)* (`PD-ORCH-005`) added `iterations`,
`agent_messages`, `agent_terminals` and `agent_fingerprints`, each cascading from `sessions`, so the store now has
twenty and the proof fails there on every platform:
`tables whose session_id references sessions: sessions, session_locks, transcript_rows, events, launch_audits, timeline,
permission_audit, tool_calls, issues, ring_state, children, model_slot_queue, queued_prompts, checkpoints, artifacts,
plan_cycles, iterations, agent_messages, agent_terminals, agent_fingerprints`. Everything the proof measures after that
line — the built-app delete's cascade, the moved-tree delete, the exports — goes unmeasured while the pin stands. With
the count read as twenty (a local, uncommitted edit) all ten scenarios passed on 2026-09-29.

On Linux the proof first fails earlier, reading the machine identifier at the Windows path; that is repaired on the
unmerged branch `fix-proofs-b4`
(`sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md` there), which still pins
sixteen. *(Corrected 2026-09-30, the verifier's fix round 1: that was true when this note was written and is not now. The
repair is merged, as
[`sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md`](sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md),
and on `7ae8072` the proof reached the sixteen pin on Linux without failing earlier.)* The runtime view's §6a also says the delete cascades "to the fifteen dependent tables", which the same four
tables made nineteen.

Noticed 2026-09-29 while running `sessions-proof` for
[`a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md`](a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md).
Not repaired then; acceptance round 1 found it again on merged `main` (finding A3). Repaired since: see the outcome below.

## Specs

None contradicted by the product. REQ-SESSION-166 (a delete removes everything the session owns) is what the pin and the
delete scenario after it exist to measure.

## Relevant files

- `apps/desktop/scripts/sessions-proof.mjs` — the `cascaded.length === 16` pin before the delete scenario.
- `packages/store/src/schema.ts` — the migrations that added the four cascading tables.
- `docs/architecture/views/03-runtime-view.md` §6a — "the fifteen dependent tables".

## Outcome

Repaired 2026-09-29 under R-067 (acceptance finding A3). Confirmed first on `7ae8072`: `sessions-proof --skip-build`
exited 1 in 70 s at the pin, listing the twenty tables above. The count pin is gone. The premise the delete scenario
stands on is now the cascade's **shape**, read from the schema by `apps/desktop/scripts/lib/session-cascade.mjs`: every
foreign key naming `sessions` runs `session_id` → `session_id` `ON DELETE CASCADE`, and every other table carrying a
`session_id` is `delivery_runs`, the one fact table (REQ-TRACE-476). A table a later migration adds under either shape
passes; one under neither fails, naming itself. The proof's `facts` pin (`["delivery_runs"]`) is folded into the same
check. The delete scenario also asserts that A's agent record — `iterations`, `agent_messages` and
`agent_fingerprints`, written by its two runs — was present before the delete and gone after it (PD-ORCH-005 clause 12).

Pinned in `apps/desktop/scripts/lib/session-cascade.test.ts`: the premise holds on the store this build migrates
(twenty tables, `delivery_runs` the one fact), still holds when a cascading table is added, and fails, naming the table,
for a reference without `ON DELETE CASCADE`, for a `session_id` with no reference, and for a reference from
`delivery_runs`. With a count pin of sixteen put back into the reader, all five cases fail; with the `ON DELETE CASCADE`
condition removed, the case that names it fails. Shown by `sessions-proof --skip-build` after `pnpm build` on the
repaired branch, twice (exit 0, 10 of 10 scenarios, 103 s each): ~~the delete took A's rows from all nineteen dependent
tables~~ the delete left no row for A in any of the nineteen dependent tables *(Corrected 2026-09-30, the verifier's fix
round 1: A had no row before the delete in several of them — `session_locks`, `children`, `model_slot_queue`,
`queued_prompts` and `artifacts` — so "took" overstated what was measured there)* (`iterations` 2, `agent_messages` 5,
`agent_fingerprints` 2 before, 0 after) and kept its `delivery_runs` row; the moved-tree delete, both exports and the
isolated delete ran and passed. The fix round then planted one ended `agent_terminals` row for A, as `plan_cycles`' is
planted, because the scripted runs start no background terminal and that table's cascade went unmeasured; the assertion
now names all four agent-record tables. Run once more after `pnpm build` (exit 0, 10 of 10 scenarios, 103 s, load
average about 5): `iterations` 2, `agent_messages` 5, `agent_terminals` 1, `agent_fingerprints` 2 and `plan_cycles` 1
before the delete, 0 after; `delivery_runs` 1 before and after. The runtime view's §6a now reads nineteen and
says the proof reads the shape.
