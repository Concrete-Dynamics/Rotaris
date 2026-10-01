## A child that never started gets no teardown timeline entries

A child that reaches a terminal state without its execution ever starting gets no `child_end`, `child_result` or
`child_conversation_closed` timeline entry. The teardown that writes them sits where a child's execution ends: in
`IterationChildren.execute` and in `settleRaised`. Two paths settle a child that never started and write none of them:
- a child blocked by its dependency (REQ-ORCH-048), settled `blocked` by `Scheduler` with its report and artifact since
  the repair of
  [`a-child-blocked-by-its-dependency-gets-no-report.md`](a-child-blocked-by-its-dependency-gets-no-report.md);
- a queued child `Scheduler.finalizeIncomplete` cancels at the iteration's end.

The build's reading is that such a child never had a conversation, so there was nothing to close. That reading is
stated on the fixed note only; no requirement or open question states it, and REQ-ORCH-098's "whatever terminal state
a child reaches" does not except it.

Noticed 2026-09-29 by the verifier of the R-067 repair of the note above, and recorded under R-067. Established by
reading the code; no test asserts either form.

## Specs

- `REQ-ORCH-098`: "Whatever terminal state a child reaches, and whether or not its execution raised, that child MUST be
  fully torn down: its conversation is closed, a `child_conversation_closed` timeline event is emitted for it, …". A
  child that never started reaches a terminal state and gets no such event. Whether a child with no conversation owes
  one is a reading of the clause the specification does not settle; the owner's ruling, or an open question, decides it.
- `REQ-ORCH-108` and `REQ-ORCH-112` are met for the blocked child: it has its report and its artifact.

## Relevant files

- `packages/engine/src/children/scheduler.ts`: the blocked-child settle and `finalizeIncomplete`, neither of which
  writes a teardown entry.
- `packages/engine/src/children/orchestration.ts`: `execute` and `settleRaised`, where the teardown entries are written.
- `docs/defects/fixed/a-child-blocked-by-its-dependency-gets-no-report.md`: where the reading was first stated.

## Repaired 2026-09-30 under R-067 (acceptance finding A16)

**Confirmed first.** Two cases through `Sessions` over a real store failed on the unrepaired code with no teardown entry
for the child at all: a child `b` blocked by its dependency `a`'s failure, and the explicit cancel's finalize sweep over
two children under a model cap of one — `two`, held on its slot and never started, and `one`, mid-step. The second case
also showed the note narrower than the defect: `one` had started, and the sweep cancelled it before its execution
returned, so its execution found its record terminal and wrote nothing, and it got no teardown entry either.

**What changed.** The scheduler tears down every child it settles itself. `SchedulerDeps.teardown` is called by
`Scheduler.cascadeBlocked` and `Scheduler.finalizeIncomplete` with the terminal row and the report just stored, after the
report and before the terminal callbacks resume the parent, the order `IterationChildren.afterTerminal` keeps for a
settle. A raise out of it is warned, and the scheduler is still told. `IterationChildren` passes `writeTeardown`
(`children/orchestration.ts`), which now writes `child_end`, `child_result` and `child_conversation_closed` for all three
paths: both settles of a child's execution, and the scheduler's. The reading, that a child that never started is torn
down as any, is **OQ-152**, put to the owner.

**Pinned by** `packages/engine/src/children/children.test.ts`, "REQ-ORCH-098, the repair of
a-child-that-never-started-gets-no-teardown-timeline-entries: …" (two cases). The blocked child gets the three entries,
once each, in the settle's words, with its `blocked` report's summary, and they are in the timeline when its parent is
resumed. Both children the sweep cancels get them once each. Both cases fail on the unrepaired code.

**Not shown in the built app.** The note was established by reading the code, and no proof or live-run scenario reliably
blocks a child or cancels one held on its slot: the dependency graph and the delegation are the model's in a live run.
The unit cases are the evidence. The paths that settle a child `cancelled` outside both the scheduler and its execution
still write no teardown entry, and are recorded in
[`a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`](a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md).
