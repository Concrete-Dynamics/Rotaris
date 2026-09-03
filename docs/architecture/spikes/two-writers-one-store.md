# Spike 18 — two writer processes on one store

- **Date:** 2026-09-03
- **Taken as:** the first act of building the session writer (ADR-0008), with spike 8.
- **Question:** `REQ-TOOLS-089` and `REQ-SANDBOX-038` permit two concurrent runs in one process, and
  spike 21 measured only a writer against a *reader*. Under ADR-0002 there is one run host per
  instance, so the shape the record named — two run hosts on one store — is two writer processes
  each committing ADR-0008's publish-path transaction to different sessions of one workspace store.
  What does contention between two compliant writers cost, and does either lose anything?

## Method

`scratchpad/spike-8/spike-18.mjs` and `writer-child.mjs`: the store created and migrated to schema v2
as declared; a baseline of one writer process committing 3,000 publish-path transactions alone; then
two writer processes started together, each committing 3,000 to its own session, `busy_timeout` at
the product's 5,000 ms. Every commit timed inside the writer. Afterwards the store is reopened and
counted.

## Results (µs per commit)

| | p50 | p95 | p99 | max | BUSY | errors | wall for its 3,000 |
|---|---|---|---|---|---|---|---|
| one writer alone | 205.3 | 382.4 | 8,139 | 16,462 | 0 | 0 | 1,279 ms |
| writer A, concurrent with B | 229.2 | 499.6 | 10,068 | **257,875** | 0 | 0 | 2,496 ms (both) |
| writer B, concurrent with A | 210.8 | 420.5 | 9,029 | 62,897 | 0 | 0 | |

Afterwards: 3,000 rows and 3,000 events per session, all three sessions; `quick_check` `ok`.

## What it settled

- **Two compliant writers do not block each other and lose nothing.** Zero `SQLITE_BUSY` in 6,000
  contended commits at the product's busy timeout; every row has its event.
- **The cost of a second writer is +12 % at p50 and +10–31 % at p95**, and the pair's aggregate
  throughput equals the single writer's (2,400 commits/s either way): the write lock serialises them,
  as it must, and neither starves.
- **One commit in 6,000 waited 258 ms** — writer A, once, presumably behind writer B's checkpoint plus
  its own. That is a single sample over `REQ-MONITOR-222`'s 250 ms, which the requirement's percentile
  reading (`REQ-ORCH-155` as amended, SR-8) does not count as non-conformance, and it is 25× the p99.
  It is recorded because it is the first sample this record has seen cross the budget on a compliant
  path, and because a *third* writer, or a checkpoint under a larger log, would move it further.

## What it did not measure

Two writers to the **same** session — forbidden by `REQ-EVENTS-098` and never attempted; a reader
beside the two writers; three or more writers; a rule-violating long write transaction (spike 21
priced that at 205 ms for a 200 ms hold); the trim under contention; macOS and Linux.
