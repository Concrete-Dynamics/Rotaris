## traceability-proof's growth ratio goes red on an oversubscribed host

`traceability-proof` asserts the linear-growth clause of REQ-TRACE-501 and REQ-TRACE-088 as the quotient of two minima of
seven interleaved wall-clock readings (full tree over half tree), between a lower bound (1.4 for the parse, 1.3 for the
sweep and the parser) and 3.0, after asserting the work ratio. The repair of 2026-10-01
([`fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`](traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md))
was shown at a load average of up to 4.4. On a host with more runnable work than CPUs, the minimum of seven readings no
longer screens the load out: a side can go a whole round without one uncontended reading, and the ratio leaves the band
in either direction.

Seen 2026-10-01 by the fin4 builder while repairing the busy check
([`fixed/traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md`](traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md)),
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

## Outcome — repaired 2026-10-02 (fin5, harness-readers)

The three growth pairs are now read on two clocks, and the ratio is asserted on the CPU time of the thread that ran each
pass, which REQ-TRACE-088's reference conditions ("one execution thread … timing the sweep alone") name, and a contended
wall clock does not. A reader returns a `PassReading`, `{ wallMs, cpuMs }` (`packages/workspace/src/traceability/growth-readings.ts`);
`interleavedMinima` keeps both series, and `growthPair` records `clock: 'thread-cpu'`, the CPU readings and minima, and
the ratio of the CPU minima, with the wall readings, their minima and their quotient (`wallRatio`) beside them. In
`traceability.proof.test.ts` the parse and the parser are read by `both` (`process.threadCpuUsage()` deltas, user plus
system, beside `performance.now()`); the sweep, which times itself, is handed a `dualClock` that reads the thread's CPU
time and records the wall instant at each reading, so its own figure (less the parse time it keeps apart) is CPU time and
the wall figure of the same pass is rebuilt beside it. Each pair, and the parse and sweep budgets, record `host`: the load
averages and the CPU count. `growthVerdict` (`apps/desktop/scripts/lib/growth-verdict.mjs`) judges a `thread-cpu` pair on
its CPU minima, floor included, and prints the wall readings, the wall ratio and the load beside them. The lower bounds
(1.4, 1.3), the 3.0 ceiling, the 25 ms floor and the work range are unchanged. The two "about one second" budgets stay on
the wall clock: a red there on a host loaded above its CPU count is re-run alone (`environment.md`, Load).

Shown with the note's harshest condition, eight `node -e 'for(;;){}'` loops beside the other plan's agents, as root under
Xvfb, Node 24, `node apps/desktop/scripts/traceability-proof.mjs --skip-build` after one `pnpm build`, on 4 CPUs:

- before the repair, four runs, load average 4.5 rising to 16.3: four stopped on growth (sweep 3.19, parse 3.1, parse
  3.89, parser 5.24);
- after it, ten runs, load average 10.4 to 14.7 at the readings: ten passed. The thread-CPU ratios read 2.06 to 2.62 for
  the parse and 1.96 to 2.23 for the parser, against work ratios of 2.14 and 2.00, while the wall ratios of the same
  passes read 1.84 to 3.56 and 1.73 to 6.69. No absolute budget went red (parse warm 106 to 450 ms, sweep warm 95 to
  307 ms).

The sweep's half side reads 14 to 23 ms of thread CPU, under the 25 ms floor, so its ratio is recorded and not asserted,
as it was on an idle host's wall clock before (18 to 23 ms); its wall ratios under the loops read 1.41 to 7.06, and the
reds it gave before the repair came from a wall clock lifted above the floor by the load. One run with no added load
(load average 8.4) passed too (parse 2.36, parser 2.01; wall 2.5 and 2.27). The sweep's linear clause is therefore never
asserted on this host, a gap this repair does not close. It is recorded as its own open note,
[traceability-proof-never-asserts-the-sweeps-linear-growth-on-this-host.md](../traceability-proof-never-asserts-the-sweeps-linear-growth-on-this-host.md).

Pinned by `packages/workspace/src/traceability/growth-readings.test.ts` ("on an oversubscribed host the ratio is read on the
thread's CPU time …": every full-size reading's wall stretched 2.5× and every half-size one 1.2×, wall ratio 4.46, CPU
ratio 2.14; and the other direction, wall 0.36; plus wall-only readers keeping `clock: 'wall'`) and
`apps/desktop/scripts/lib/growth-verdict.test.ts` (a `thread-cpu` pair judged and floored on its CPU minima, the wall
readings and load printed beside). All four failed before the repair. ADR-0040's third execution carries the correction;
`docs/architecture/first-executions.md` the row.
