## The capture seam's `ROTARIS_CAPTURE_SELECT` drops the `~` and fires every select step at a fixed instant

`apps/desktop/src/main/capture/seams.ts` scheduled every `ROTARIS_CAPTURE_SELECT` step with
`clocks.timers.after(millis(step.at))`. `parseSteps` reads `select>>value@~ms` as a deadline, with `until: true`, but
the select seam never looked at `until`. A waiting select step therefore fired at `ms` whether its control was drawn or
not, and logged `no such control` when it was not. The click, double-click, press and read seams all honour the `~`
through `onStep`, so a proof author could not tell from the grammar that the select seam did not.

It is not latent. `resilience-proof` already writes `.wait-header select>>beta@~10000`, which has fired at a flat
10 s. `sandbox-proof`'s round-trip scenario went red on Linux on 2026-09-28 because its selects, at a flat 1800 ms,
reached the Models category before Runtime had been drawn.

## Specs

None: the capture seams are verification-only and compiled out of a packaged build. The defect is in how the harness
measures, not in what the product does.

## Relevant files

- `apps/desktop/src/main/capture/seams.ts`: the select loop.
- `apps/desktop/src/main/capture/host.ts`: `onStep`, `settleAt`, and the grammar's `until`.
- `apps/desktop/scripts/sandbox-proof.mjs`, `apps/desktop/scripts/resilience-proof.mjs`: the two waiting select steps.

Noticed 2026-09-28 while repairing `sandbox-proof` for Linux under R-062.

## Outcome

Repaired 2026-09-28 under R-062. The select loop now goes through `onStep`, like every other seam. A new
`selectWait(step)` in `host.ts` waits on the control alone, because a select step's argument is the value to choose.
Passing that value to the match probe as the control's text would wait for a `<select>` whose text is `deny`, and no
such control exists. Appointment steps (`@ms`) still fire at their instant, unchanged. Pinned by
`apps/desktop/src/main/capture/host.test.ts`, "waits a select step on the control alone, keeping its deadline…".
`sandbox-proof`'s round-trip scenario passed in all four Linux runs taken with it. `resilience-proof` was not re-run here: its
override launch has its own open note, which this repair does not change.
