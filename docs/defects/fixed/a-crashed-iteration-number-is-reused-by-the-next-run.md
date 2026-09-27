## A crashed iteration's number is reused by the next run

`iterationsCompleted` is incremented only when an iteration finishes, and the next run numbers its first iteration
`iterationsCompleted + 1`. A run host that dies mid-iteration therefore leaves that iteration's children under number N,
and the continued run's first iteration is N again. The ledger's `all()` is scoped by `(session, iteration)`, so the new
iteration sees the crashed one's rows: they count toward `maxTotal`, `depends_on` can resolve against them, and
`creditedChild` reads them. The todo task the crashed iteration held is also left `in_progress` by the sampler, and
`selectNext` never picks an `in_progress` task again. Plan cycles all run as iteration 0, with the same effect between
cycles.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-ORCH-046` (the per-iteration total-children limit) and `REQ-ORCH-038` (`depends_on` names an existing child of
the same parent) are read against the wrong set of children; the orphaned task contradicts `REQ-ORCH-004` (a resumed
session's todo state carries on).

## Relevant files

- `packages/engine/src/run/run.ts` — `iterationsCompleted`, the iteration number, the 10 s sampler that saves `in_progress`.
- `packages/engine/src/children/ledger.ts` — `all()` → `childrenOfIteration`.
- `packages/engine/src/run/todo.ts` — `selectNext`, which skips `in_progress`.

## Repaired — 2026-09-27

By `PD-ORCH-005` phase 2, which records every execution iteration with its root's task id (`iterations`, store v23) and
first met this defect as a store failure: a reused number collided with the dead iteration's row. The three parts:

- **The number.** Before its first iteration, a run closes any iteration a previous run left open as `cancelled`
  (`Run.closeLeftOpenIteration`, REQ-ORCH-135), with `iteration.end` and the row's close in one transaction, and moves
  the count past it; the count is also never below the highest iteration recorded closed. The run's own first
  iteration therefore takes the next number. A conflicting open is refused with a warning and never fails the store.
- **The ledger.** `ChildLedger.all()` holds its own root's tree, walked from the root through the parent links, not
  every child with the iteration's number — so neither a dead run's children nor an earlier plan cycle's (every cycle
  is numbered 0) count toward `maxTotal`, resolve a `depends_on` or become the credited child.
- **The task.** The dead iteration's todo task goes back to `pending` (`Todo.reopen`), so `selectNext` picks it again.
  What that iteration is sent is the open defect `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`:
  the launch content, as for every task that is not the run's own.
- **The continued task's id.** A continuation numbers the task it appends past the stored count, the highest
  iteration row and every id the todo already holds (`continuedTaskId`), so a new prompt never shares an id with a
  dead iteration's reopened one — the stale count had minted the same `continued:N` twice (found by the re-review).
- **The capture.** The dead iteration closes at that moment, so its one REQ-GIT-051 capture is attempted then, with no
  child credited; its hooks' `iteration_end` is not fired, since the hooks that saw it begin belonged to the dead run.

Evidence: `record.test.ts` (the left-open close, the continued prompt's crash, the todo-id belt, the capture, the
refused open) and `children.test.ts` ("a ledger holds its own root's tree…"), each red when its limb is reverted. Once `PD-ORCH-005`'s resume lands, an open iteration
is resumed rather than closed unless the user continues without its agents; the closing described here becomes that
declined path.
