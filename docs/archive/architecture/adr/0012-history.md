# ADR-0012 — history

The passages of [ADR-0012](../../../architecture/adr/0012-the-delegated-child-scheduler.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0012-the-delegated-child-scheduler.md](../../../architecture/adr/0012-the-delegated-child-scheduler.md), the header:

**The decision itself is unchanged — a persisted ledger driven to quiescence, not a promise graph.**
What changed is the medium, and the medium makes two of this record's mechanisms *stronger* rather
than merely different: the start claim and the transition function. The crash story changed outright.

<a id="struck-2026-09-30"></a>

**The struck text of 2026-09-30**, from [0012-the-delegated-child-scheduler/14-the-stall-callback-reaches-a-host-2026-09-30.md](../../../architecture/adr/0012-the-delegated-child-scheduler/14-the-stall-callback-reaches-a-host-2026-09-30.md), “The stall callback reaches a host — 2026-09-30: the watchdog's badge, the root's watch and the steer”:

~~`StallWatch.stop` now reports a stall under way as recovered.~~
