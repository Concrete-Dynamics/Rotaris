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

## Outcome

Driven and repaired 2026-10-13 (fin35, branch `fin35-notes-and-optionals`). **Measured first**, in the built app at
1440 × 900 with a child that read once and then held its next call silent past `child_stall_timeout: 3` (the launch that is
now `pnpm mission-proof` item 1f — built as 1e and renumbered at the landing, origin/main's 1e being PD-TOOLS-006
revision 6's todo-item launch; load about 7 on 4 CPUs): beside `running · 3s` the 78 px `stalled 3s` tag cut the Workspace
sidebar row's main column to 41 px, broke "coding-agent" over two lines (persona 41 × 36 px at a 17.8 px line height) and
grew the row to 61 px; in the Mission table the tag sat beside the state, the state cell was 142 px and the card scrolled
32 px sideways (942 of 910 px). The mechanism this note named held as written.

**Repair.** The same as the timed-out tag's: `AgentTree.tsx` gives the meta label `agent-row__meta--stacked` while the agent
is stalled, and `shell.css` puts `.agent-table__state .agent-row__stalled` on a line of its own under the state, beside the
timed-out rule. **After** (same launch, load about 7 to 8): the row 50 px, the main column 119 px, the persona 119 × 18 px
(one line), the tag right-aligned under `running · 3s`; the Mission state cell 84 px with the tag under the state, the card
910 of 910 px. Pinned by `packages/ui/src/agent-clock.test.ts` (the stalled row's meta label is `--stacked`, a recovered
row's is not; red before) and `pnpm mission-proof` item 1f (red on the build before: "the sidebar row: persona
{"w":41,"h":36,…}"). The persona window draws the tag in its context line, which is not narrow, and is unchanged.

Seen beside it and recorded, not repaired: the Mission table's persona cell breaks "coding-agent" at its hyphen with or
without any tag ([`the-mission-tables-persona-cell-breaks-a-hyphenated-persona-over-two-lines.md`](the-mission-tables-persona-cell-breaks-a-hyphenated-persona-over-two-lines.md); repaired since by fin36).
