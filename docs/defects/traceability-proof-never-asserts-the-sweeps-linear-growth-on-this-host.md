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
[traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md](fixed/traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md)
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
