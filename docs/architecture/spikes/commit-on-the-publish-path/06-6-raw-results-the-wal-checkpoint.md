# Spike — the transaction commit on the publish path — 6. Raw results — the WAL checkpoint

Part 6 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 6. Raw results — the WAL checkpoint

### 6.1 How often it fires, and what it costs

Measured from the per-commit series plus the WAL file size sampled after each commit. `full` shape,
`synchronous = NORMAL`, `wal_autocheckpoint = 1000` (SQLite's default, read back), page size 4096, WAL
frame 4120 bytes.

**The transaction writes a measured 7.44 WAL frames.** 1000 ÷ 7.44 = 134.4, and the observed period is
**135–136 commits**, which is the arithmetic confirming itself.

| Run | n | commits over 2 ms | share | gap between them (min / median / max) | spike cost p50 | spike p95 | spike max |
|---|---|---|---|---|---|---|---|
| 12,000 commits, 0 rows, r1 | 12000 | 89 | 0.74 % | 132 / **136** / 139 | **9066 µs** | 11463 | 14632 |
| 12,000 commits, 0 rows, r2 | 12000 | 88 | 0.73 % | 132 / **136** / 139 | 10080 | 13437 | **53102** |
| 12,000 commits, 10,000 rows | 12000 | 88 | 0.73 % | 132 / **136** / 138 | 10994 | 14428 | 21226 |
| 3,000 commits, 0 rows | 3000 | 22 | 0.73 % | 132 / **136** / 139 | 9685 | 11930 | 16916 |

The spike indices are almost perfectly periodic — `135, 270, 407, 542, 678, 814, 951, 1088, 1220,
1359, 1492, 1630, 1764, 1901, …` — which is what identifies them as the autocheckpoint rather than as
scheduler noise.

**With the checkpointing commits removed**, the body of the distribution is:
**p50 179.2–219.9 µs · p95 301.0–385.7 µs · p99 442.4–642.8 µs · max 1592.6–1883.5 µs.**

So the honest statement of the publish-path commit at `NORMAL` is not one number but two:

> **About 0.73 % of commits — one in every 136 — cost 9–11 ms at p50 and up to 53 ms. The other
> 99.27 % cost 179–220 µs at p50 and 301–386 µs at p95.**

At `REQ-MONITOR-219`'s ceiling of 20 publications per second that is a checkpoint every **6.8 s**; at
the ≈64 per second these runs actually achieved, every **2.1 s**.

### 6.2 Turning the autocheckpoint off makes everything worse

ADR-0058 leaves checkpointing "on SQLite's automatic schedule". The alternative was measured.

| `wal_autocheckpoint` | n | p50 | **p95** | p99 | p99.9 | max | WAL after 3,000 commits | explicit `wal_checkpoint(PASSIVE)` |
|---|---|---|---|---|---|---|---|---|
| 1000 (default) | 9000 | 185.4 | 362.8 | 1077.0 | 12595.6 | 37907.5 | 4.16 MB (1,010 frames) | 3330.9 µs (71 frames) |
| **0 (off)** | 9000 | **242.4** | **678.8** | 989.4 | 1833.5 | 4155.4 | **91.26 MB (22,151 frames)** | **155,188 µs (22,151 frames)** |

Disabling it removes the periodic spike and buys nothing: the ordinary commit gets **31 % slower at
p50 and 87 % slower at p95** because every commit now searches a WAL that never resets, and the
deferred work reappears as a **155 ms** stall the moment anything checkpoints, plus 18.4 ms to truncate.
**ADR-0058's choice to leave the automatic schedule alone is the right one and this is the evidence.**

### 6.3 Explicit checkpoints

At a 4.16 MB WAL, measured at the end of each run. Over the 29 measurements at `synchronous` 1 or 2,
`wal_checkpoint(PASSIVE)` cost **min 1885 µs, median 2975 µs, max 12176 µs** (the 12.2 ms figure is a
single observation), and a following `wal_checkpoint(TRUNCATE)` **776–1519 µs**. Every one returned
`busy = 0` and checkpointed every frame it reported.

The two runs at `synchronous = OFF` are the control that shows what the checkpoint is spending its time
on: the same `PASSIVE` checkpoint over the same WAL cost **524 and 586.5 µs**. **So roughly 2.4 ms of a
2.975 ms checkpoint is its `fsync`s** — SQLite syncs the WAL before the checkpoint and the database file
after it, which is two of this device's ~560 µs flushes plus the copying.

---
