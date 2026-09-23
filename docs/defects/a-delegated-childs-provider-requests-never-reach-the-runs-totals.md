## A delegated child's provider requests never reach the run's totals

A run's token totals and its cost count the entry agent's provider requests and nobody else's. The run
counts usage through one callback, `Run.onRequestUsage` (`packages/engine/src/run/run.ts:698`), which it
hands to the entry agent's turn (`run.ts:819`). The turn a delegated child runs is built in
`IterationChildren` (`packages/engine/src/children/orchestration.ts:338-351`) with no `onRequestUsage`
at all, so `observeRequestUsage` in `packages/engine/src/run/turn.ts:176-179` adds the child's usage to
the child's own turn total and passes it no further. The session's `tokens_input`, `tokens_output` and
`cost`, and every `usage.update`, leave out all work done below the entry agent, including a cost the
provider reported for a child's request under `PD-MONITOR-001`.

Found 2026-09-23 while designing configured per-token prices (R-048, item 7). A configured rate would
inherit the same gap, so this has to be repaired before or together with that work. Not measured on a
live run; established by reading the call path.

## Specs

- `REQ-EVENTS-053`: exactly one `usage.update` per completed provider request that contributes usage to
  the run-to-date cumulative totals. A child's request is a completed provider request of the run and
  produces none.
- `PD-MONITOR-001`: a run's cost total is the exact decimal sum of the per-request figures it received.
  Figures reported for children's requests are received and not summed.

## Relevant files

- `packages/engine/src/children/orchestration.ts`: the child's `runTurn` deps, which pass no `onRequestUsage`.
- `packages/engine/src/run/run.ts`: `onRequestUsage`, the one place usage joins the aggregates.
- `packages/engine/src/run/turn.ts`: `observeRequestUsage`, which forwards only when a callback is given.
- `packages/engine/src/run/aggregates.ts`: `addTurnUsage` and `addCost`, reached only for the entry agent.
