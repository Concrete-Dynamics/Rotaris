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
