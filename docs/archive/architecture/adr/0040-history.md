# ADR-0040 — history

The passages of [ADR-0040](../../../architecture/adr/0040-the-traceability-engine.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="correction-2026-10-01"></a>

**The correction of 2026-10-01**, from [0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md](../../../architecture/adr/0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md), “Third execution — 2026-09-11 (Part R″), the linear-growth assertions made honest”:

**Corrected 2026-10-01 (R-067): point 2 described the readings, and they were not taken that way.** The falsified
claim was "each paired timing is therefore measured three times (`msMin`), the ratio is computed from the two
minima". The parse and the parser took three readings of the full tree first and three of the half tree afterwards.
The sweep's full side was **one** reading against a minimum of three. The minimum's rationale held only for readings
taken under the same conditions, and these were not: the half side ran after the full side, on a hotter JIT, and read
cheap. Acceptance round 1 saw the parse ratio at 3.04 and 3.16, twice in a row on an idle host, against a work ratio of
2.14. This branch saw 3.37. The failure message also printed the half readings on both sides.

<a id="correction-2026-10-02"></a>

**The correction of 2026-10-02**, from [0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md](../../../architecture/adr/0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md), “Third execution — 2026-09-11 (Part R″), the linear-growth assertions made honest”:

**Corrected 2026-10-02 (fin5): the minimum screens out load only while some reading of each side runs uncontended.**
The falsified reason was point 2's "load can only make a pass slower, never faster, so of repeated readings of one pass
the **minimum** is the least contaminated estimate". It holds while some reading of each side escapes the load. On a
host with more runnable work than CPUs none need: with eight CPU-bound loops beside the other plan's agents on four
CPUs (load average 9.9 to 20.6), the parse ratio read 3.08 to 5.52 and the sweep's 0.34 and 3.32, and on this branch four
runs before the repair stopped on growth four times (sweep 3.19, parse 3.1 and 3.89, parser 5.24). The minimum of a
contended side is still contended, by an amount the other side need not share.

<a id="correction-2026-10-02-2"></a>

**The correction of 2026-10-02**, from [0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md](../../../architecture/adr/0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md), “Third execution — 2026-09-11 (Part R″), the linear-growth assertions made honest”:

**Corrected 2026-10-02 (fin7): the sweep's pair has trees of its own, and its ratio is asserted.** The claim above, "the
sweep's linear clause is therefore never asserted on this host", was too strong as written: it is not asserted at the
reference conditions, an idle host, where the 500-file half side reads 14 to 23 ms of thread CPU. Under load the same
side's CPU time can rise past the floor, and fin5's verifier saw the ratio asserted once, at 2.23 against a work ratio of
2, at a load average of 11.6. Either way the proof could not fail on a sweep that grows faster than linearly while the
host was idle.

<a id="correction-2026-10-01-2"></a>

**The correction of 2026-10-01**, from [0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md](../../../architecture/adr/0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md), “Third execution — 2026-09-11 (Part R″), the linear-growth assertions made honest”:

**Corrected 2026-10-01 (R-062): the second execution's busy pair raced, and is now held in flight.** The falsified
claim was "two concurrent checks yielded exactly one `busy` (`REQ-TRACE-512`)". The proof posted two board-path checks
over the eleven-requirement fixture in one `Promise.all`, and a check there takes about 8 ms, so whenever the first
finished before the service took the second off its channel both answered `ok`, a correct answer from an engine that
refuses only while one is in flight. A scratch driver looping that pair through the built service answered both `ok` in
2, 6 and 9 of 100 pairs beside six CPU-bound loops (0 of 100 without them, the other plan's agents alone on the host); the proof itself went red on it once
in six at a load average of about 4. What it showed when it passed was the timing lining up, not the guard.
