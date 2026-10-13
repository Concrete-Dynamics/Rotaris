## A long persona name widens the Mission table past its card

Since fin36 the Mission table's persona cell keeps a persona on one line (`.agent-table__persona { white-space: nowrap }`,
`packages/ui/src/shell.css`), which repaired "coding-agent" breaking at its hyphen. The cell has no bound, so its min-content
width is the whole name: a table in automatic layout never narrows a column below that, and a long configured persona name
(a `personas:` entry is the user's to name) widens the table instead of being cut, so the card scrolls sideways at 1440×900 and
more so at the 1000×680 minimum window. The activity cell beside it is already bounded with an ellipsis and a title. Found by
fin36's review (`review:last-notes-and-optionals#1`), passed to fin38 as an optional finding; recorded before the repair. Only
"coding-agent" at 1440×900 was measured.

## Specs

- REQ-MONITOR-274 (the Mission table's per-agent rows); the design material draws a persona on one line, and draws no table that
  scrolls sideways. No requirement's text is contradicted by a name of the built-in length.

## Relevant files

- `packages/ui/src/shell.css` — `.agent-table__persona`, beside `.agent-table__activity`'s bounded cell.
- `packages/ui/src/AgentTable.tsx` — the persona cell.
- `packages/ui/src/layout-regression.test.ts`, `packages/ui/src/agent-table.test.ts` — the cell's rule and markup.
