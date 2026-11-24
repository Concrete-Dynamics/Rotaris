## `library-proof` reads the stash count badge into the toolbar's label

`pnpm library-proof` fails at its stash stage with `the transcript toolbar read "Apply stash (1)1"`. The transcript
toolbar's stash control draws its label, `Apply stash (1)`, and beside it a count badge holding `1`; the proof reads the
whole control's text and compares it with the label alone. Seen 2026-11-24 on a developer's Ubuntu host, on `origin/main`
at `af3906d1` built in a clean worktree, and on a branch rebased onto it, alone and beside other suites. Which of the two
is wrong is not established: either the badge repeats a count the label already states, or the proof's expectation is
older than the badge.

## Specs

REQ-LIBRARY-140 fixes the control's text as "Apply stash (n)" with a live count. A second rendering of the count inside
the same control is not stated there.

## Relevant files

- `apps/desktop/scripts/library-proof.mjs` — the stash stage's comparison of the control's text with `Apply stash (1)`.
- `packages/ui/src/WorkspaceView.tsx` — the `transcript-stash` control: its `tool-label` and its `tool-count` badge.
