## traceability-proof never asserts the sweep's linear growth on this host

`pnpm traceability-proof` reads three growth pairs: the parse, the parser and the sweep. A pair's ratio is asserted only
when its half side reads at least the 25 ms floor (`growthVerdict`, `apps/desktop/scripts/lib/growth-verdict.mjs`;
ADR-0040, third execution, point 2). The sweep's half-size tree is 500 files (`implFiles: 400, testFiles: 100`), and its
pass reads below that floor on this host on every run recorded:
- 18 to 23 ms on the wall clock, on an idle host (R-067, 2026-10-01);
- 14 to 23 ms of thread CPU time, idle and under eight busy loops (fin5, harness-readers, 2026-10-02).

So the sweep's ratio is recorded and printed as not asserted, run after run. REQ-TRACE-088's linear clause is "the
binding one" (resolution 36 of `docs/spec/resolutions/08-requirements-traceability.md`), yet the proof cannot fail on a
sweep that grows faster than linearly. Only the absolute "about one second" budget at 10^3 files is checked. In one of the
verifier's loaded runs the unasserted sweep ratio read 2.89, near the 3.0 ceiling, and nothing judged it.

The floor and the ceiling are right as they stand. The pair's input is too small for the floor. A repair sizes the sweep's
pair so that both sides clear the floor without changing a figure the requirement states. For example, the pair could use
the 10^3-file tree as its half side and a tree of twice that as its full side, with the "about one second" budget still
read at 10^3. Which sizes, and whether the proof's run time allows them, is a choice for whoever repairs it.

Noticed 2026-10-02 while repairing
[traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md](traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md)
(fin5, harness-readers); the verifier raised it in repair round 1. The figures come from the proof's own output.

## Specs

- REQ-TRACE-088: the sweep's cost grows linearly with the files scanned. That clause is binding under its reference
  conditions (resolution 36), and the proof does not assert it for the sweep.

## Relevant files

- `packages/workspace/src/traceability/traceability.proof.test.ts`: the sweep pair (`results.sweepHalf`) and its half tree
  (`generateScaleRepository(halfDir, { ...SPIKE_7, blocks: 7, implFiles: 400, testFiles: 100 })`, shared with the parse
  pair).
- `apps/desktop/scripts/lib/growth-verdict.mjs`: the 25 ms floor, below which a ratio is recorded and not asserted.
- `docs/architecture/adr/0040-the-traceability-engine.md`: the third execution's point 2 (the floor) and its corrections.

## Outcome (2026-10-02, fin7, repaired)

The sweep's growth pair has trees of its own: 2,000 files against 4,000, both over spike 7's store with ten sites a file
(`SWEEP_PAIR_FILES` in `traceability.proof.test.ts`, generated under `scale-sweep-half/` and `scale-sweep-full/` and removed
with the other trees). The parse and the parser keep their pairs, and the "about one second" budget is still read on the
10^3-file tree. No figure the requirement states changed, and neither did the floor, the ceiling, the 1.3 lower bound or
`growthVerdict`.

Why these sizes, not 10^3 against 2×10^3. Measured first on this branch, idle (load average 1.3 to 2.4 on 4 CPUs), the
10^3-file side read 36 to 44 ms of thread CPU across four runs (full side 78 to 93 ms; ratios 1.93 to 2.33). That clears
the floor at rest, but extrapolated from this note's loaded 500-file figures (14 to 23 ms), its low end is about 28 ms,
near the floor. At 2,000 against 4,000 the half side read 68 to 90 ms (full 167 to 182 ms; ratios 2.02 to 2.46), clear of
it either way.

The pin: `traceability-proof.mjs` now requires the sweep's verdict to be asserted (`linear(…, { mustAssert: true })`),
so a sweep pair that reads under the floor goes red instead of printing a NOTE. With only the proof test restored to
origin/main (the old 500-file pair), the proof went red on it: "sweep growth ratio 2.4 recorded, NOT asserted: 36 ms
against 15 ms of thread CPU is below the 25 ms floor … the sweep pair is sized to clear the floor, so its ratio must be
asserted" (load average 2.1). The test also asserts the pair's work: 2,000 and 4,000 files swept, the full tree's sites
exactly twice the half tree's.

Shown by `node apps/desktop/scripts/traceability-proof.mjs --skip-build` after `pnpm build`, as root under Xvfb, Node 24,
seven runs, every one PASSED with the line `sweep growth ratio … against work ratio 2 — readings thread CPU …`
(asserted): ratios 1.6, 2.18, 1.95, 1.88, 2.15, 1.92 and 2.3; half-side minima 76 to 94 ms of thread CPU; load averages
2.1 to 3.3 on 4 CPUs, beside the other plan's agents. Building and reading the pair took 4.1 to 8.0 s (`pairMs` in
`spike-results.json`), where the 500-file pair, whose tree the parse pair had already built, read in about one second (sixteen readings of 17
to 88 ms on the wall clock in the red run above); the whole proof ran 18 to 23 s.
Not shown by the builder: a run beside added busy loops. Launching CPU-bound loops on this host was refused by the
session's permission system, so the builder's loaded figures are the host's own load alone. fin7's verifier took one: four bounded `node -e 'for(;;){}'` loops beside the proof gave "sweep growth ratio 1.71 against work ratio 2", asserted, with the half side's minimum at 107 ms of thread CPU, at a load average of 7.77 on 4 CPUs, and the proof PASSED.
