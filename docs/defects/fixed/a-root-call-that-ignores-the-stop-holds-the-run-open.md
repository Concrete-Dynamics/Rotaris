## A root call that ignores the stop holds the run open for good

A stop aborts the run's signal, and REQ-SESSION-092's 30 s grace then forces the stop. The root agent's turn is still
awaited to its end. A tool call of the root that never settles, because its executor ignores the abort, leaves
`Run.turn` waiting forever. So the run never reaches teardown, the session stays `running` under its lock, and
nothing ends it short of the process. PD-ORCH-005's rest bounds how long it waits for *child* executions (the grace,
after which they are detached), but the root is not a child execution and has no such bound. The same happens before
PD-ORCH-005's phase 3: this is not a regression of it. Found by phase 3's third adversarial review
(`root-hang.test.ts` in the reviewer's scratch directory).

## Specs

REQ-SESSION-092 and REQ-MONITOR-129 bound a stop at 30 s ("the deadline hard-cancels and sweeps again"). A root call
that ignores the abort defeats the bound. The bound holds only for calls that honour their signal.

## Relevant files

- `packages/engine/src/run/run.ts`: `turn()` awaits the root's `runWithChildren` / `firstTurn` with no bound, and the
  stop listener's forced second request only aborts again.
- `packages/engine/src/children/orchestration.ts`: `rest()` bounds the children's executions with `STOP_GRACE` and
  detaches the rest. This is the shape a root bound would take.
- `packages/engine/src/run/turn.ts`: `await tools.dispatch(call, callSignal)` has no bound of its own.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. `Run.turn` no longer awaits the root's turn without a bound: it races it against
`Run.stopGraceSpent`, which settles `STOP_GRACE` (30 s) after the first stop request, forced at its first activation or
not, so a root that honours a forced stop a moment late still records its step. Past the grace the root is detached as a
rest detaches a child execution. Its turn's `detached` reads true, so when its call returns it writes nothing more
(REQ-SESSION-094). A stop or a quit leaves it `paused` with its open call answered as interrupted (`answerOpenCalls`).
Under the explicit cancel the iteration closes `cancelled` and that call is answered as cut off, naming no rest
(`answerOpenCalls` now takes a null cause; OQ-96's "A call cut by no rest"), so no row is left `running`
(REQ-SESSION-129). The children's rest that follows is given what is left of the grace, which is none
(`IterationChildren.rest(cause, grace)`): every child execution was aborted by the same request, so the one 30 s bounds
the root and the children together instead of the root's 30 s and then a second 30 s for the children.

Evidence: five cases in `packages/engine/src/children/children.test.ts` ("a root call that ignores the stop no longer
holds the run open"): a stop ends at 30 s and not at 29 s, releases the lock, leaves the iteration open by `stop` and
answers the root's call; a stop forced at its first activation still waits the whole grace; a root and a child that both
ignore the stop end at the one 30 s; the explicit cancel closes the iteration and answers the call as cut off; a call
that returns after the run ended writes no event, row or record entry. All five failed on the code before the repair
(the run never ended), and reverting each limb in turn turned exactly its case red. ADR-0014 carries the first
execution, and OQ-96's bullet "An execution the stop's grace gives up on" is reported back in place.

The tool gate's own writes when the detached call returns were
[`a-detached-call-still-writes-through-its-tool-gate.md`](a-detached-call-still-writes-through-its-tool-gate.md)'s,
repaired the same day. What stays open: the root's calls before the detach join no session total, as a raise's did not before
([`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](../a-roots-calls-before-a-crash-never-reach-the-session-total.md)).
