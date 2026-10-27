# Spike — the transaction commit on the publish path — 8. Raw results — concurrency

Part 8 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 8. Raw results — concurrency

ADR-0058 rule 4: "The workspace service is forbidden from holding a write transaction across an
unbounded pass … The reason is `REQ-MONITOR-218`: a transcript row must be published with no delay of
any size, it must be committed first (`REQ-MONITOR-221`), and a long write transaction in the other
process would make that commit wait."

Two OS processes, one store, 10,000 rows prefilled, `busy_timeout = 5000` unless stated. The writer is
the run host committing the `full` shape at `NORMAL` as fast as it can — an overstatement of the real
rate, chosen as a stress. Writer commit durations, **microseconds**:

| Reader | n | min | p50 | **p95** | p99 | max | writer errors |
|---|---|---|---|---|---|---|---|
| none (control) | 3000 | 108.8 | 163.6 | 271.7 | 867.5 | 15100.5 | 0 |
| none (control, replicate) | 3000 | 109.3 | 165.3 | 275.5 | 880.9 | 13291.6 | 0 |
| whole-session reads, back to back | 3000 | 141.0 | **345.9** | **898.9** | 2618.4 | 40760.1 | 0 |
| whole-session reads, back to back (replicate) | 3000 | 136.6 | 283.8 | 613.0 | 1172.1 | 64375.2 | 0 |
| whole-session reads, 5 ms gap | 3000 | 135.3 | 265.9 | 519.6 | 853.5 | 30677.7 | 0 |
| **holds a 200 ms write transaction** (forbidden) | 200 | 125.0 | 203.8 | 434.8 | 1383.6 | **205387.1** | 0 |
| **holds a 50 ms write transaction** (forbidden) | 400 | 128.5 | 248.1 | 403.2 | 1164.7 | **61844.6** | 0 |
| holds a 200 ms write transaction, `busy_timeout = 0` | 3000 | 17.6 | 18.4 | 27.3 | 177.5 | 1077.0 | **2967 of 3000 `SQLITE_BUSY`** |

The reader in the compliant rows is doing real work: each pass reads every one of the ~13,000
transcript rows and the listing, taking **147–1603 ms per pass**, and it read 47,695–82,405 rows over
the run. Its own latency is not the subject here but is recorded because it bears on `REQ-MONITOR-225`.

Four findings.

- **A heavy compliant reader roughly doubles the writer's median commit and triples its p95** — 163.6 →
  345.9 µs at p50, 271.7 → 898.9 µs at p95 — and never blocks it. Zero errors, zero `SQLITE_BUSY`.
  ADR-0058 consequence 2's "contention is real, bounded by rule 4's short `IMMEDIATE` transactions" now
  has a number. The absolute figure stays under a millisecond.
- **Breaking rule 4 costs exactly what the rule says it costs.** A reader holding a 200 ms write
  transaction produced a single commit of **205.4 ms** — 82 % of `REQ-MONITOR-222`'s entire budget, in
  one commit, before the transport has done anything. A 50 ms hold produced a 61.8 ms commit. The rule
  is load-bearing, not hygiene.
- **`busy_timeout` is load-bearing too, and there is a worse failure than waiting.** With
  `busy_timeout = 0`, **2,967 of 3,000 commits raised `SQLITE_BUSY`** — the run host could not persist,
  so under `REQ-MONITOR-221` it could not publish at all. The reader was also starved, taking 97
  `SQLITE_BUSY` of its own 98 attempts: the two processes thrash. ADR-0058 says only that `busy_timeout`
  "is a small bounded value"; this says what happens at the bottom of that range.
- One run is a result by omission: the same forbidden reader with `busy_timeout = 5000` and **no gap
  between its 200 ms write transactions** did not complete 3,000 commits in **300 seconds** and was
  killed. The writer was starved indefinitely. That is not a latency figure and is not reported as one.

---
