## The inspector's meta line reads the run-level agent running while the run is cancelling

Since acceptance A35's repair a confirmed cancel of the run shows the session `cancelling` on every surface of the window
that sent it, and a persona window's run instance reads `cancelling` (`agentStateLabel`, `packages/ui/src/agents.ts`).
The inspector does not: its meta line (`metaLine`) starts with the run-level agent's `presentationState`, and
`runLevelAgent` presents every busy status as `running`, so with the run-level agent shown the main window reads
`Cancelling…` in its run header and `running · 1m 4s · 3 tool calls` in its inspector at the same time, until the run's
record at rest arrives. The engine's own `cancelling` (the stop's) reads the same way.

Noticed 2026-10-01 by reading the code while repairing the persona window's half of A35 on `fix-accept1-22`. Not driven
and not repaired: the repair asked for was the persona window's, and the one function would serve here too
(`agentStateLabel(shown, session)` in `metaLine`'s place).

## Specs

- REQ-MONITOR-127: on confirmation the session status is optimistically set to `cancelling`.
- REQ-MONITOR-130: the same observable state whichever surface asks.
- REQ-MONITOR-052: the inspector's meta line `{state} · …`; which vocabulary `{state}` takes for the run-level agent
  while the run is cancelling is OQ-158's reading (the agent vocabulary has no `cancelling`).

## Relevant files

- `packages/ui/src/Inspector.tsx`: the meta line (`inspector-meta`), and the dot beside the name.
- `packages/ui/src/agents.ts`: `metaLine`, `runLevelAgent`, and `agentStateLabel`, which the persona window reads.
