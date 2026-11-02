## The Mission table's persona cell breaks a hyphenated persona over two lines

In the Mission view's agent table (`packages/ui/src/AgentTable.tsx`, `.agent-table__persona`), the persona cell carries no
`white-space` rule, so the table's automatic layout gives it the narrowest width it can and the browser breaks a persona name
at its hyphen. Measured on 2026-10-13 in the built app (fin35, `pnpm mission-proof` item 1f's launch, a 1440 × 900 window,
one child of persona `coding-agent`): the persona column is 65 to 71 px wide and "coding-agent" reads "coding-" over
"agent", with a stalled tag in the state cell, and the same with no tag at all once the child is `done` (the launch's end
screenshot). The activity cell beside it is held at 200 px with an ellipsis, so the persona is the column that gives way.
Noticed while driving the stalled tag ([`the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md`](the-stalled-tag-beside-a-tree-rows-state-can-squeeze-the-persona-onto-two-lines.md),
repaired in the same round); not caused by it and not repaired.

## Outcome

Repaired 2026-10-13 (fin36, branch `fin36-last-notes-and-optionals`). **Before**, confirmed on the branch: `pnpm mission-proof`
item 1f, with a new reading of the stalled row's persona cell (its text and the number of distinct line tops its text box
covers), failed on a build of the branch with the repair set aside — `the Mission table's persona cell: {"text":"coding-agent",
"w":71,"lines":2}` (1440 × 900, load 1.1 to 1.8 on 4 CPUs). The design material reads first (`pnpm mockup`, the `agents
panel` block): a persona is drawn on one line wherever it is drawn, as a neutral tag beside the name, never broken.

**Repair.** `shell.css` gives `.agent-table__persona` `white-space: nowrap`, as its neighbours `__state`, `__context` and
`__actions` already were; the activity cell keeps its 200 px bound and its ellipsis. **After** (the same item on the repaired
build, load 1.1 rising to 4.7 with sibling plans' agents): the persona cell 85 px and one line, the row's cells
`[84, 50, 85, 200, 51, 63, 114, 101, 123]` px, the card unscrolled (910 of 910 px), the stalled tag still on its own line
under the state; the whole proof green (exit 0). The box it lives in was checked, not only the cell (build-ui step 8): the
card did not start scrolling. Pinned by `packages/ui/src/layout-regression.test.ts` ("keeps a persona on one line in the
Mission table", red before) and by `pnpm mission-proof` item 1f's persona assertion (red before, as above). `pnpm ui-review`
was not run: its pack draws no Mission table with an agent in it, so it could not show this cell; item 1f's geometry is the
evidence.

## Specs

None contradicted outright: REQ-MONITOR-274..276 fix the table's columns, not their wrapping. The design material keeps a
persona on one line wherever it draws one (`docs/design/`, the `agents panel` block's rows), and a persona name is one
identifier, so a break at its hyphen reads as two words.

## Relevant files

- `packages/ui/src/AgentTable.tsx` — the row, `agent-table__persona`.
- `packages/ui/src/shell.css` — `.agent-table` and `.agent-table__activity` (`max-width: 200px`), no rule for the persona cell.
- `apps/desktop/scripts/mission-proof.mjs` — item 1f reads the row's cells (`cells`) while the child is stalled.
