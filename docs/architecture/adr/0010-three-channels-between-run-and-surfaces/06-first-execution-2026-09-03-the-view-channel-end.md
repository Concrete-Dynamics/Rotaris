# ADR-0010 — Three channels between the run host and its surfaces — First execution — 2026-09-03, the view channel end to end

Part 6 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## First execution — 2026-09-03, the view channel end to end

*Recorded under GD-10.*

**Built and run:** the publish rule anchored on the commit — the writer's post-commit hand-off is the
only way a row reaches the projection owner, so a publication cannot precede its commit by
construction, and a test observes the row and its event already durable at the instant of
publication. The carve-out is built exactly as stated: intra-row growth is in memory only, coalesced
into a trailing 50 ms tick driven by the clock port, never committed, and a first appearance or a
settled form cancels any pending tick for that row. Every attach begins with a whole-session update
and then the resident transcript from the lowest index held; a reconcile is the same two
publications. In the application the increment and the snapshot cross run host → main → renderer
with the number the run host stamped.

**Found: nothing in this record.** The control channel is not built (no run to control). The wire
bus and its 5 s bound are not built (no consumer). The whole-session update carries the session
record as `contracts` derives it, which today is the store's session row plus empty bounded
collections.
