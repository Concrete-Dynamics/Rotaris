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

**Amended 2026-10-03 (fin11's triage, before the repair; code reading, not driven).** The exposure is wider than "a raise at
shutdown". The store is closed while the run host lives, not only at quit: `workspace.closeStore` closes it before a backup
or a restore, and `workspace.closing` when a window lets its workspace go (`apps/desktop/src/run-host/dispatch.ts`). And the
run host installs no `unhandledRejection` handler — only main does (`apps/desktop/src/main/index.ts`) — so under Node's
default an unhandled rejection from the closing pass would likely end the run host process, every run it holds with it.
Whether a child's execution can still settle after the run's end has been acknowledged and such a close has arrived was not
driven; by reading it needs post-settle asynchronous work in the child's execution (a detached execution the stop's grace
gave up on is one). The repair owed: the scheduler closed at the iteration's teardown, after which the pass returns at once,
and the pass in the unawaited `.finally` guarded so a raise is warned and never rejects.

## Outcome — repaired 2026-10-03 (fin11)

- **The scheduler is closed at the iteration's teardown.** `Scheduler.close` (`packages/engine/src/children/scheduler.ts`)
  marks it closed and releases every waiter; `pass` then returns at once, and `waitFor` resolves. `IterationChildren.close`
  (`packages/engine/src/children/orchestration.ts`) closes it, and `Run.turn` (`packages/engine/src/run/run.ts`) calls that
  once the iteration's children are torn down — finalized (REQ-ORCH-052) or paused by a rest (PD-ORCH-005 clause 2) — so a
  child's execution settling after the run's end reads no store.
- **The unawaited pass can never reject.** `startOne`'s `.finally` wraps the pass in a try/catch that warns through
  `deps.warn` ("the scheduler's pass after child … raised: …"), so a store closed under a scheduler nobody closed is a
  warning, not an unhandled rejection that would end the run host.
- **Pinned** by two cases in `packages/engine/src/children/children.test.ts` ("a child's closing pass and a closed store"),
  against a real store closed while the child's execution is still pending: without `close()`, the pass's raise is warned
  once and no unhandled rejection is seen (before the repair: one, `TypeError: The database connection is not open`); after
  `close()`, the pass reads the ledger not at all and warns nothing.
- **The clause 6 case** passes with an extra await before the turn's compression check (`settleBeforeCall` awaited
  unconditionally, tried on this branch and reverted). That variant did not reproduce the original unhandled rejection on
  this branch without the repair either — the timing it depended on has moved since — so the new cases, which close the store
  deterministically, are the reproduction.
- **No proof**: nothing observable changes except the run host surviving a store closed just after a run with children; the
  gate is the evidence. Whether a child's execution can settle after such a close in the product was not driven.

## Specs

None contradicted directly. REQ-ORCH-053 and REQ-ORCH-098 (a child settled and torn down) say nothing of when the
scheduler's follow-up pass may run relative to the run's end.

## Relevant files

- `packages/engine/src/children/scheduler.ts` — `startOne`: the `.finally(() => this.pass())` nothing awaits.
- `packages/engine/src/children/children.test.ts` — the clause 6 case above, whose `afterEach` closes the store.
- `packages/engine/src/run/turn.ts` — where an added await exposed it (`settleBeforeCall` behind `onExcludedPair`).
- `apps/desktop/src/run-host/dispatch.ts` — `workspace.closeStore` and `workspace.closing`, which close a store while the run
  host lives.
- `apps/desktop/src/main/index.ts` — main's `unhandledRejection` handler; the run host has none.
