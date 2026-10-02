## The inspector and a persona window show per-agent metrics without the compression count

REQ-MONITOR-281 asks every display of per-agent metrics to convey the agent's token count, tool-call count and
compression count. Since the Mission table's repair (2026-10-01) the table does; the other two surfaces that display
per-agent metrics do not. The Workspace inspector's meta line reads `{state} · {elapsed} · {n} tool calls` and its ring
caption the agent's tokens, and a persona window's context card reads `{n} tool calls · {elapsed}` and the tokens, but
neither draws `AgentRecord.compressions`, which the record has carried since Part AH. The run-wide count REQ-MONITOR-086
makes readable at any time — the sum `runLevelAgent` already computes as the run-level agent's `compressions` — is drawn
by no surface: the Mission table has no row for the run-level agent, and the inspector and the persona window, which
draw the run-level agent, show no count.

Noticed 2026-10-01 while repairing the Mission table's cell on `fin3-run-agent-readings`
([`fixed/the-mission-table-says-the-record-carries-no-compression-count.md`](fixed/the-mission-table-says-the-record-carries-no-compression-count.md)).
Not repaired: outside that task.

## Specs

- REQ-MONITOR-281: wherever per-agent metrics are displayed, the compression count is conveyed, labelled with its unit.
  The inspector and the persona window display the token and tool-call counts and not this one.
- REQ-MONITOR-086: the run-wide count, the sum of the per-agent counts, is readable at any time during and after the
  run. No surface reads it.

## Relevant files

- `packages/ui/src/agents.ts`: `metaLine` (the inspector's meta line) and `runLevelAgent`, whose `compressions` is the sum.
- `packages/ui/src/Inspector.tsx`: the meta line and the ring caption.
- `packages/ui/src/PersonaWindow.tsx`: the context card's `persona-context-line`.
- `packages/ui/src/AgentTable.tsx`: the one surface that draws the count, per child.
