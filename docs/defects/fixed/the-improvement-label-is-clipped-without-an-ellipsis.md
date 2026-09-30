## The run header's improvement label is clipped mid-word with no ellipsis

"Reviewing run for improvements…" is cut at the run header's edge as "Reviewing run for improvem", with no ellipsis.
`.improvement-activity` puts `text-overflow: ellipsis` on an `inline-flex` container whose label is a bare text node, so
the overflow clips and the ellipsis never draws.

Live-run finding: L10 (live runs of 2026-09-29)

## Outcome

**Repaired 2026-09-29 under R-067: the label is carried in words.** There were two causes. First, the label was a bare
text node in an inline-flex box, which `text-overflow` never reaches. Second, the indicator was never the Tag its
stylesheet said it was: a `className` given to the design `Tag` replaces its `tag tag-<kind>` foundation, so the
indicator drew as an unstyled span in the body type with an unpainted dot, wider than the tag it claimed to be
(recorded separately: `../the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md`).

- `ImprovementActivity.tsx`: the label is its own element (`improvement-activity__label`), and the Tag spells
  `tag tag-run`, the tone the run header draws a live run with.
- `shell.css`: in the run header the label wraps between words, and the indicator never shrinks below its longest
  word (`min-width: min-content`). In the fixed-height title bar it elides on the label itself, where the ellipsis
  draws. The dot takes the tag's ink.
- Pinned by `improvement-activity.test.ts`, "REQ-LIBRARY-125 with REQ-SHELL-149 — the label is carried in words, never
  clipped mid-word" (three cases, all failing before), and by `retrospective-proof`'s new check "at W×H the run-header
  indicator carries its label in whole words, none cut at its edge". That check measures every word of the visible
  label with a Range against the indicator's box, the box's overflow, and the next control, at 1440 × 900 and 1000 × 680.
  Before the change, `pnpm retrospective-proof --skip-build` failed it at both sizes ("cut: improvements…; overflows
  true", 29 other checks passing). After it: 31 of 31, with the retrospective's longer label on two lines at both sizes
  and nothing cut.
- Live: `pnpm live-run --confirm --skip-build --only=ask` against `katalyst`, 2026-09-30, **PASSED**. Its `ask.png` at
  1440 × 900 shows "Reviewing run for / improvements…" on two lines in the run header, and the whole label in the
  title bar.

## Specs

- `REQ-LIBRARY-125`: the activity indicator's label.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): the `ask`, `edit`, `frictions`, `faults-ladder`, `faults-stall` and `terminal` PNGs at 1440 px read
  "Reviewing run for improvem".

## Relevant files

- `packages/ui/src/shell.css:54` — `.improvement-activity`.
- `packages/ui/src/ImprovementActivity.tsx:47-51` — the label as a bare text node.
- `packages/ui/src/RunHeader.tsx:113` — the run-header placement.
