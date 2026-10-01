## The Mission table says the record carries no compression count

The Mission view's agent table draws every agent's compressions cell as `not recorded`, titled "The record carries no
compression count in this build (REQ-MONITOR-281)." The record has carried the count since Part AH:
`AgentRecord.compressions` (`packages/contracts/src/children.ts`) is each agent's completed compressions, seeded once from
the session's `context_compressed` entries on a resume, and `runLevelAgent` (`packages/ui/src/agents.ts`) already sums it
for the run-level agent. The cell denies a figure the record holds, the same class as the inspector's caption sentence
repaired as acceptance A36
([`fixed/the-inspector-says-the-record-carries-no-run-level-prompt-reading.md`](fixed/the-inspector-says-the-record-carries-no-run-level-prompt-reading.md))
and live-run finding K1's "this build has no artifact store".

`docs/architecture/codebase.md`'s Part R row repeated the claim ("the compression count (REQ-MONITOR-281 — the record has
none)"); it is corrected there in place in the commit that records this note.

Noticed 2026-10-01 by the verifier of acceptance A36's repair (an optional finding) and confirmed by reading the code on
`fix-accept1-22`. Not repaired; not driven.

## Specs

- REQ-MONITOR-281: wherever per-agent metrics are displayed, the display conveys the agent's compression count
  (REQ-MONITOR-086), labelled with its unit. The table displays per-agent metrics and conveys none.
- REQ-MONITOR-086: the per-agent count is displayed per agent.

## Relevant files

- `packages/ui/src/AgentTable.tsx`: the `agent-table__compressions` cell, `not recorded` with the denying title.
- `packages/contracts/src/children.ts`: `AgentRecord.compressions`, the figure the cell could draw.
- `packages/ui/src/agents.ts`: `runLevelAgent`, which sums it for the run-level agent.
- `docs/architecture/codebase.md`: the Part R row's "the record has none", corrected in place.
