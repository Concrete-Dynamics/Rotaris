## The Git view's worktree State cell overruns the Ahead column

A worktree row bound to a session draws its State cell as the session's status followed by ` · {merge status}`
(`completed · ready`, REQ-GIT-109). At the opening window size (1440×900) that text is wider than the State column, is
neither wrapped nor shortened, and runs on under the next cell: the Ahead figure is painted over it, so the row reads
`completed · r0ady` / `completed · r1ady`, the Ahead figure on top of `ready`'s `e`. Seen in `pnpm git-proof`'s
`isolated.png` (launch 3) and `worktree-ahead.png` (launch 3b), 2026-10-03, while repairing the status strip's worktree
branch (acceptance F8); only a row bound to a session carries the longer status word, so the unbound `idle · ready` rows
fit. The same screenshot shows the base row's branch name cut to `ma…` beside its `base`
and `active` tags, which may be the column budget working as intended. Not repaired: outside that task.

## Specs

- REQ-GIT-109: a matched worktree carries the session's execution status and the binding's merge status; drawn over by
  the next column, the merge status is not legible.
- REQ-SHELL-022 states the labels rendered in full at the minimum window only; no requirement names this table's column
  widths, so the overrun contradicts no stated figure — it is a craft defect against the adopted design language's table
  (`docs/design/README.md`), which never lets one cell paint into another.

## Relevant files

- `packages/ui/src/GitView.tsx`: the worktree row's `td.git__cell-state` (`{status}<span class="git__merge-status"> · {merge}</span>`).
- `packages/ui/src/shell.css`: `.git__merge-status` and the worktree table's column rules.
- `apps/desktop/scripts/git-proof.mjs`: launches 3 (`isolated`) and 3b (`worktree-ahead`) paint the bound row; no assertion reads its geometry.

## Outcome (2026-10-04, fin14, repaired)

Confirmed first on the unrepaired build by a geometry assertion `pnpm git-proof` did not have: the State cell's `·` and
`ready` painted at 575.9 to 613.8 px in a cell spanning 504.2 to 580.5 at 1440×900 (launches 3 and 3b), and at the
1000×680 minimum `ready` reached 364.7 px in a cell ending at 331.4. The measuring found two more faults of the same table, repaired with it:

- **The State column.** A fixed `10ch` (76.3 px that day) held `idle · ready` (59.6 px of text) and not
  `completed · ready` (101.6 px). `10ch` stays the floor; GitView measures each row's phrase (an inline-block that never
  wraps, so it measures its own text and never the column) and hands the widest, plus the cell's padding, to the column
  as `--git-state-fit` (`stateColumnFit`); a `ResizeObserver` re-measures when a face or the type scale changes a phrase.
  The table's minimum grows by what the column takes beyond its floor, so Branch keeps its remainder at the minimum and
  the card scrolls as it already did. Both vocabularies are closed, but their longest pairing would take a third of the
  pane from every table, so the column is as wide as the phrases shown.
- **The base row's `ma…` at 1440×900 — not the column budget working as intended.** The design material draws a branch
  name whole: `main` beside its `primary` tag in the Git screen's worktree card, and whole with no tag in the Overview's
  worktree card (the mockup's `Home` screen). The Branch column had room: 302 px. (Corrected 2026-10-04 by fin16, read
  from `pnpm mockup`; this paragraph first said "`main` beside `primary` in the Git screen and the Overview's worktree
  card", but the Overview's card draws no tag.) The cell is `display: flex`, so it is not a table cell, and the `22ch` cap it shared with
  Session held the flex box to 158 px inside that column. The cap is gone from Branch (Session, a real table cell, keeps
  it); `main` is drawn whole beside `base` and `active`.
- **The Branch heading at the minimum.** The table's `63ch` left Branch 7ch (53.5 px) at 1000×680, and the heading
  `Branch` ran to 193.6 px in a cell ending at 186.4, under Session. The cells elide; a heading does not, so Branch now
  keeps 9ch there.

Pinned by `pnpm git-proof` (launch 3 at 1440×900; launch 3b at 1440×900 and, resized, at 1000×680 with a PNG kept as
`worktree-ahead-minimum.png`), which measures every heading and body cell of the worktree table through
`apps/desktop/scripts/lib/cell-paint.mjs` and fails on a run painted past its cell or cut outside the two columns that
elide by design (Branch, Session), and on the base row's `main` not drawn whole at 1440×900. All four were red on the
unrepaired build and are green on the repair. The verdict is a pure function with its test beside it
(`cell-paint.test.ts`); `packages/ui/src/ui.test.ts` pins `stateColumnFit` and `statePhrase`, and
`packages/ui/src/layout-regression.test.ts` the three CSS rules (each red on the unrepaired stylesheet).

At the minimum the base row's Branch cell draws its `base` tag and no character of `main` (nor the `active` tag, past the
cell's edge): the 9ch the column has there is spent on the tags before the name. That is recorded on its own
([the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md](../the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md)).
The State cell still rendered the persisted execution status rather than its presentation, also recorded on its own and repaired the same day by fin16
([the-git-views-state-cell-renders-the-raw-persisted-execution-status.md](the-git-views-state-cell-renders-the-raw-persisted-execution-status.md)).
