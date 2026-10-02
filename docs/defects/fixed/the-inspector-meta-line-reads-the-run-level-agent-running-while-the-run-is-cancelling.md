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

## Outcome — repaired 2026-10-01

- `packages/ui/src/agents.ts`: `metaLine(agent, session, elapsed)` takes the shown session and starts with
  `agentStateLabel(agent, session)`, the persona window's word, instead of `presentationState`; `packages/ui/src/Inspector.tsx`
  passes the session it is given, which `apps/desktop/src/renderer/main.tsx` reads through the window's cancel overlay
  (`useShownSession`). Under OQ-165's built reading the run-level agent reads `cancelling` while it is live and the shown
  session reads `cancelling` — a confirmed cancel's overlay, or the stop's own record; a child keeps the agent vocabulary;
  the dot beside the name keeps `presentationState`, so the live instance keeps its `running` motion (REQ-SHELL-075 (a)).
  OQ-165 records that its reading now reaches the inspector; the question itself (whether the engine writes `cancelling`
  for the explicit cancel) stays open and is the owner's.
- Pinned by `packages/ui/src/agents.test.ts` ("REQ-MONITOR-127/130 with OQ-165's reading: the run-level agent's meta line
  reads the run's `cancelling` …"), red before ("running · …" for "cancelling · 1m 4s · 3 tool calls"), and by
  `packages/ui/src/persona-run-cancel.test.ts` ("the inspector's meta line shows a confirmed run cancel on the run-level
  agent"), which renders the inspector under `beginRun` and was red on the base's `agents.ts` and `Inspector.tsx`
  ("expected 'running · 1m 4s · 3 tool calls' to be 'cancelling · 1m 4s · 3 tool calls'").
- Shown by `pnpm mission-proof` item 4d, new: the Workspace inspector following the run-level agent, its Cancel confirmed
  as "Cancel the run?", the run header and the meta line read in one snapshot. Green on the repair (three snapshots
  `Cancelling…` beside `cancelling · 5s · 1 tool call`, then `Paused` beside `cancelled · …`); red on a build of the base's
  `agents.ts` and `Inspector.tsx` (four snapshots `Cancelling…` beside `running · 5s · 1 tool call`). How many snapshots
  land inside the `Cancelling…` window is host timing and is recorded, not asserted. The first two runs of the whole proof
  on the repair then went red at item 8 (the reconcile pop-out) under a load average near 15, and a third, at about 6 to
  11, went green whole (item 4d again three snapshots `cancelling`): a proof timing defect under the host's load, recorded as
  [`mission-proofs-reconcile-launch-probes-the-persona-window-before-its-first-paint.md`](../mission-proofs-reconcile-launch-probes-the-persona-window-before-its-first-paint.md).

## Specs

- REQ-MONITOR-127: on confirmation the session status is optimistically set to `cancelling`.
- REQ-MONITOR-130: the same observable state whichever surface asks.
- REQ-MONITOR-052: the inspector's meta line `{state} · …`; which vocabulary `{state}` takes for the run-level agent
  while the run is cancelling is OQ-165's reading (the agent vocabulary has no `cancelling`).

## Relevant files

- `packages/ui/src/Inspector.tsx`: the meta line (`inspector-meta`), and the dot beside the name.
- `packages/ui/src/agents.ts`: `metaLine`, `runLevelAgent`, and `agentStateLabel`, which the persona window reads and
  `metaLine` now reads too.
- `apps/desktop/scripts/mission-proof.mjs` item 4d — the proof.
