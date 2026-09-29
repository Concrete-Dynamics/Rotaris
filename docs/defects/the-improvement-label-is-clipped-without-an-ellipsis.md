## The run header's improvement label is clipped mid-word with no ellipsis

"Reviewing run for improvements…" is cut at the run header's edge as "Reviewing run for improvem", with no ellipsis.
`.improvement-activity` puts `text-overflow: ellipsis` on an `inline-flex` container whose label is a bare text node, so
the overflow clips and the ellipsis never draws.

Live-run finding: L10 (live runs of 2026-09-29)

## Specs

- `REQ-LIBRARY-125`: the activity indicator's label.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): the `ask`, `edit`, `frictions`, `faults-ladder`, `faults-stall` and `terminal` PNGs at 1440 px read
  "Reviewing run for improvem".

## Relevant files

- `packages/ui/src/shell.css:54` — `.improvement-activity`.
- `packages/ui/src/ImprovementActivity.tsx:47-51` — the label as a bare text node.
- `packages/ui/src/RunHeader.tsx:113` — the run-header placement.
