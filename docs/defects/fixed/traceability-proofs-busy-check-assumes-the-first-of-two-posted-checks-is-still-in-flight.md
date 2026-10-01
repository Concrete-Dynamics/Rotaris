## traceability-proof's busy check assumes the first of two posted checks is still in flight

`traceability-proof`'s process stage posts two `requirements.operation` `check` requests to the forked workspace service
in one `Promise.all` and asserts that exactly one comes back `ok` and exactly one comes back as a `busy` refusal. The
engine's guard (`operate` in `packages/workspace/src/traceability/engine.ts`) refuses a second operation of a kind
**while the first is in flight**. Over the fixture store (eleven requirements) a check on the board path took 8 ms in
the runs below. If the service finishes the first check before it takes the second request off its channel, both
answer `ok`. That is a correct answer, not a raced pass.

Seen 2026-10-01 while repairing
[`traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`](traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md).
Six consecutive runs of `node apps/desktop/scripts/traceability-proof.mjs --skip-build` were made as root under Xvfb,
Node 24, with another worktree's `vitest run` on the host (load average 3.5 to 4.4 as read during these six; the growth
note's 2.2 to 4.4 spans the builder's nine runs together, the two before the repair and the seventh included). Run 4 stopped at
`two concurrent checks did not yield exactly one busy refusal (REQ-TRACE-512): [true,true]`. Runs 1 to 3, 5 and 6
passed the same check. The run's `process-results.json` was overwritten by run 5, so the two replies' timings were not
kept. Which side of the race the service was on is inferred from the guard's code, not measured. A seventh run followed
the six, and five more were taken in the verification's repair round on a quieter host (load average 0.7 to 1.2); the
five passed the check, and the seventh's verdict was not kept.

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

## Repaired 2026-10-01 under R-062

**Confirmed first, in the built service.** A scratch driver, the proof's own driver with the busy pair looped 100
times over the fixture (the pair exactly as the proof posted it, one `Promise.all` of two board-path checks), answered
exactly one `busy` in all 100 pairs with only the other plan's agents on the host (load average about 8), and **both
`ok` in 2, 6 and 9 of 100** in three runs beside six CPU-bound loops; a pair took from 4 ms to some tens of milliseconds. So the race the note
inferred from the guard's code is measured: the first check finishes before the service takes the second off its
channel, and both answer `ok`, which is a correct answer. The proof itself, run ten times beside eight CPU-bound loops
(load average 9.9 to 20.6), reached the busy check three times and passed it; the other seven stopped earlier, on the
growth ratios and once on the parse budget (recorded in
[`traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md`](../traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md)).

**What changed** (`apps/desktop/scripts/traceability-proof.mjs` only; the engine and the service are untouched):

- The driver runs the pair after the board read, over the **scale tree**, opened as the workspace (`workspace.open`
  then `requirements.command` with `workspace: scaleRoot`): a check there runs for hundreds of milliseconds (275 to
  456 ms in the service when nothing cancels it), where the fixture's takes about 8 ms. The second check is posted in
  the same tick as the first. Once the second has answered, the first is cancelled through `requirements.cancel`, so
  the drive does not wait out a full pass and its projection refresh.
- The proof asserts that the second is refused `busy`; that it was answered while the first was still unanswered (the
  service takes its requests in order, so the refusal was decided with the first in flight, which is the measurement
  the note asked for); and that the first answers `ok` or `cancelled`. Both replies and their timings
  (`firstAnsweredMs`, `secondPostedMs`, `secondAnsweredMs`, the service's `elapsedMs` for each, whether the cancel
  found the first) are written to `results.json` as `busyPair` before they are asserted, so a red can be read. The
  passing line prints them.
- `ProjectSettings.test.ts`'s reading of `boardBusy` (exactly one "already in flight" sentence) is unchanged and still
  holds: the pair's replies are `cancelled` and `busy`.

**Shown.** Twelve runs of `node apps/desktop/scripts/traceability-proof.mjs --skip-build` reached the busy check, as root
under Xvfb, Node 24, and passed it every time: four beside four CPU-bound loops and the other plan's agents (load
average 11.8 to 14.1; the other four of those eight stopped earlier on the growth ratios), then **eight in a row, all
green end to end**, with the other plan's agents alone on the host (load average 6.0 to 9.4). The second was answered
`busy` 7 to 22 ms after the pair was posted and the first `cancelled` 12 to 43 ms after, every time with the first still
unanswered at the second's reply. **The proof is still evidence of the guard:** with `inFlight.has(k)`'s refusal
disabled in the built bundle alone (so the in-thread stage, which tests the source, still passes), the proof goes red on
`a second check posted while the first was in flight was not refused busy (REQ-TRACE-512)`, both replies `ok`, the first
answered at 933 and 1,683 ms in two runs. No unit test is added: the engine's guard is already unit-tested, and what
changed is the proof's own measurement. ADR-0040's second execution, which reported the raced pair, is corrected in
place.
