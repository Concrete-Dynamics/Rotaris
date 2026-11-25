## `library-proof` reads the stash count badge into the toolbar's label

## Outcome — repaired 2026-11-25: the proof was wrong, the control is right

The badge is the compact band's stand-in for the label it hides. `shell.css` draws `.tool-count` only under
`.run-header[data-compact='1']`, where `.tool-label` is clipped to a visually hidden span; at full width the badge is
`display: none`, and it is `aria-hidden` everywhere, so no reader sees or hears the count twice. The terminal toolbar's
control (`packages/ui/src/terminal/host.tsx`) has the same pair. The proof read the control's `textContent`, which
carries an undrawn element's text, and compared it with the label alone, so the reading was older than the badge
(both arrived in `1a0d807`'s squash; the comparison was written against a control without it).

The stash stage now reads the parts apart: `.tool-label` must read `Apply stash (1)` (REQ-LIBRARY-140), the control's
`data-count` must be `1` (the live count), and `.tool-count` must read `1` with `aria-hidden="true"`. The accessible name
and tooltip checks on the control are unchanged. Verified 2026-11-25 on a Linux cloud host under `xvfb-run`: all six
stages of `pnpm library-proof` green, `results.stash.toolbar` `Apply stash (1)`, `toolbarBadge` `1`. Stage 1 was reached
only with `appearance/themeChosen` seeded by hand in the scratch preferences, since the first-launch theme dialog blocks
the Library's chord on a fresh profile; that blocker is the one
[`resilience-proof-fails-twenty-three-scenarios-on-main-since-the-first-launch-theme-dialog-landed`](../../defects/resilience-proof-fails-twenty-three-scenarios-on-main-since-the-first-launch-theme-dialog-landed.md)
names.

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
