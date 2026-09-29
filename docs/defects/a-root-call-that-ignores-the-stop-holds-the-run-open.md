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
