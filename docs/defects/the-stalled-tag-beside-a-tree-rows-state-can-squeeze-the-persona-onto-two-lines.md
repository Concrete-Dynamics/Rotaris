## The stalled tag beside a tree row's state can squeeze the persona onto two lines

A delegation-tree row (`packages/ui/src/AgentTree.tsx`) is a flex row whose meta label (`.agent-row__meta`,
`white-space: nowrap` in `packages/ui/src/shell.css`) holds the state, the elapsed figure and, while the stall watch finds the
agent stalled, REQ-ORCH-089's `tag-wait` badge (`stalled Ns`) beside them. The meta label does not shrink, so every pixel the
badge adds is taken from the persona-and-task column (`.agent-row__main`).

Measured on 2026-10-07 while building PD-CONFIG-003 revision 3 (fin33), with the timed-out tag that first sat in the same slot:
in the Workspace sidebar of a 1440 × 900 window (row 235 px wide), a 71 px tag beside `failed · 1m 7s` cut the main column
from 112 px to 35 px, broke "coding-agent" over two lines and grew the row from 44 to 61 px; in the Mission table the same tag
widened the state cell by 70 px and the card scrolled 14 px sideways. The timed-out tag was moved onto a line of its own for
that reason. The stalled badge (`stalled 95s`, about the same width) sits in the same nowrap label and the same table cell, so
it should squeeze the row the same way while an agent is stalled; that case was **not driven** (no stalled agent was on
screen), so this note records the mechanism and the measured sibling, not a measurement of the badge itself.

## Specs

None contradicted outright: REQ-MONITOR-041's "row content never changes the panel's width" holds (the panel kept its
width). REQ-MONITOR-043 puts the persona first with the task title on the line below; a persona broken over two lines reads
against that layout, and the design material's agent rows (`docs/design/`, the `agents panel` block) keep a row on one line
with the qualifier tag at its end.

## Relevant files

- `packages/ui/src/AgentTree.tsx` — the row and its meta label, where the stalled badge is drawn.
- `packages/ui/src/AgentTable.tsx` — the Mission table's state cell, where the badge sits beside the state text.
- `packages/ui/src/shell.css` — `.agent-row__meta` (`white-space: nowrap`), `.agent-row__stalled`, and the
  `.agent-row__meta--stacked` rule the timed-out tag uses.
