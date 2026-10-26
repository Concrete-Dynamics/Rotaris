# ADR-0009 — The event history as a table, with the line-delimited form as an export — First execution — 2026-09-03, the history as a table, and spike 8

Part 6 of 7 of [ADR-0009](../0009-the-wire-event-journal.md), which indexes every part.

## First execution — 2026-09-03, the history as a table, and spike 8

*Recorded under GD-10. Two of this record's owed figures landed and one of its declared indexes was dead.*

**Built and run:** schema v2 (`packages/store/src/schema.ts`) — the derived envelope columns, the
truncation record as four columns on the session row, the three filter-axis indexes — and the one
serialiser (`packages/engine/src/events.ts`): compact, keys sorted at every depth, non-ASCII escaped,
a line break refused; the stored `payload` is the wire line and the reader reads it back unchanged.
The trim runs as decided under *Retention* and the truncation record rides inside it.

**Found: the iteration index as first declared was never used.** It was partial (`WHERE iteration IS
NOT NULL`) and lacked the ordinal; the planner chose the primary key and the filter cost **137.7 ms** —
the same as a scan and over `REQ-EVENTS-175`'s 100 ms — while the index sat present and useless in a
migrated store that passed every test. Corrected to a full index with the ordinal last: **7.9 ms** over
2,928 matching events. The lesson is in the spike report and is repeated here because it is this
record's: **a declared index is a claim about a query plan, and the plan must be asserted, not the
declaration.** `store.test.ts` now asserts the plan of every budgeted query.

**Consequence 2's trade-off is now measured and taken.** The three event indexes and the resident
partial index cost **+37 % at p50 and +42 % at p95** on the publish-path commit (205.8 against
149.5 µs), and they move the checkpoint period of consequence 11 **below 100 commits** (the 9–10 ms
checkpoint now sits inside p99). What they buy is every filter axis inside the budget where a scan is
120–135 ms and outside it. The append is still 0.08 % of `REQ-MONITOR-222`.

**The delete figure (consequence 9, *Revisit if*) is in hand: ~35 ms** to drop 2,501 events at the
default cap, on the writer's queue, once per 2,500 appends — 170× a commit, 14 % of the budget,
14 µs amortised. About 30 % of it is index maintenance. It does not sit on a budgeted path often
enough to move one; the headroom stays as the knob and is not turned.

**`REQ-EVENTS-029` held under a real kill:** 3,724 rows and 3,724 events recovered from a 4.2 MB log,
none torn. `REQ-EVENTS-179`'s probe costs 0.15 ms.

**Not exercised:** `REQ-EVENTS-032`'s serialisation-failure path beyond a unit test; the export
(`REQ-EVENTS-172`) and the reader's four damage cases (`REQ-EVENTS-106`); the trim under a concurrent
reader.
