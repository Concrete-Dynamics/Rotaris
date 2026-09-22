## Appending at 1,200 rows costs two to three times what it costs on an empty transcript

`transcript-proof`'s append comparison (REQ-CHAT-055) fails, and the two distributions barely overlap —
this is not one slow sample. Measured on `main` at `1f3bad9`, 2026-09-22, both launches in the same run
of the script, each figure the time from an apply to the frame that SHOWS it (double `requestAnimationFrame`,
the measurement point ADR-0045 fixes):

| transcript | samples (ms) | median |
| --- | --- | --- |
| empty (`S0`) | 71.5, 40.8, 33.7, 23.1, 36.8 | **36.8** |
| 1,200 rows (`S1200`) | 69.8, 98.2, 139.1, 98.9, 83.9, 65.8, 75.9 | **83.9** |

Three runs of four have failed the comparison (74.8 vs 27.8 on `main` at `1f303e4`; 66.6 vs 37.0 in a
worktree; 83.9 vs 36.8 above). The one that passed is the only evidence that this is sometimes within the
budget, and its figures were not kept.

The red was **not visible until 2026-09-22**: the script stopped earlier, at the group-expansion assertion
that `docs/defects/fixed/the-two-driven-transcript-proofs-are-red-on-main.md` repaired, so the append
comparison had not been reached in any recent run. It is being recorded as found, not as new.

## Specs

`REQ-CHAT-055` fixes the append cost as a comparison rather than as a budget in milliseconds: appending at
depth must cost no more than appending to an empty transcript. The proof allows one frame at 60 Hz (16.7 ms)
of slack on top, which is the frame cadence being the floor at both ends and not a widening of the
requirement. A median of 83.9 ms against 36.8 ms is over that by a factor, not by a margin.

Whether the product violates the requirement or the measurement includes work the requirement does not mean
is exactly what is open. The figure is taken through `window.__rotarisApplies()`, which times an apply to
the painted frame — so it includes the projection, the pool's binding pass and the measurement pass, all of
which a 1,200-row transcript does more of than an empty one.

## Relevant files

- `apps/desktop/scripts/transcript-proof.mjs` — `appendRun`, `APPLIES`, and the comparison around line 430.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the apply path: the projection, the visible range, the
  pin, and the ResizeObserver measurement pass.
- `packages/ui/src/transcript/pool.ts` — the fixed slot pool and its binding.
- `packages/ui/src/transcript/project.ts` — the projection the apply runs before any of that.

Noticed 2026-09-22 while repairing the two driven transcript proofs; recorded rather than repaired, because
finding out which of the two readings is true is its own measurement.
