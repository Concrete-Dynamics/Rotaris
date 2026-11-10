# Git — brief

**Status:** built 2026-11-10 on the branch `feat/r-097-ui-ux-overhaul` (not landed; the brief and its build are one pass under R-097, so no approval stands between them)
**Written:** 2026-11-10 by `design-ui` (audit; the brief's sections only where R-097 touches the view), for [R-097](../../product/requests.md#r-097)
**Surface:** the Git primary view; §7 row "Git worktrees, commits, diffs"; mockup section `GIT`; nearest built code `packages/ui/src/GitView.tsx`; theme `rotaris-dim`

An audit with the two sections its items need. Sections 2 to 7 and 9 are not written: R-097 changes no journey, state, interaction, string, accessible name or component here.

## 1. Authority

- `REQ-GIT-075`: the title "Git workspace" and the header row. `REQ-GIT-076`: two resizable columns and the four cards. `REQ-GIT-077`: the worktree columns and the Files cell's form `+<additions> -<deletions> / <files-touched>`. `REQ-GIT-079`: the per-row delete button, at least 28×24 px. All fixed.
- `REQ-SHELL-022`: the minimum window.
- Left open: how wide the Files column is.

## 8. Composition intent

The Files column takes the larger of its `12ch` floor and its widest figure plus the cell's padding, measured as the State column's phrase is (`stateColumnFit`, `--git-state-fit`), and the table's minimum grows by what the column took beyond its floor, so the card scrolls as it already does.

The page frame is the shared one ([`overview/04-audit-2026-11-10.md`](overview/04-audit-2026-11-10.md)).

Relations: none published; the delete button is held by `ui-audit`'s `STACKING` sweep, and the column's rule by `layout-regression.test.ts`.

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| worktrees table | Files holds its figure whole | same | same | same | same; the card scrolls sideways, as built |

## 10. Disagreements and gaps

None.

## 11. Evidence plan

Capture: `pnpm ui-audit --views=5`; drive on a repository whose worktrees carry four-digit additions (this checkout): `click ".nav-item" --text=Git`, `waitFor ".git__worktree-table tbody tr:nth-child(3)"`. Rubric rows: C3, D4.

**Must move:** the Files figure's overrun under the delete button, 16 to 24 px on four of five rows at 1440×900 → 0.
**Must hold:** `ui-audit` view 5 at both sizes: 0 findings; `layout-regression.test.ts`'s worktree rules, with the Files rule restated in the State rule's form; `git-proof`.

## Audit 2026-11-10

**Status:** proposed
**Pack:** `3927eda58823` (the base); `pnpm ui-audit` view 5; drive at 1440×900 on this checkout (five worktrees); theme `rotaris-dim`; by `design-ui`
**Unaudited:** the diff, the worktree dialogs, a session-bound row; `nocturne`, `high-contrast`
**Count:** rows answered 2 of 2 asked (C3, D4); no 1 (high 1); not captured 0
**Summary:** The worktree table already sizes State and Branch to their content and scrolls inside its card. Files does not, and a real repository's figure runs under the delete button.

| # | Criterion | Severity | Observation (with numbers; evidence) | Cause | Bounded change | Executes | Must move (now → passes) | Must hold | Answers to |
|---|---|---|---|---|---|---|---|---|---|
| 1 | D4 | high | `+5300 -431 / 102` is 115 px of text in a 92 px cell and runs 24 px under "Delete"; three more rows run 16 px under it (`5-git.png`; drive) | `.git__col-files { width: 12ch }`, a floor set by `+0 -0 / 0` | the measured fit of §8 | debug-ui | overrun 24 → 0 px | view 5: 0 findings; the delete button at least 28×24 px | `REQ-GIT-077`, `REQ-GIT-079` |

### Taste
- Each commit row's author wraps to two lines at the default split while the message is cut at twelve characters.

### Deliberately left
- The checkpoint card's unlabelled filter field and the tables at 1000×680: the record in `shell.css` holds two measured rounds on them.

### Open-question candidates
- None.

## Execution 2026-11-10

By `debug-ui`, on `feat/r-097-ui-ux-overhaul`. Evidence: `pnpm ui-audit` at both sizes (0 findings); a drive at 1440×900 on this checkout, five worktrees.

| # | Must move | Before | After | Must hold |
|---|---|---|---|---|
| 1 | the Files figure's overrun under the delete button | 24 px on one row, 16 px on three | 0: the figure ends 17 to 24 px before the button; the column is 132 px (`--git-files-fit`), 92 before | view 5: 0 findings; the delete button 54×24 px; the table 778 px in its 780 px card, no sideways scroll — held |

The test that pinned `width: 12ch` now pins `max(12ch, var(--git-files-fit, 12ch))` and the figure's `inline-block` and `nowrap`, the State column's form; the table's minimum reads `34ch` plus the three measured columns, the same sum at the floors.

Not run: `git-proof`.

## Critique 2026-11-10

The critique is the independent, report-only `review-ui` reading of the pack `9401038db662/iteration-1` (18 findings: 4 high, 7 medium, 7 low; `critique.json` is not committed, `.ui-review/` being ignored). A finding repaired here is `implemented`, not `verified-resolved`: that takes a fresh pack read in a fresh context.

| Finding | Severity | What it read | Outcome |
|---|---|---|---|
| UIR-013 | low | the card kickers of one column stand on two edges (x 147 against 154; 896 against 901): a table card's head is inset 14 px, a plain card 20 px; predates R-097 | open |
| UIR-018 | low | two scrollbar treatments 175 px apart at 1000×680, a plain thumb on the worktrees card and a thumb between platform arrows on the checkpoint table; predates R-097 | open |

Checked and sound: the Files figures whole on the real repository, ending 17 px before "Delete".
