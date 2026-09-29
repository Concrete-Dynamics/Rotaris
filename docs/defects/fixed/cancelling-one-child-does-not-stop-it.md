## Cancelling one child does not stop it

`Run.cancelAgent` moves the child's row to `cancelled`, stores a "The user cancelled this child." report and writes
`child_user_cancelled`, but it has no handle on the child's execution: there is no per-child abort. The child keeps
running, and when its turn ends `execute` stores its own report over the cancellation's, since `storeReport` does not
check the state; its own transition is refused as illegal and only warns. The last writer wins the report.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-ORCH-133` (a single user cancel stops the child and its report states the user cancelled it; a bulk cancel
waits 5 s and records `child_force_cancelled`) and `REQ-MONITOR-128` (cancelling an agent cascades to its live
descendants): the child is marked cancelled while it goes on working, and the report that survives is not the
cancellation's.

## Relevant files

- `packages/engine/src/run/run.ts` — `cancelAgent`.
- `packages/engine/src/children/orchestration.ts` — `execute`, `storeReport` after the turn.
- `packages/engine/src/children/ledger.ts` — `storeReport`, which writes whatever the state.

## Repaired — 2026-09-27

By `PD-ORCH-005` phase 3, whose clause 3 keeps "the cancellation of one agent" final and needs it to be real. Each child
execution now holds its own `AbortController` (`IterationChildren.controllers`), and `IterationChildren.cancel` settles
the child and every live descendant `cancelled` (REQ-MONITOR-128's cascade), stores each report ("The user cancelled
this child." / "Cancelled with <name>, which the user cancelled."), records `child_user_cancelled` for each, and
aborts each execution. The summarising pass runs under a controller of its own, so a cancel that lands while the child
summarises aborts that call too. An execution that finds its record terminal writes nothing, before the summarising
pass and again after it, so the cancellation's report is the one that stays. REQ-ORCH-088's fallback retry reads the
cancel from the record, not from the signal. `Run.cancelAgent` delegates to it, and the run's reserved id is the
explicit, final cancel. REQ-ORCH-133's bulk cancel with its 5 s wait is not built here and is unchanged.

The first version of this repair checked the record only before the summarising pass and had already dropped the
execution's controller, so a child cancelled while it summarised still stored the summariser's report. The phase's
adversarial review reproduced it, and the controller and the second check repair it. The second review found the
summariser's own retry: an aborted first attempt was retried under a fresh controller that nothing could abort, so one
more summarising call followed the cancel. `produceReport` now checks the abort before every attempt and makes none
once it holds.

Evidence:
- `children.test.ts`, "REQ-ORCH-133 / REQ-MONITOR-128, the repair of cancelling-one-child-does-not-stop-it…": neither
  aborted execution takes another step or summarises, and both reports are the cancellation's. It fails when the
  per-child abort is reverted.
- `children.test.ts`, "…a child cancelled while it summarises keeps the cancellation's report…".
- `children.test.ts`, "REQ-ORCH-133: cancelling the child aborts the pass and it makes no second attempt".
- `report.test.ts`, "an attempt the child's abort cut off is the last: no retry, and no report".
