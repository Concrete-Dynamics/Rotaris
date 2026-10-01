## traceability-proof's growth ratio times the full and half trees unevenly, and its failure message prints the half readings as full

`pnpm traceability-proof` asserts `REQ-TRACE-501`'s and `REQ-TRACE-088`'s linear-growth clause as a quotient: the
minimum of the full-size tree's warm readings over the minimum of the half-size tree's, below 3.0. The two sides are not
read under the same conditions, and the quotient comes out above the work ratio on a host that is not loaded.

- **The parse.** `traceability.proof.test.ts` reads the full tree first (one cold and three warm parses) and only then
  generates and reads the half tree (one unrecorded and three recorded parses). The half side runs on a hotter JIT and
  reads cheap. Acceptance round 1 measured a parse ratio of **3.04 and then 3.16**, twice in a row on an idle host,
  against a document ratio of 2.14 and a byte ratio of 2.11. An earlier run in `wt-proofs` read 3.09. On this branch,
  confirmed 2026-10-01 at load average 4 (another worktree's `vitest run`): **2.65, then 3.37**, the second red.
- **The sweep.** The full-size figure is **one** reading (the second sweep), and the half-size figure is the minimum of
  three readings taken after two warm-ups. The Part R2 comment above the code says "the minimum of three sweeps on each
  side", and ADR-0040's third execution says the same.
- **The parser pair** (OQ-24) reads the full corpus first and the half corpus afterwards, the same order as the parse.
- **The message.** `linear()` in `traceability-proof.mjs` prints `pair.warmRunsMs` as "full" and
  `pair.halfWarmRunsMs ?? pair.warmRunsMs` as "half". For `parseHalf` and `sweepHalf`, `warmRunsMs` holds the
  **half** readings and there is no `halfWarmRunsMs`. A red therefore prints the half readings on both sides and never
  shows the full ones: `parse growth ratio 3.16 is not linear — minimum of the readings [50.6,43.9,44.1] full against
  [50.6,43.9,44.1] half, work ratio 2.14`, where the full readings were `[140.7,138.8,148.5]`.

A scratch probe outside the repository (`parseStore` from source, seven interleaved samples a side) measured parse ratios
of 2.06 to 2.21. The product grows linearly; the red is the harness's.

## Specs

None contradicted by the product. `REQ-TRACE-501` and `REQ-TRACE-088` make the linear-growth clause the binding one, and
the proof is their evidence (`.claude/rules/tests-and-proofs.md`). As written, the proof misreads them: it fails a
product that meets them, and its failure message hides the figures a reader needs to tell so.

## Relevant files

- `packages/workspace/src/traceability/traceability.proof.test.ts`: the parse pair (full, then half), the sweep pair
  (one full reading against a minimum of three), and the parser pair (full, then half).
- `apps/desktop/scripts/traceability-proof.mjs`: `linear()`, its message, and the three calls to it.
- `docs/architecture/adr/0040-the-traceability-engine.md`: the third execution (Part R″), which describes the readings as
  "the minimum of three readings on each side".

## Repaired — 2026-10-01, under R-067

**The readings.** `interleavedMinima` (`packages/workspace/src/traceability/growth-readings.ts`) reads each side of a
growth pair seven times after one unrecorded warm-up each. The sides are interleaved, and each round swaps which side
goes first (full, half, half, full, …). Whatever one pass leaves behind for the next, a hotter JIT or garbage still to
collect, therefore falls on both sides equally. `growthPair` records `fullRunsMs`, `halfRunsMs`, both minima, the ratio
and the order the sides were read in. `traceability.proof.test.ts` takes all three pairs through it: the parse, the
sweep (each reader returns the sweep's own figure less its parse time, as the budget does) and the parser. The budget
figures (`parse.warmMs`, `sweep.warmMs`, `parser.warmMs`) are read as before. The 3.0 ceiling, the 25 ms floor, the work
ratio's range and each pair's lower bound are unchanged.

**The message.** `growthVerdict` (`apps/desktop/scripts/lib/growth-verdict.mjs`) replaces the script's `linear()`. It
keeps the same three rules and prints each side's readings as that side's. The script also prints every pair's verdict
line under its summary, passed or not.

**Pinned by.** `growth-readings.test.ts`, six cases: the alternating order and the unrecorded warm-ups; seven recorded
readings a side; under a modelled warming pass the order used before the repair reads 2.5 or more, while the
interleaved order stays within 0.05 of the work ratio; a stalled reading on either side does not move that side's
minimum; the pair keeps the full readings apart from the half readings; and a measurement with no round is refused.
`growth-verdict.test.ts`, five cases, uses the readings of the red above: its message names
`[140.7,138.8,148.5] full` and `[50.6,43.9,44.1] half`. The ceiling and the floor are 3.0 and 25 ms; below the floor
the ratio is recorded and not asserted; a half tree that is not about half the work fails whatever the clock reads.

**Shown by.** `node apps/desktop/scripts/traceability-proof.mjs --skip-build`, run as root under Xvfb on Node 24 after
one `pnpm build`. During the two runs before the repair, the six after it and the seventh, another worktree's
`vitest run` was on the host (load average 2.2 to 4.4 across those nine).

| | parse ratio | parser ratio | sweep ratio | result |
| --- | --- | --- | --- | --- |
| before, run 1 | 2.65 | 2.23 | 3.00 (below the floor) | passed |
| before, run 2 | **3.37** | 2.56 | 4.74 (below the floor) | **red**: the message printed `[39.1,29.2,39.3]` on both sides |
| after, six runs | 2.24 – 2.35 | 1.89 – 2.06 | 1.78 – 2.15 (below the floor) | five passed; run 4 failed on the process stage's busy check, not on growth |
| after, a seventh run | 2.20 | 2.09 | 1.95 (below the floor) | taken after the six above were written down; its `spike-results.json` survived, its verdict was not kept |
| after, the verification's repair round, five runs | 2.19 – 2.33 | 2.03 – 2.08 | 1.95 – 2.22 (below the floor) | all five passed, the busy check included |

The first six runs and the seventh had another worktree's `vitest run` on the host. The repair round's five were taken
on a quieter host (load average 0.7 to 1.2), with nothing else of this branch's running. Across all twelve the parse
ratio sits between 2.19 and 2.35, against a document ratio of 2.14 and a byte ratio of 2.11, and the parser's between
1.89 and 2.09, against 2.00. Before the repair the parse read 2.65 to 3.37.

**What this repair does not reach.** On this host the half-size sweep reads 18 to 23 ms. That is below the 25 ms floor,
so the sweep's growth ratio is recorded and not asserted here, as ADR-0040's third execution decided. The repair
changed nothing about that. The parse pair is close to the same line: its half side's minimum read 26.7 to 27.6 ms in
the repair round, just above the floor, so on a faster host the parse ratio too would move to recorded and not asserted,
leaving the work ratio as the only assertion. That is the floor's own rule (ADR-0040), not this repair's doing. Run 4's
red was the process stage's busy check (two `requirements.operation` checks on the board path): both answered `ok`.
That is a different harness race, recorded in
[`traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md`](../traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md)
and not repaired here.
