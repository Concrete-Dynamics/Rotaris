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
(REQ-SESSION-129). The children's rest that follows is given what is left of the grace, counted from the same first
request (`Run.stopGraceLeft`, passed to `IterationChildren.rest(cause, grace)`): none after a root given up on, and one
second after a root that returned at 29 s. Every child execution was aborted by the same request, so the one 30 s bounds
the root and the children together instead of the root's time and then a second 30 s for the children. *As first built
the rest was given none only after a root given up on and a fresh 30 s otherwise, so a root that returned just short of
the grace still let the stop take about 60 s, which the record above already claimed prevented (found by the verifier
of this repair, 2026-09-29).* Under the explicit cancel, what still executes beside the root is detached with it once
the records are settled (`IterationChildren.outlast`), so a child's step or call that ignored the cancel writes nothing
into the finished session either, and a root given up on still drains the active background children as REQ-ORCH-080
asks, bounded by the drain's own timeout (OQ-119). *As first built the explicit cancel settled the children's records
and left their executions attached, so a child step that ignored the cancel appended its rows and `usage.update` after
`result`; and the early return of a root given up on skipped the drain (both found by the same verifier).*

Evidence: eight cases in `packages/engine/src/children/children.test.ts` ("a root call that ignores the stop no longer
holds the run open"): a stop ends at 30 s and not at 29 s, releases the lock, leaves the iteration open by `stop` and
answers the root's call; a stop forced at its first activation still waits the whole grace; a root and a child that both
ignore the stop end at the one 30 s; the explicit cancel closes the iteration and answers the call as cut off; a call
that returns after the run ended writes no event, row or record entry. All five failed on the code before the repair
(the run never ended), and reverting each limb in turn turned exactly its case red. The repair round added three: under
the explicit cancel a child step beside the root given up on writes nothing when it returns; a root given up on still
drains a background child and records `background_child_drain_timeout`; a root that returns at 29 s leaves the rest one
second, so the stop ends at 30 s. All three failed on the first build of this repair. ADR-0014 carries the first
execution, and OQ-96's bullet "An execution the stop's grace gives up on" is reported back in place.

The tool gate's own writes when the detached call returns were
[`a-detached-call-still-writes-through-its-tool-gate.md`](a-detached-call-still-writes-through-its-tool-gate.md)'s,
repaired the same day. What stays open: the root's calls before the detach join no session total, as a raise's did not before
([`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](../a-roots-calls-before-a-crash-never-reach-the-session-total.md)).
