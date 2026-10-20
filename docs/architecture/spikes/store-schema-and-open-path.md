# Spike 8 — the store against its declared indexes, the open path, log recovery, the integrity check and long paths

- **Date:** 2026-09-03
- **Taken as:** the first act of building the session writer (ADR-0008) and the event history
  (ADR-0009), under the ruling in `implementation-conditions.md` that a spike is taken when the build
  reaches the thing it prices.
- **Questions** (from `implementation-conditions.md` and ADR-0009 *Revisit if*):
  1. Spike 21 measured a schema with no indexes beyond two primary keys and one listing index. Schema
     v2 declares three indexes on the event history for `REQ-EVENTS-117`'s filter axes and a partial
     index for the resident transcript window. **What do they cost on the publish-path commit**, and do
     they move the checkpoint period ADR-0009 consequence 11 fixed at 135–136 commits?
  2. What does the open sequence cost — open, journal mode set and read back, and **`REQ-EVENTS-179`'s
     write probe**, which the record had called "very likely free" without a number?
  3. What does log recovery cost after a writer is killed mid-commit, and is what comes back whole?
  4. What does an integrity check cost, and can one sit on the startup path?
  5. Are `REQ-SESSION-042`'s listing and `REQ-EVENTS-126`'s summary index reads on a real schema?
  6. Do the declared indexes actually serve the filter axes inside `REQ-EVENTS-175`'s 100 ms?
  7. ADR-0009 consequence 9: what does the trim's delete of `cap ÷ 8` rows cost on the writer's queue?
  8. Does the store open on a path longer than 260 characters?

## Method

Harness: `scratchpad/spike-8/{lib,run,writer-child}.mjs`, Node 24.11 with type stripping, importing
**the repository's own `packages/store/src/schema.ts`** so the measured shape is the declared shape,
and `better-sqlite3` 13 from the repository's `node_modules`. Windows 11, local NTFS, the machine spike 21
used. Every store is opened exactly as `openStore` opens it: `journal_mode = WAL` set and read back,
`synchronous = NORMAL`, `busy_timeout = 5000`, then the write probe in `BEGIN IMMEDIATE` rolled back.
The publish-path transaction is ADR-0008's: one transcript row (~2 KB body, the mean spike 21 used),
one `transcript.row` event carrying the row verbatim, one session touch, in `BEGIN IMMEDIATE`. 3,000
timed commits per arm; percentiles over the samples. Two runs were made; the second is reported where
the first had a harness defect (section F's time range matched nothing), and the two agree elsewhere
to within noise.

## Results

### A. The publish-path commit, declared indexes against the index-free shape (µs)

| Arm | pre-existing rows | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| v2 as declared | 0 | **205.8** | 378.9 | 8,943.9 | 13,123 |
| v2 as declared | 10,000 | **203.2** | 341.9 | 10,211.5 | 15,632 |
| v2 with the four indexes dropped | 0 | 149.5 | 266.1 | 982.1 | 14,758 |
| v2 with the four indexes dropped | 10,000 | 148.6 | 252.8 | 932.6 | 15,484 |

- **The indexes cost +37 % at p50 and +42 % at p95.** Spike 21's no-index figure (p50 185 µs) and this
  run's no-index figure (150 µs) bracket the machine's day-to-day variance; the *ratio* is what this
  spike establishes.
- **`REQ-MONITOR-223`'s ratio is 0.99** at 10,000 rows against zero, with or without indexes: no growth
  term, as before.
- **The checkpoint period fell below 100 commits.** With the indexes, p99 is 9–10 ms — the automatic
  checkpoint (spike 21: 9–11 ms) now lands inside the 99th percentile, so it fires more often than once
  in 100 commits; without them p99 is under 1 ms and the checkpoint sits outside it, consistent with
  the 135-commit period spike 21 measured. ADR-0009 consequence 11's "the period moves with the
  transaction" is now a measured fact, and every diagnostic threshold that record warns about must be
  read with a period under 100 rather than 135.

### B. The open sequence (µs)

| | p50 | p95 | max |
|---|---|---|---|
| warm open: `new Database`, WAL set and read back, pragmas | 2,932 | 3,715 | 4,440 |
| **the write probe alone** (`REQ-EVENTS-179`) | **147.8** | 185.2 | 249 |
| warm open including the probe | 3,294 | 4,073 | 4,610 |
| create a new store and run both migrations | 10,983 | 11,417 | 12,804 |

The probe is **5 % of the open** and 0.15 ms absolute. "Very likely free" was right, and now has a
number. The open itself is ~3 ms, dominated by the binding's open and the journal-mode round trip.

### C. Log recovery after a kill mid-write

A child process committed the publish-path transaction as fast as it could; it was `SIGKILL`ed after
1.5 s with a **4.19 MB** write-ahead log on disk.

| | |
|---|---|
| last commit the child had reported (every 100th) | 3,700 |
| rows recovered / events recovered | **3,724 / 3,724** |
| rows equal events | **yes** — no torn transaction, the row and its event survived or vanished together |
| open after the kill (including log recovery) | 11.4 ms |
| `quick_check` afterwards | `ok`, in 100 ms |

`REQ-EVENTS-029`'s two observables held under a real kill: every event is wholly present or wholly
absent, and the history ends at its last whole event.

### D. The integrity check

On a store of **167 MB** (20,000 rows and 20,500 events, checkpointed): `quick_check` **462 ms**,
`integrity_check` **582 ms**, both `ok`. Roughly 2.8 ms per MB. **An unconditional integrity check
cannot sit on the startup path**: `REQ-STARTUP-155`'s first-paint budget would be spent on one
medium workspace. The check belongs to the reclamation surface and to a failure path (after
`SQLITE_CORRUPT`), not to every open.

### E. Listing and the summary (`REQ-SESSION-042`, `REQ-EVENTS-126`)

| | p50 | p95 | plan |
|---|---|---|---|
| list 1,001 sessions, newest first | 1.25 ms | 1.72 ms | `SCAN sessions USING INDEX sessions_by_updated` |
| count, first and last instant over 20,500 events | 4.27 ms | 4.63 ms | index reads |

Both inside `REQ-EVENTS-175`'s 100 ms and `REQ-SHELL-150`'s interaction budget by an order of magnitude.

### F. The filter axes (`REQ-EVENTS-117`, `REQ-EVENTS-175`) on 20,500 events

| axis | matched | with the declared index (p50 / p95) | as a scan (p50 / p95) | plan |
|---|---|---|---|---|
| event type | 500 | **0.55 / 0.82 ms** | 122.8 / 126.4 ms | `events_by_kind (session_id=? AND kind=?)` |
| iteration | 2,928 | **7.87 / 10.20 ms** | 130.3 / 135.2 ms | `events_by_iteration (session_id=? AND iteration=?)` |
| time range | 1,006 | **4.66 / 5.89 ms** | 126.7 / 130.4 ms | `events_by_at` range, temp b-tree for the ordinal order |

**A scan does not meet the budget** — every axis costs 120–135 ms without its index, above
`REQ-EVENTS-175`'s 100 ms — so the indexes are load-bearing, not an optimisation.

**Found, and corrected before this report:** the *first* shape of the iteration index — partial,
`WHERE iteration IS NOT NULL`, without the ordinal — **was never chosen by the planner.** The first
run's plan read `SEARCH events USING INDEX sqlite_autoindex_events_1 (session_id=?)` and the filter
cost **137.7 ms at p50**, indistinguishable from the scan and over the budget. The index was declared,
migrated, present, and useless. Schema v2 now declares it as a full index with the ordinal last, and
the second run's figure is the 7.9 ms above. The time-range index likewise gained the ordinal.

### G. The trim (`REQ-EVENTS-091`), cap 20,000, headroom 22,500

| | p50 | p95 | max |
|---|---|---|---|
| delete the oldest 2,501 events, with the three event indexes | **35.2 ms** | 36.2 ms | 36.2 ms |
| the same delete with the three indexes dropped | 24.8 ms | 28.8 ms | — |

This is ADR-0009's owed "delete figure": **~35 ms once per 2,500 appends**, on the writer's queue,
ahead of the next event as `REQ-EVENTS-091` requires. It is 170× an ordinary commit and 14 % of
`REQ-MONITOR-222`'s budget; amortised it is 14 µs per append. The indexes account for about 30 % of it.

### H. Long paths

A store at a **426-character** path: the plain spelling fails with *unable to open database file*;
the same path with the Windows extended-length prefix opens, migrates and writes. **The store's own
path is never long** — it is `<LocalAppData>/rotaris/data/workspaces/<identifier>/workspace.db`, ours
and short by construction (`REQ-SESSION-198`) — so this does not reach the store. It does say that
`canonicalPath` must not be handed to the binding for anything under a *user's* path, and that the
identifier file inside a deep workspace goes through Node's file API, whose long-path behaviour this
spike did not measure.

*2026-10-21, on Windows ARM64 (the Windows ARM64 session's E1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, bsdtar 3.8.8, at `613ee119`, `%TEMP%` 33 characters):* the plain spelling's boundary is a database path of **251** characters (created and written at 251, refused at 252), the same under Node and under Electron as Node, and the same as the x64 measurement; the identifier file was minted and read at workspace roots of 198 to 328 characters through Node's file API, so the identifier is not where the limit bites (ADR-0058 consequence 13).

## What it settled

1. The declared indexes cost **+37 % / +42 %** on the commit and shorten the checkpoint period below
   100 commits; they buy filter axes that meet `REQ-EVENTS-175` where a scan does not. The trade-off
   ADR-0009 called "one trade-off and nothing has measured it" is measured and taken.
2. `REQ-EVENTS-179`'s probe costs **0.15 ms**. Free.
3. Log recovery is whole and costs ~11 ms after a 4 MB log; `REQ-EVENTS-029` holds under a real kill.
4. An integrity check costs ~2.8 ms per MB and may not sit on the startup path.
5. Listing and summary are index reads at 1–5 ms.
6. The trim costs ~35 ms per 2,500 appends.
7. The store's path is short by construction; the binding cannot open a long one unprefixed.

## What it found

**The fifth mechanism built for the first time held a defect no reading caught**: an index declared
for a budgeted query that the planner never used. The schema had passed typecheck, lint, migration and
every writer test, because nothing in those reads a query plan. What caught it was the spike's
`EXPLAIN QUERY PLAN` beside the timing — and the timing alone would have been read as "the axis is slow"
rather than "the index is dead". **The plan must be asserted, not only the time.**

## What it did not measure

Any failure path but the kill (no disk full, no read-only volume, no corruption); the `at` axis under
a range that matches most of the history; `ANALYZE`d statistics; concurrent readers during the trim;
macOS and Linux; the packaged binary. Section H measured the binding, not Node's file API.
