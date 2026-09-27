## A crashed iteration's number is reused by the next run

`iterationsCompleted` is incremented only when an iteration finishes, and the next run numbers its first iteration
`iterationsCompleted + 1`. A run host that dies mid-iteration therefore leaves that iteration's children under number N,
and the continued run's first iteration is N again. The ledger's `all()` is scoped by `(session, iteration)`, so the new
iteration sees the crashed one's rows: they count toward `maxTotal`, `depends_on` can resolve against them, and
`creditedChild` reads them. The todo task the crashed iteration held is also left `in_progress` by the sampler, and
`selectNext` never picks an `in_progress` task again. Plan cycles all run as iteration 0, with the same effect between
cycles.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-ORCH-046` (the per-iteration total-children limit) and `REQ-ORCH-038` (`depends_on` names an existing child of
the same parent) are read against the wrong set of children; the orphaned task contradicts `REQ-ORCH-004` (a resumed
session's todo state carries on).

## Relevant files

- `packages/engine/src/run/run.ts` — `iterationsCompleted`, the iteration number, the 10 s sampler that saves `in_progress`.
- `packages/engine/src/children/ledger.ts` — `all()` → `childrenOfIteration`.
- `packages/engine/src/run/todo.ts` — `selectNext`, which skips `in_progress`.
