## The Git view's base row hides its branch name behind its tags at the minimum window

At 1000×680 the worktree table's Branch column has 9ch (68.7 px), and the base row's Branch cell spends it on its two
tags, `base` and `active`, which never shrink (`.git__cell-branch .tag { flex: 0 0 auto; }`): the branch name `main` is
left zero pixels, so not one character of it and no ellipsis is drawn; `base` is drawn whole (154.9 to 195.5 px in a cell
ending at 201.6) and `active` lies wholly past the cell's edge, so it is not drawn either. The
name is in the span's tooltip and the row's title carries the path, but on screen the row that is the workspace's own
checkout does not say which branch it is on. Measured 2026-10-04 by `pnpm git-proof` launch 3b
(`worktree-ahead-minimum.png`; `main` laid out at 146.9 to 175.7 px with its visible span 146.9 to 146.9) while fin14
repaired the State cell. A non-base row's name elides with its marker as UIR-002 intends; only a row carrying tags loses
its name whole. Not repaired: which gives way first at the minimum, the name or the tags, is a choice the design material
makes (it draws the name whole beside one tag and has no minimum-width rendering of this table), not a CSS nudge.

## Specs

- None directly: REQ-GIT-077 names the base and active markers and REQ-SHELL-022 states labels rendered in full at the
  minimum window only for the labels it lists. It is a craft defect against the adopted design language's elision, which
  shortens text with a marker and keeps the full text in the tooltip (`docs/design/README.md`; UIR-002 in shell.css).

## Relevant files

- `packages/ui/src/shell.css`: `.git__cell-branch` (a flex box), `.git__cell-branch .tag { flex: 0 0 auto; }` and the worktree table's minimum width.
- `packages/ui/src/GitView.tsx`: the Branch cell — the name span, then the `base` and `active` tags.
- `apps/desktop/scripts/git-proof.mjs`: launch 3b measures the table at 1000×680; Branch is an eliding column there, so a cut name is no finding.

## Outcome (2026-10-04, fin16, repaired)

Confirmed first on the unrepaired build by `pnpm git-proof` with its new assertions (load average 0.25 at the start):
launch 3 at 1440×900 failed on the second fault below — the `feature/proof` row's Branch cell 308.19..342.63 px in a row
spanning 308.19..347.19, the bound row's 347.19..380.63 of 347.19..385.69 — and, with that one check made to log rather
than throw for a single diagnostic run, launch 3b at 1000×680 failed on this note's fault: the base row's `main` laid out
146.9..175.7 px with its visible span 146.9..146.9, `[base]` 154.9..195.5 and `[active]` 203.5..256.4 in a cell ending at
201.6.

**What the design material draws, and what gives way.** Read with `pnpm mockup`: the Git screen's worktree card draws
`main` in the mono face beside one `tag-neutral` tag, `primary`, with `--rt-space-2` between them, and the other two
worktrees draw their long names (`wt/req-billing-142-invoice-pdf`) whole beside one status tag; the Overview's worktree
card draws `main` whole and alone. No tag is ever shortened or dropped, and the material has no minimum-width rendering
of this table. So of the three choices this note named: **the tags hold** (they are REQ-GIT-077's base and active
markers, short words, and compacting one would invent a form the material never draws); **the name elides with its
marker**, as UIR-002 intends, but to a floor of its first character and the marker (`.git__branch-name`'s `min-width:
2ch`, in its own monospace face), never to nothing; and **the column budget moves** so that floor is kept: Branch takes the
larger of its heading's 9ch and the widest row's line at that floor — name floor, every tag whole, the `--rt-space-2` gap
before each, plus the cell's padding — measured by GitView (`branchLineFloor`, `branchColumnFit`) into `--git-branch-fit`.
The table's minimum is now the four fixed columns' 46ch plus the State and Branch floors, and the card scrolls as it
already did. At 1000×680 the base row reads `m…` beside `base` and `active`; at 1440×900 `main` is still whole.

**The Branch cell did not fill its row (fin14's verifier, predating fin14).** The cell was itself `display: flex`, so it
was not a table cell: the browser wrapped it in an anonymous cell, and its own box was only as tall as its content, so its
border and the selected row's background stopped short of the row's wherever a neighbour was taller (a row with a Delete
button) — visible in `worktree-ahead.png` at both sizes. The flex box is now `.git__branch-line`, a wrapper inside the
cell; the `td` is a table cell again and keeps the table's semantics. The superseded reasoning is kept above its
replacement in `packages/ui/src/shell.css`.

Pinned by `packages/ui/src/ui.test.ts` ("the Branch column keeps the widest line with its name at its floor and its tags
whole": `branchLineFloor`, `branchColumnFit`, `tableFit`), by `packages/ui/src/layout-regression.test.ts` ("keeps the
Branch cell a table cell with its line inside it…", and the table's new minimum), both red on the unrepaired code, by
`apps/desktop/scripts/lib/cell-paint.test.ts` (the three new pure verdicts, `runShowsLeadingChars`,
`controlsOutsideCell` and `cellsShortOfRow`, each pinned in both directions, the first two on this note's unrepaired
measurement), and by `pnpm git-proof`
launches 3 and 3b, which now require of every row at each size they measure that its Branch cell draws at least its
name's first character with the marker, lays out no tag past the cell's edge, and that every cell spans its row's height,
and that the base row is among the rows measured at 1000×680. Green on the repair (load average 1.06 at the start), with
`worktree-ahead-minimum.png` showing `m…`, `base` and `active`; `pnpm ui-audit --views=5` at 1440×900 and 1000×680 reports
the Git view clean.

**The proof's marker check, corrected (2026-10-04, fin17, on fin16's verifier's finding).** ~~"every row … draws at
least its name's first character with the marker"~~ held of the room only: `runShowsLeadingChars` passed when the visible
width reached two character advances and never looked at the marker, so a name sliced off with no ellipsis would have
passed it, and only `layout-regression.test.ts`'s stylesheet pin (`text-overflow: ellipsis`) held the marker. The probe
(`cellPaintProbe` in `apps/desktop/scripts/lib/cell-paint.mjs`) now records, for every run, its nearest clipping box's
`text-overflow`, `white-space`, `overflow-x`, `display`, `scrollWidth` and `clientWidth`, and a new pure verdict,
`runMarksElision`, requires of a cut run that its own box clips it, says `ellipsis`, does not wrap, is not inline and
overflows; git-proof's launches 3 and 3b require it of every row's name at each size beside the room check, whose message
now says "room" (`runShowsLeadingChars` keeps its name and documents that it measures width only). Pinned by
`apps/desktop/scripts/lib/cell-paint.test.ts` (both directions: `clip`, a wrapping box, an inline box, an ancestor's clip,
a box that does not overflow and no state measured each fail; a whole run needs no marker). Shown by `pnpm git-proof` on the
repaired build: green, the base row's `main` cut at 1000×680 with its box `ellipsis`/`nowrap`/`hidden`/`block`,
`scrollWidth` 29 over `clientWidth` 15 (`results.json`, `worktreeAhead.cells.baseBranchMarker`); and red on a build with
`.git__branch-name`'s `text-overflow` set to `clip` for one run ("isolated at 1440x900: a worktree row's Branch name is cut
with no elision marker"), the stylesheet put back after (load average 0.5 to 0.7 on 4 CPUs).
