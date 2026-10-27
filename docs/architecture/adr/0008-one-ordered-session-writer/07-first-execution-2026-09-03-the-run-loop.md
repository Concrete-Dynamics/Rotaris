# ADR-0008 — One ordered session writer per session, owning the session's transactions — First execution — 2026-09-03, the run loop: aggregates, the launch audit, summary.md, the terminal transaction

Part 7 of 8 of [ADR-0008](../0008-one-ordered-session-writer.md), which indexes every part.

## First execution — 2026-09-03, the run loop: aggregates, the launch audit, summary.md, the terminal transaction

*Recorded under GD-10. This is the second note on this record in one day; the first said what the writer
did not build, and this is that list built.*

**Built and run:** the metric aggregates as in-process figures rehydrated once at run start and copied into
every save (`REQ-SESSION-139/168/169`; `packages/engine/src/run/aggregates.ts`); the one-shot launch audit
as a table whose primary key *is* the one-shot — the writer reports a second insert as refused, it does not
check first (`REQ-SESSION-138`); the timeline as an append-ordered table with the writer assigning the
ordinal (`REQ-ORCH-139`); and `summary.md` rebuilt after each save's commit, off the path, through
ADR-0004's primitive under `REQ-SESSION-033`'s six-attempt ladder, generation-ordered so an older rebuild
never overwrites a newer one (`packages/engine/src/run/summary.ts`). Schema v3 adds columns and two tables
and **no index**, because no budgeted query reads them yet.

**Historical reading, superseded by accepted A3 on 2026-09-06.** `REQ-SESSION-094`
orders the lock release *before* `session.end` and `result`; `REQ-EVENTS-098` makes the right to write a
session's history exactly the right to hold its lock. Read flatly they conflict for the two terminal
events. The writer's `endRun` commits **one durable transaction** in `REQ-SESSION-094`'s order — the
system row of `REQ-SESSION-093`, the lock-row delete, `session.end`, `result`, the terminal status and
its patch — so the writer holds the lock at the instant it records the pair and holds nothing when the
commit is visible, and the bus forwards both after the commit while the sink is still attached. If the
owner reads `REQ-SESSION-094` as requiring the release to be *visible* before the pair is recorded, it is
a one-line change and this note is where it is argued.

**Accepted A3, 2026-09-06: terminal ownership.** The writer retains its lock
through the durable terminal transaction and committed event delivery. Teardown
then detaches session consumers, clears bindings and releases ownership in
guaranteed cleanup. The terminal transaction contains the system row, terminal
events and final state. Its lock stays held after commit until cleanup. A failed
terminal commit publishes no authoritative terminal outcome; the recording-failure
decision OQ-42 governs cancellation and recovery. `run.test.ts` verifies ownership
during both terminal inserts and blocking-consumer delivery, and verifies that
release follows detachment.

**A second reading, on the persisted status at normal completion.** `REQ-MONITOR-029` maps the terminal
result `completed` to the status `completed`; `REQ-SESSION-093` says a normal completion takes its status
from the end-of-run summarisation. They differ for one case — a run whose only task was abandoned stops
`no_pending_tasks` (result `completed`) and summarises `failed`. The run persists the **summarisation's**
status there, because `REQ-SESSION-093` is the requirement about what is persisted; every other outcome
takes `REQ-MONITOR-029`'s mapping. Tested in `run.test.ts`.

**Found: nothing in this record's own mechanism.** What the first run found is ADR-0043's (below).

**2026-09-05, the control channel's units.** `queuePrompt`, `editQueuedPrompt`, `removeQueuedPrompt`,
`triggerQueuedPrompts` (the atomic move over every QUEUED row, one transaction), `pauseAtLimit` (durable: the
status, the count, the limit, the timeline entry) and `resolvePause` (durable: the status the resolution writes
clears the paused-at-limit condition in the same act, REQ-SESSION-110) — each one transaction with its timeline
entry, through the one writer. **Found: nothing.**
