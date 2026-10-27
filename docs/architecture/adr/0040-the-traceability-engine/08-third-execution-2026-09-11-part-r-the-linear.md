# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — Third execution — 2026-09-11 (Part R″), the linear-growth assertions made honest

Part 8 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

## Third execution — 2026-09-11 (Part R″), the linear-growth assertions made honest

*Recorded under GD-10. Defects are numbered `R2-n`; the manager assigns the ordinals at merge. This execution built
no engine mechanism: what it changed is how this record's own measurements are asserted, which the plan's
Reservations named for wave 3 in as many words — "a ratio of two wall-clock measurements is load-sensitive by
construction and will keep costing re-runs; wave 3 should give it a floor or measure work instead of time".*

**The problem, stated exactly.** `REQ-TRACE-501` and `REQ-TRACE-088` budget a parse and a sweep at about a second at
the stated scale and require the cost to grow **linearly** with the input. The proof read the linear clause as a
quotient of two wall-clock measurements — the full tree's warm pass over the half-size tree's — and asserted it
below 3.0. That quotient went red once at **3.06** on a machine running five build agents and passed three times
afterwards. Nothing about the engine had changed between those runs. A number that changes with what ELSE the
machine is doing is not measuring the thing the requirement is about, and a threshold raised until it stops
complaining measures nothing at all.

**What was chosen, and why.** Both halves of the advice, and the 3.0 threshold is untouched.

1. **Work is asserted, always.** The half-size tree must genuinely be about half — the documents parsed, the files
   swept, the files handed to the compiler — and the proof now asserts that ratio (`1.5 < w < 2.6`) from counts the
   generator produces, before it looks at any clock. No clock can tell a proof that its two inputs were comparable,
   and if they were not, the timing ratio is meaningless whatever it reads. This is the assertion that cannot be
   bought off by load, and it is new.
2. **Time is taken as the minimum of three readings, and floored.** Load can only make a pass slower, never faster,
   so of repeated readings of one pass the **minimum** is the least contaminated estimate — not a single reading,
   and not the mean, which a single long stall drags upward. Each paired timing is therefore measured three times
   (`msMin`), the ratio is computed from the two minima, and every reading is recorded beside it. Below a **25 ms**
   floor the ratio is recorded and NOT asserted, and the proof prints that it was not asserted and why: a quotient
   of two sub-25 ms wall-clock readings cannot be told from timer noise, and a proof that cannot fail is not
   evidence — but neither is one that pretends a 3 ms reading measured something.

The alternative that was rejected: raising the threshold. It would have been one character and it would have made
the assertion unfalsifiable in exactly the case it exists for — a genuinely quadratic pass on a quiet machine.

**Found nothing else.** The engine, the parser, the sweep and the four operations are unchanged by this execution,
and the fixture and process stages of `pnpm traceability-proof` pass as Part AJ′ left them.

**Corrected 2026-10-01 (R-067): point 2 described the readings, and they were not taken that way.** The falsified
claim was "each paired timing is therefore measured three times (`msMin`), the ratio is computed from the two
minima". The parse and the parser took three readings of the full tree first and three of the half tree afterwards.
The sweep's full side was **one** reading against a minimum of three. The minimum's rationale held only for readings
taken under the same conditions, and these were not: the half side ran after the full side, on a hotter JIT, and read
cheap. Acceptance round 1 saw the parse ratio at 3.04 and 3.16, twice in a row on an idle host, against a work ratio of
2.14. This branch saw 3.37. The failure message also printed the half readings on both sides.

The replacement: each pair is read by `interleavedMinima` (`packages/workspace/src/traceability/growth-readings.ts` (since 2026-10-15 `growth-readings.test-support.ts`)),
seven readings a side after one warm-up each. The sides are interleaved, and each round swaps which side goes first.
The ratio is still the quotient of the two minima, and `growthVerdict` (`apps/desktop/scripts/lib/growth-verdict.mjs`)
prints each side's readings as that side's. Point 1, the 25 ms floor and the 3.0 ceiling are unchanged. Six runs after
the repair read the parse ratio at 2.24 to 2.35 and the parser's at 1.89 to 2.06; a seventh, and five more on a quieter
host in the verification's repair round, read the parse at 2.19 to 2.33 and the parser at 2.03 to 2.09. On this host the half-size sweep reads
18 to 23 ms, under the floor, so its ratio stays recorded and not asserted. The note is
[`traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md`](../../../defects/fixed/traceability-proofs-growth-ratio-times-the-full-and-half-trees-unevenly.md).

**Corrected 2026-10-02 (fin5): the minimum screens out load only while some reading of each side runs uncontended.**
The falsified reason was point 2's "load can only make a pass slower, never faster, so of repeated readings of one pass
the **minimum** is the least contaminated estimate". It holds while some reading of each side escapes the load. On a
host with more runnable work than CPUs none need: with eight CPU-bound loops beside the other plan's agents on four
CPUs (load average 9.9 to 20.6), the parse ratio read 3.08 to 5.52 and the sweep's 0.34 and 3.32, and on this branch four
runs before the repair stopped on growth four times (sweep 3.19, parse 3.1 and 3.89, parser 5.24). The minimum of a
contended side is still contended, by an amount the other side need not share.

The replacement: each pass is read on two clocks, and the ratio is the quotient of the minima of the thread's own CPU
time (`process.threadCpuUsage()`, user plus system), the measure of REQ-TRACE-088's reference conditions, one execution
thread timing the pass alone. A reader returns `{ wallMs, cpuMs }` (`PassReading`, `growth-readings.ts` (since 2026-10-15 `growth-readings.test-support.ts`)); the sweep,
which times itself, is handed a clock that reads the thread's CPU time and keeps the wall instants beside it
(`dualClock`, `traceability.proof.test.ts`). The wall readings, their quotient and the host's load averages and CPU count
are recorded beside the CPU figures in `spike-results.json`, and `growthVerdict` prints them on every line. The minimum is
kept, now over CPU readings. Point 1, the lower bounds, the 3.0 ceiling and the 25 ms floor are unchanged, and the two
"about one second" budgets stay on the wall clock: a red there above the CPU count is re-run alone. Under the same eight
loops, ten runs after the repair passed at load averages of 10.4 to 14.7, the parse reading 2.06 to 2.62 and the parser
1.96 to 2.23 on the thread's CPU time while their wall ratios read 1.84 to 3.56 and 1.73 to 6.69. The half-size sweep reads
14 to 23 ms of thread CPU, under the floor, so its ratio stays recorded and not asserted, as on an idle host's wall clock.
The sweep's linear clause is therefore never asserted on this host. That is recorded as its own open note,
[`traceability-proof-never-asserts-the-sweeps-linear-growth-on-this-host.md`](../../../defects/fixed/traceability-proof-never-asserts-the-sweeps-linear-growth-on-this-host.md).
The note is
[`traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md`](../../../defects/fixed/traceability-proofs-growth-ratio-goes-red-on-an-oversubscribed-host.md).

**Corrected 2026-10-02 (fin7): the sweep's pair has trees of its own, and its ratio is asserted.** The claim above, "the
sweep's linear clause is therefore never asserted on this host", was too strong as written: it is not asserted at the
reference conditions, an idle host, where the 500-file half side reads 14 to 23 ms of thread CPU. Under load the same
side's CPU time can rise past the floor, and fin5's verifier saw the ratio asserted once, at 2.23 against a work ratio of
2, at a load average of 11.6. Either way the proof could not fail on a sweep that grows faster than linearly while the
host was idle.

The replacement: the sweep's pair is 2,000 files against 4,000 (`SWEEP_PAIR_FILES` in `traceability.proof.test.ts`),
generated over spike 7's store with ten sites a file, and the proof requires the sweep's verdict to be asserted
(`mustAssert` in `traceability-proof.mjs`), so a pair under the floor goes red. The "about one second" budget is still
read on the 10^3-file tree, the parse and the parser keep their pairs, and the floor, the ceiling and the 1.3 lower bound
are unchanged. 10^3 against 2×10^3 was measured first: the 10^3-file side read 36 to 44 ms idle, near the floor at the
low end its loaded figures extrapolate to (about 28 ms). At 2,000 against 4,000, seven proof runs passed at load
averages of 2.1 to 3.3 on 4 CPUs, the sweep's ratio asserted at 1.6 to 2.3 with the half side's minimum at 76 to 94 ms of
thread CPU. Building and reading the pair adds 4.1 to 8.0 s to the proof (`pairMs`), which ran 18 to 23 s in all. The builder
took no run beside added busy loops (the session's permission system refused launching them); fin7's verifier took one: four bounded `node -e 'for(;;){}'` loops beside the proof gave "sweep growth ratio 1.71 against work ratio 2", asserted, with the half side's minimum at 107 ms of thread CPU, at a load average of 7.77 on 4 CPUs, and the proof PASSED. The note is
[`traceability-proof-never-asserts-the-sweeps-linear-growth-on-this-host.md`](../../../defects/fixed/traceability-proof-never-asserts-the-sweeps-linear-growth-on-this-host.md).

**Corrected 2026-10-01 (R-062): the second execution's busy pair raced, and is now held in flight.** The falsified
claim was "two concurrent checks yielded exactly one `busy` (`REQ-TRACE-512`)". The proof posted two board-path checks
over the eleven-requirement fixture in one `Promise.all`, and a check there takes about 8 ms, so whenever the first
finished before the service took the second off its channel both answered `ok`, a correct answer from an engine that
refuses only while one is in flight. A scratch driver looping that pair through the built service answered both `ok` in
2, 6 and 9 of 100 pairs beside six CPU-bound loops (0 of 100 without them, the other plan's agents alone on the host); the proof itself went red on it once
in six at a load average of about 4. What it showed when it passed was the timing lining up, not the guard.

The replacement: the pair runs over the scale tree, opened as the workspace, whose check runs for hundreds of
milliseconds (275 to 456 ms in the service when nothing cancels it). The second check is posted in the same tick as the
first; the proof asserts that it is refused `busy`, that it was answered while the first was still unanswered (the
service takes its requests in order, so it was decided with the first in flight), and that the first answers `ok` or
`cancelled`. The first is then cancelled through `requirements.cancel`, and both replies' timings are kept in
`results.json` as `busyPair`, on a red as on a pass. Twelve runs reached the check and passed it, four at a load
average of 11.8 to 14.1 and eight in a row at 6.0 to 9.4; the second was answered `busy` 7 to 22 ms after the pair was
posted, the first `cancelled` 12 to 43 ms after. With the engine's guard removed from the built bundle alone, the proof
goes red on the refusal (`["ok","ok"]`, the first answered at 933 and 1,683 ms in two runs). The engine is unchanged.
The note is
[`traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md`](../../../defects/fixed/traceability-proofs-busy-check-assumes-the-first-of-two-posted-checks-is-still-in-flight.md).
