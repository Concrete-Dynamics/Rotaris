## The Mission table says the record carries no compression count

The Mission view's agent table draws every agent's compressions cell as `not recorded`, titled "The record carries no
compression count in this build (REQ-MONITOR-281)." The record has carried the count since Part AH:
`AgentRecord.compressions` (`packages/contracts/src/children.ts`) is each agent's completed compressions, seeded once from
the session's `context_compressed` entries on a resume, and `runLevelAgent` (`packages/ui/src/agents.ts`) already sums it
for the run-level agent. The cell denies a figure the record holds, the same class as the inspector's caption sentence
repaired as acceptance A36
([`fixed/the-inspector-says-the-record-carries-no-run-level-prompt-reading.md`](the-inspector-says-the-record-carries-no-run-level-prompt-reading.md))
and live-run finding K1's "this build has no artifact store".

`docs/architecture/codebase.md`'s Part R row repeated the claim ("the compression count (REQ-MONITOR-281 — the record has
none)"); it is corrected there in place in the commit that records this note.

Noticed 2026-10-01 by the verifier of acceptance A36's repair (an optional finding) and confirmed by reading the code on
`fix-accept1-22`. Not repaired; not driven.

## Outcome — repaired 2026-10-01

- `packages/ui/src/AgentTable.tsx`: the `agent-table__compressions` cell draws `AgentRecord.compressions` as a monospaced
  figure, under the column header `Compressions`, which names the unit as the `Tool calls` header names its column's — so
  each count is labelled with its unit and separately identifiable (REQ-MONITOR-281); its tooltip words the count
  (`countNoun`, "1 compression"). The denying title and the `not recorded` text are gone. The Mission view has no design
  counterpart (`docs/design/README.md` §3.2), so the cell follows the table's own tool-call cell.
- Pinned by `packages/ui/src/agent-table.test.ts` ("REQ-MONITOR-281: the Mission table conveys each agent's compression
  count…"), red before (every cell `not recorded`).
- Shown by `pnpm compression-proof` scenario 5, new (`child-count`): a delegated child crosses the threshold once, the
  session records one `context_compressed` entry, and the Mission table's row for that child reads `1` under
  `Compressions`. Green on the repair; red on a build of the base's `AgentTable.tsx` ("the child's compressions cell reads
  ["not recorded"], not "1"").
- Not in this repair: the table has no row for the run-level agent (the run row sits in the delegation graph and shows
  the run's status), so the run-wide sum `runLevelAgent` computes is drawn nowhere; and the inspector and the persona
  window display per-agent metrics without the compression count. Both are recorded as
  [`the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md`](the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md).
- *Corrected 2026-10-02:* "`runLevelAgent` already sums it for the run-level agent" (above) was true of the children
  only — `session.agents` holds no root, so a root's own compressions were counted nowhere, and the sum was not the
  run-wide count. The record now carries that count (`SessionRecord.compressions`), repaired with the note above.

## Specs

- REQ-MONITOR-281: wherever per-agent metrics are displayed, the display conveys the agent's compression count
  (REQ-MONITOR-086), labelled with its unit. The table displays per-agent metrics and conveys none.
- REQ-MONITOR-086: the per-agent count is displayed per agent.

## Relevant files

- `packages/ui/src/AgentTable.tsx`: the `agent-table__compressions` cell, `not recorded` with the denying title (now the count).
- `apps/desktop/scripts/compression-proof.mjs` scenario 5 — the proof.
- `packages/contracts/src/children.ts`: `AgentRecord.compressions`, the figure the cell could draw.
- `packages/ui/src/agents.ts`: `runLevelAgent`, which sums it for the run-level agent.
- `docs/architecture/codebase.md`: the Part R row's "the record has none", corrected in place.
