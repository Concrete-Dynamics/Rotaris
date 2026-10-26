# Spike — the writer's own handle, and what a follower sees across a compaction — 4. Results — the proposed fix under concurrency

Part 4 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

## 4. Results — the proposed fix under concurrency

Eight arms. `cap` 200 unless stated; headroom `cap/8`; trim when lines exceed `cap + cap/8`. "Handle-closed
window" is how long the journal had no append handle. "Rename→marker window" is how long the trimmed file
was live while `events.meta.json` still carried the old dropped count.

| Arm | Mode | cap | Follower poll | Followers | Trims completed | Rename attempts | Handle-closed p50 / p95 / max | Rename→marker p50 / p95 / max |
|---|---|---|---|---|---|---|---|---|
| **R-G** | close | 200 | — | 0 | **400 / 400** | 1×400 | 4.5 / 6.5 / 8.0 ms | 2.6 / 3.6 / 6.3 ms |
| **R-B** | close | 200 | 750 ms | 8 | **250 / 250** | 1×248, 2×2 | 5.4 / 10.5 / 64.5 ms | 3.1 / 5.2 / 7.5 ms |
| **R-C** | close (constant-length lines) | 200 | 750 ms | 8 | **250 / 250** | 1×240, 2×10 | 5.3 / 12.4 / 63.9 ms | 3.1 / 6.8 / 99.0 ms |
| **R-H** | close | 200 | 50 ms | 2 | **300 / 300** | 1×281, 2×19 | 5.3 / 64.6 / 68.1 ms | 3.2 / 6.2 / 35.3 ms |
| **R-F** | close | **20000** | 750 ms | 4 | **30 / 30** | 1×30 | **29.8 / 41.4 / 42.3 ms** | 2.9 / 3.6 / 3.9 ms |
| **R-A** | close | 200 | **0 ms** | 2 | **162 / 300** | 1×32, 2×40, 3×33, 4×30, **5×165** | 169 / 782 / 840 ms | 95 / 130 / 136 ms |
| **R-E** | unlink+rename | 200 | 0 ms | 2 | 300 / 300 | 1×300 | 6.4 / 10.8 / 17.5 ms | 68 / 133 / 169 ms |
| **R-D** | **hold** (naive) | 200 | 750 ms | 2 | **0 / 115** | **5×115** | n/a | n/a |

Rename error codes were `EPERM` in every failing case (994 in R-A, 575 in R-D, 19/10/2 in R-H/R-C/R-B).
No arm left a staged `.tmp` file behind on any path, including R-A's 138 failures and R-D's 115.

### 4.1 The naive shape (R-D) fails exactly as predicted, and silently

**0 of 115 trims completed.** Every one exhausted the full 5-attempt ladder. The journal reached 340 lines
against a limit of 225 — **115 over the cap and still growing** when the arm's 90 s budget expired. The two
followers recorded **zero** restarts and zero anomalies over 248 reads: nothing observable happened.

There is a second cost that is not in the requirement text. `REQ-EVENTS-091` says an append that leaves the
file over the headroom "MUST be followed by a trim before any further append is accepted", so once the trim
starts failing **every subsequent append carries a whole failed retry ladder**. Measured throughput
collapsed to **340 appends in 90.5 s = 3.76 events/s**, against 8,000 appends in 29.0 s = 276 events/s in the
otherwise-comparable R-E arm. That is a ~73× throughput collapse on the journal, on top of the cap never
being enforced.

### 4.2 The fix works at every realistic cadence, and needs the retry ladder

At the foreign-follower cadence `REQ-MONITOR-288` fixes — 750 ms — with **eight** concurrent followers,
250/250 trims completed, 248 of them on the first attempt. At the real default cap of 20,000 lines (R-F, a
5,010,000 B journal, the same staged per trim) **30/30 completed on the first attempt**, and the file's
high-water mark was 22,501 lines against a limit of 22,500 — the cap held exactly.

But closing the writer's handle is **necessary, not sufficient.** A follower obeying ADR-0004 rule 1 still
holds a descriptor *for the duration of each poll*, and that is enough. Measured reader duty cycle (`p8`):

| Journal | One poll holds the file open (p50) | Duty cycle @ 750 ms | Duty cycle @ 50 ms |
|---|---|---|---|
| 200 lines (48,550 B), steady-state poll | 0.812 ms | 0.108 % | 1.62 % |
| 200 lines, re-seed poll (reads the whole file) | 0.945 ms | 0.126 % | — |
| 20,000 lines (4,918,890 B), steady-state poll | 0.837 ms | 0.112 % | 1.67 % |
| 20,000 lines, re-seed poll | 3.322 ms | 0.443 % | — |
| `events.meta.json` read (every poll, per `REQ-EVENTS-111`) | 0.810–0.865 ms | — | — |

That small residue is exactly what the retry ladder is for, and it is **load-bearing**: 2/250 trims in R-B,
10/250 in R-C and 19/300 in R-H needed a second attempt at realistic cadences. Push the duty cycle to its
limit — two followers polling with no delay at all, which the product would never do — and **138 of 300
trims failed outright despite five attempts**, with 165 trims exhausting the ladder. Even then the file
drifted only 9 lines over its limit, because the writer re-attempts the trim on the next append: the
failures are transient collisions, not the permanent stall of R-D.

### 4.3 What the follower observed — 172,191 reads

Aggregated across all eight clean arms:

| Counter | Total |
|---|---|
| Resumable reads | **172,191** |
| Events delivered | 4,004,914 |
| **Empty-file reads** | **0** |
| **Unparseable complete lines** | **0** |
| **Partial trailing line delivered as an event** | **0** |
| **Silent gaps** (events lost with no restart flag) | **0** |
| **Silent duplicates** (event redelivered with no restart flag) | **0** |
| Ground-truth trims observed | 5,189 |
| **Trims observed but not detected** | **0** |
| Restarts raised | 5,982 |
| — by the length test | 4,999 |
| — by the terminator test | 178 |
| — by the marker comparison | 5,018 |
| — **by the marker alone** (length and terminator both missed) | **663** |
| — **by length/terminator alone** (marker still stale) | **822** |
| Missing-file reads | 142 — **all of them in the unlink+rename arm** |
| Read errors | 17 — **all of them in the unlink+rename arm** |

Three things follow.

**Zero empty reads in 172,191.** ADR-0004's spike found one zero-length read in 1,850 and one in 16,250; this
harness exceeds that order of magnitude by an order of magnitude and found none. That is **not a refutation**
— it is a different workload (append-and-compact by one writer, versus two writer processes replacing a
200 KB document against a reader loop) and the difference may well be the workload rather than the platform.
It does say that for *this* compaction shape, the empty read `REQ-LIBRARY-043` forbids was not reproduced.

**Both detectors are individually necessary.** 663 restarts fired on the marker comparison when the
length and terminator tests had both missed; 822 fired on length/terminator when the marker was still
stale. Neither is redundant. `REQ-EVENTS-111`'s insistence on reading the marker on every read is doing
real work, and so is the older length test it was added to reinforce.

**Unlink-then-rename is disqualified.** It is the one route reachable from Node core that works past a held
handle — 300/300 renames succeeded — but the followers saw the journal **absent 142 times in 20,312 reads
(0.70 %)** plus 17 read errors. `REQ-EVENTS-091` requires the file to be replaced "in one atomic step";
unlink-then-rename is two, and the gap is observable.

---
