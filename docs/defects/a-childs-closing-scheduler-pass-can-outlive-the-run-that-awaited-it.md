## A child's closing scheduler pass can outlive the run that awaited it

`Scheduler.startOne` runs each child as `runChild(row)…finally(() => this.pass())`, so the pass that follows a child's end is
scheduled on a microtask after the child's execution settles, and nothing the run awaits waits for it. A caller that treats
`Sessions.running(sid)` resolving as "the run is over" can close the store first; the pass then reads the ledger
(`ChildLedger.all` → `StoreDal.childrenOfIteration`) on a closed connection and raises an unhandled rejection.

Seen while repairing fin10's first-round finding (2026-10-03): adding one `await` before a turn's compression check
(`settleBeforeCall`, before the synchronous `onExcludedPair` fast path was added) moved the timing enough that
`packages/engine/src/children/children.test.ts`'s "PD-ORCH-005 clause 6: \"continue without them\" fires it for each paused
agent it cancels, after the continuing run's `session_start`" passed every assertion and Vitest still reported
`TypeError: The database connection is not open` from `Scheduler.pass` → `cascadeBlocked`, after the test's `afterEach`
closed the database. The repair as committed takes no extra await on a step with nothing to settle, so the gate is green; the
ordering hazard stands. In the product the store is closed only at quit, so the observable risk is a raise at shutdown
while a child's last pass is pending, not a wrong record.

Not repaired: outside the task that saw it.

## Specs

None contradicted directly. REQ-ORCH-053 and REQ-ORCH-098 (a child settled and torn down) say nothing of when the
scheduler's follow-up pass may run relative to the run's end.

## Relevant files

- `packages/engine/src/children/scheduler.ts` — `startOne`: the `.finally(() => this.pass())` nothing awaits.
- `packages/engine/src/children/children.test.ts` — the clause 6 case above, whose `afterEach` closes the store.
- `packages/engine/src/run/turn.ts` — where an added await exposed it (`settleBeforeCall` behind `onExcludedPair`).
