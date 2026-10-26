# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — First execution of REQ-ORCH-098's teardown for a child the scheduler settles — 2026-09-30

Part 13 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## First execution of REQ-ORCH-098's teardown for a child the scheduler settles — 2026-09-30

*The first execution above lists "REQ-ORCH-098's teardown entries" under the child's execution, and the cascade and the
finalize sweep under the scheduler. A child the scheduler settles has no execution to end, so it was never torn down.
Acceptance round 1 found it (finding A16,
[`a-child-that-never-started-gets-no-teardown-timeline-entries.md`](../../../defects/fixed/a-child-that-never-started-gets-no-teardown-timeline-entries.md)),
and its repair reports here, under R-067.*

**What the execution found.** Two cases through `Sessions` over a real store: a child blocked by its dependency's failure,
and the explicit cancel's finalize sweep over a child held on its model slot and one mid-step. On the unrepaired code
none of the three children got a `child_end`, `child_result` or `child_conversation_closed`. The third was not in the
note: the sweep can cancel a child whose execution is still returning, and that execution, finding its record terminal,
writes nothing. The decision held: the teardown belongs with the settle, and the scheduler's two settles lacked it.

**What was changed.** `SchedulerDeps.teardown`, called by both settles after the report is stored and before the terminal
callbacks, the order a child's own settle keeps. `IterationChildren` answers it with `writeTeardown`, now the one writer of
the three entries for every settle. The reading, that a child that never started is torn down as any, is **OQ-152**.

**What was not measured.** No built app or live run: none reliably blocks a child or cancels one held on its slot. The
cancel paths outside the scheduler and the execution still write no teardown, and are a note
([`a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`](../../../defects/fixed/a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md),
repaired 2026-10-01, below).
The row is in [`../first-executions.md`](../../first-executions.md).

### The cancel paths outside the scheduler and the execution — 2026-10-01

*The section above left five paths that settle a child `cancelled` with no teardown. Their repair reports here.*

**What the execution found.** Six cases, one per path and the summarising cancel: five in `children/children.test.ts`
through `Sessions` over a real store, and one in `run/crash.test.ts` over the crash record. All six were red on the
unrepaired code: the user's cancel of a running child and its live descendant, of a child while it summarises, of a paused
child and its paused descendant at rest, "continue without them", the stale-child settle and the crash record of an
accepted cancel each wrote the report and no `child_end`, `child_result` or `child_conversation_closed`. A user's cancel of
a running child aborts its execution, which returns later. It finds the record terminal at its settle (`settle`'s early
return, `settleRaised`'s), so it writes no second triple. The summarising case had asserted that no `child_end` was written,
as its evidence that the summariser wrote nothing over the cancellation. It now asserts exactly one triple, in the
cancellation's words, after `child_user_cancelled`.

**What was changed.** Each of the five paths calls `writeCancelledTeardown` after the report it stores and, where it
writes one, after `child_user_cancelled`. Where the path tells the scheduler (`IterationChildren.cancel`), it does so
before the terminal callbacks. The stale-child settle and the crash record run from the store alone, with no
`IterationChildren` and no clock port. So `writeTeardown` moved to `children/ledger.ts`, beside `storeChildReport`, and
takes its time from the writer's clock (`SessionWriter.wall`); in a run that clock is the run's own wall clock. The
decision held: the teardown belongs with whatever settles the child. OQ-152's reading, that every terminal child is torn
down alike, now covers every path.

**What the built app showed.** `mission-proof`'s item 4 cancels `alpha` with its live descendant `sub` through the Mission
view. It now asserts each one's own entries: `child_user_cancelled`, `child_end`, `child_result`,
`child_conversation_closed`, once each, in that order. It passed.

**What was not measured.** `part-j-proof` was run and drives no child cancel or decline. Its "cancel" launch answers the
message-limit dialog. No live run was driven. The other four paths are pinned by the unit cases only. The row is in
[`../first-executions.md`](../../first-executions.md).
