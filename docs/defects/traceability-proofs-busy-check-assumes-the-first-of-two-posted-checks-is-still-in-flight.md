## traceability-proof's busy check assumes the first of two posted checks is still in flight

`traceability-proof`'s process stage posts two `requirements.operation` `check` requests to the forked workspace service
in one `Promise.all` and asserts that exactly one comes back `ok` and exactly one comes back as a `busy` refusal. The
engine's guard (`operate` in `packages/workspace/src/traceability/engine.ts`) refuses a second operation of a kind
**while the first is in flight**. Over the fixture store (eleven requirements) a check on the board path took 8 ms in
the runs below. If the service finishes the first check before it takes the second request off its channel, both
answer `ok`. That is a correct answer, not a raced pass.

Seen 2026-10-01 while repairing
[`traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`](fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md).
Six consecutive runs of `node apps/desktop/scripts/traceability-proof.mjs --skip-build` were made as root under Xvfb,
Node 24, with another worktree's `vitest run` on the host (load average 3.5 to 4.4). Run 4 stopped at
`two concurrent checks did not yield exactly one busy refusal (REQ-TRACE-512): [true,true]`. Runs 1 to 3, 5 and 6
passed the same check. The run's `process-results.json` was overwritten by run 5, so the two replies' timings were not
kept. Which side of the race the service was on is inferred from the guard's code, not measured.

## Specs

None contradicted by the product, as far as the code reads: `REQ-TRACE-512` refuses a second operation of a kind while
one is in flight, and a request that arrives after the first has finished is not a second in-flight operation. The
proof's assertion is evidence for `REQ-TRACE-512` (`.claude/rules/tests-and-proofs.md`). Under load it can fail a
product that meets the requirement, and when it passes it shows the refusal only on runs where the timing happened to
line up. Measuring it needs a first check that is held in flight, for example one over the scale tree, or one
started and still unanswered when the second is posted.

## Relevant files

- `apps/desktop/scripts/traceability-proof.mjs`: `results.boardBusy` in the driver source (two checks in one
  `Promise.all`) and the assertion that reads it.
- `packages/workspace/src/traceability/engine.ts`: `operate`, the in-flight guard that answers `busy`.
