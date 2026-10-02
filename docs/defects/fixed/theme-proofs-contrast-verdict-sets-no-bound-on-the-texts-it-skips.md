## theme-proof's contrast verdict sets no bound on the texts it skips

The contrast item of `theme-proof` passes when no measured text falls below its floor, at least one text was
measured, and no capture was incoherent (`record.items.contrast.pass` in `apps/desktop/scripts/theme-proof.mjs`). The
texts it skips are counted (`skipped`, `skippedExamples`) but never bounded. A text is skipped when it is smaller than
two pixels, animating when the frame was taken, or has no part (or less than a glyph) on screen (`textSample`'s skip
reasons, added by the A53 repair of 2026-09-30). A regression that pushed most of a surface's text off screen, or left it animating at
capture, would pass with a single measured text. It would show only in the skip count, which nothing reads as a
failure. The weakness predates the A53 repair. That repair widened the set of skip reasons.

Found as an optional finding of the accept1-2 verification round of 2026-09-30, and confirmed on `main` at 0c9e570.
Not reproduced as a false pass.

## Specs

- REQ-SHELL-145: the token guarantees are measured against every background a token is actually painted on. A
  verdict that can pass while most discovered texts go unmeasured does not show that guarantee.
- REQ-SHELL-160: the theme conformance the proof is the evidence for.

## Relevant files

- `apps/desktop/scripts/theme-proof.mjs` — the contrast loop (`skippedText`), and `record.items.contrast`, whose
  `pass` reads `badText`, `contrast.length` and `incoherentCaptures` but not `skipped` against `discovered`.
- `apps/desktop/scripts/lib/text-sample.mjs` — `textSample`, which returns the on-screen skip reasons.

## Outcome

Repaired 2026-10-01 in the fin2 round. The contrast item's verdict now also reads the coverage
(`apps/desktop/scripts/lib/contrast-coverage.mjs`, `contrastCoverage`). The page's probe marks each discovered text
`inSurface` when it sits inside the capture's own surface (a primary view's root element, or the Settings view's), and
the verdict fails:
- a capture with no measured text inside its own surface, which is what the off-screen regression looks like, because a
  text pushed wholly off the screen is not discovered at all and the rail and the status strip are still measured;
- a capture with more than 25% of the texts discovered inside its surface skipped;
- a run with more than 10% of every discovered text skipped.

The skips are counted by reason (`skippedByReason`, and per capture under `surfaces`). The bounds and the measurements
they come from are stated in `theme-proof.mjs`'s header: on the full matrix of 2026-10-01 the largest share skipped
overall was 1.42%, the largest inside one surface 9.5%, and the fewest measured texts inside a surface 7.

Pinned by `apps/desktop/scripts/lib/contrast-coverage.test.ts` (10 cases). The surface whose own text is gone, the
surface left animating, the surface over its share and the run over its share each fail there; each has measured texts
and none below a floor, so the old verdict, which read only those two and the incoherent captures, could not fail them.
Two cases read the proof itself: its contrast item's `pass` must read `coverage.pass` (red with the old expression
restored), and the off-screen counterfactual must stay in `package.json` and the proof.
Shown in the built app, as root under Xvfb, Node 24, `--skip-build` after one `pnpm build`, with another plan's agents
on the host:
- `pnpm theme-proof --skip-build`: 15 of 15 cells PASS with the bound in force, twice (the second run by the builder who
  finished the round: largest share skipped in a cell 1.51%, inside one surface 9.5%, fewest measured inside a surface 7).
- `pnpm theme-proof:counterfactual:offscreen --skip-build --theme=rotaris-dim --scale=1`: exit 1, `FAIL contrast`, with
  `view-2: no text inside the surface was measured (0 discovered there, 0 skipped)`. The old verdict over the same
  run would have passed: no text below its floor, 1232 measured, no incoherent capture. Run again on the same build:
  exit 1 on `contrast` alone, the same failure, 1366 measured, the old verdict's three terms all true. The counterfactual clips the
  pane that holds the view as well as moving the view; with the pane left scrollable, the view scrolled back into sight
  to show the focused composer and was measured as before.
