## The Mission table's persona cell breaks a hyphenated persona over two lines

In the Mission view's agent table (`packages/ui/src/AgentTable.tsx`, `.agent-table__persona`), the persona cell carries no
`white-space` rule, so the table's automatic layout gives it the narrowest width it can and the browser breaks a persona name
at its hyphen. Measured on 2026-10-13 in the built app (fin35, `pnpm mission-proof` item 1f's launch, a 1440 × 900 window,
one child of persona `coding-agent`): the persona column is 65 to 71 px wide and "coding-agent" reads "coding-" over
"agent", with a stalled tag in the state cell, and the same with no tag at all once the child is `done` (the launch's end
screenshot). The activity cell beside it is held at 200 px with an ellipsis, so the persona is the column that gives way.
Noticed while driving the stalled tag ([`the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md`](fixed/the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md),
repaired in the same round); not caused by it and not repaired.

## Specs

None contradicted outright: REQ-MONITOR-274..276 fix the table's columns, not their wrapping. The design material keeps a
persona on one line wherever it draws one (`docs/design/`, the `agents panel` block's rows), and a persona name is one
identifier, so a break at its hyphen reads as two words.

## Relevant files

- `packages/ui/src/AgentTable.tsx` — the row, `agent-table__persona`.
- `packages/ui/src/shell.css` — `.agent-table` and `.agent-table__activity` (`max-width: 200px`), no rule for the persona cell.
- `apps/desktop/scripts/mission-proof.mjs` — item 1f reads the row's cells (`cells`) while the child is stalled.
