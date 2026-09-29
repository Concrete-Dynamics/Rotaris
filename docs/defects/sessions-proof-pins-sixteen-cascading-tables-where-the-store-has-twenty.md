## sessions-proof pins sixteen cascading tables where the store has twenty

`apps/desktop/scripts/sessions-proof.mjs`, before the delete scenario, asserts `cascaded.length === 16` — the count of
tables whose `session_id` references `sessions(session_id)`. Store v22 to v24 (`PD-ORCH-005`) added `iterations`,
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
sixteen. The runtime view's §6a also says the delete cascades "to the fifteen dependent tables", which the same four
tables made nineteen.

Noticed 2026-09-29 while running `sessions-proof` for
[`a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md`](fixed/a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md).
Not repaired.

## Specs

None contradicted by the product. REQ-SESSION-166 (a delete removes everything the session owns) is what the pin and the
delete scenario after it exist to measure.

## Relevant files

- `apps/desktop/scripts/sessions-proof.mjs` — the `cascaded.length === 16` pin before the delete scenario.
- `packages/store/src/schema.ts` — the migrations that added the four cascading tables.
- `docs/architecture/views/03-runtime-view.md` §6a — "the fifteen dependent tables".
