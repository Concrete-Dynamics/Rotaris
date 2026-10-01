## traceability-proof's growth ratio goes red on an oversubscribed host

`traceability-proof` asserts the linear-growth clause of REQ-TRACE-501 and REQ-TRACE-088 as the quotient of two minima of
seven interleaved wall-clock readings (full tree over half tree), between a lower bound (1.4 for the parse, 1.3 for the
sweep and the parser) and 3.0, after asserting the work ratio. The repair of 2026-10-01
([`fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`](fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md))
was shown at a load average of up to 4.4. On a host with more runnable work than CPUs, the minimum of seven readings no
longer screens the load out: a side can go a whole round without one uncontended reading, and the ratio leaves the band
in either direction.

Seen 2026-10-01 by the fin4 builder while repairing the busy check
([`traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md`](traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md)),
as root under Xvfb, Node 24, `node apps/desktop/scripts/traceability-proof.mjs --skip-build` on 4 CPUs, with the builder's
own CPU-bound `node -e 'for(;;){}'` loops beside the other plan's agents:

- eight loops, ten runs, load average 9.9 to 20.6: six stopped on growth (parse 3.3, 3.08, 4.94, 5.52; sweep 0.34,
  3.32), one on the in-thread parse test (`REQ-TRACE-501: a 1,500-document store parses in about one second`, 34,720 ms
  in vitest), three passed;
- four loops, eight runs, load average 11.8 to 14.1: four stopped on growth (parse 3.1, 1.04, 3.11; sweep 1.24), four
  passed;
- no loops of the builder's, eight runs, load average 6.0 to 9.4: eight passed.

So the reds came only with the builder's synthetic load on top, at load averages above what `environment.md` names as
this host's ordinary multi-agent load (5 to 10), and none was re-run alone; at 6.0 to 9.4 it was green eight times of
eight. Whether a proof must hold at twice the CPU count is not settled by anything here; the record is kept so that a
red at that load is read as this, not as a product regression. Not repaired.

## Specs

None contradicted by the product: the readings at rest stay inside the band (ADR-0040's third execution, corrected
2026-10-01). The assertion stands for REQ-TRACE-501 and REQ-TRACE-088's linear clause, and under oversubscription it can
fail a product that meets them (`.claude/rules/tests-and-proofs.md`: a proof is evidence).

## Relevant files

- `apps/desktop/scripts/traceability-proof.mjs`: `linear`, the three growth assertions.
- `apps/desktop/scripts/lib/growth-verdict.mjs`: the verdict, the floor and the band.
- `packages/workspace/src/traceability/growth-readings.ts`: `interleavedMinima`, the seven readings a side.
- `packages/workspace/src/traceability/traceability.proof.test.ts`: the in-thread parse budget that went red once.
