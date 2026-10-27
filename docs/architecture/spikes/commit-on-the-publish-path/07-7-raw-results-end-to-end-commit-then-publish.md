# Spike — the transaction commit on the publish path — 7. Raw results — end to end, commit **then** publish

Part 7 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 7. Raw results — end to end, commit **then** publish

**This is the figure the record does not have.** Run host `t_commit0` → renderer applied, in
**milliseconds**, `relay` topology (ADR-0002's actual arrangement: run host → `parentPort` → main →
`webContents.send` → renderer), transcript increment, `push` apply. Percentiles are over pooled samples;
per-run p95 shows every replicate.

### 7.1 End to end

| Condition | resident + recorded rows | n | min | p50 | p90 | **p95** | p99 | p99.9 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|---|
| **commit at `NORMAL`, relay** | **0** | 6000 | 0.715 | 1.111 | 1.487 | **1.774** | 7.617 | 40.937 | 108.302 | 2.221, 1.570, 1.590 |
| **commit at `NORMAL`, relay** | **10,000** | 6000 | 0.674 | 1.095 | 1.463 | **1.723** | 5.283 | 19.021 | 27.927 | 1.737, 1.652, 1.798 |
| commit at `FULL`, relay | 0 | 4000 | 1.295 | 1.733 | 2.236 | **2.587** | 4.370 | 8.124 | 10.180 | 2.588, 2.561 |
| commit at `FULL`, relay | 10,000 | 4000 | 1.281 | 1.734 | 2.194 | **2.517** | 3.928 | 8.791 | 10.278 | 2.578, 2.453 |
| commit at `NORMAL`, direct port | 0 | 2000 | 0.480 | 0.783 | 1.072 | **1.257** | 1.970 | 11.167 | 13.038 | 1.257 |
| commit at `NORMAL`, direct port | 10,000 | 2000 | 0.482 | 0.788 | 1.012 | **1.129** | 1.872 | 10.386 | 12.784 | 1.129 |
| **no commit (control), relay** | 0 | 4000 | 0.427 | 0.770 | 1.032 | **1.161** | 1.510 | 2.052 | 2.426 | 1.140, 1.174 |
| **no commit (control), relay** | 10,000 | 4000 | 0.409 | 0.780 | 1.069 | **1.220** | 1.778 | 3.980 | 5.177 | 1.277, 1.158 |

The no-commit control was run in this session, on this harness, so the commit's contribution is a
difference between two measurements rather than a comparison across reports. It reproduces the
`ipc-hop-latency` spike's relay figures (p95 1.133 ms at 0 rows, 1.291 ms at 10,000) to within 0.03 ms
at 0 rows and 0.07 ms at 10,000 rows, which is the evidence that nothing else about the harness moved.

### 7.2 The same samples, decomposed

| Condition | rows | commit p50 | commit **p95** | transport p50 | transport **p95** | end-to-end **p95** |
|---|---|---|---|---|---|---|
| `NORMAL`, relay | 0 | 0.396 | 0.700 | 0.699 | 1.052 | **1.774** |
| `NORMAL`, relay | 10,000 | 0.378 | 0.642 | 0.699 | 1.065 | **1.723** |
| `FULL`, relay | 0 | 1.095 | 1.681 | 0.629 | 0.922 | **2.587** |
| `FULL`, relay | 10,000 | 1.099 | 1.663 | 0.628 | 0.847 | **2.517** |
| `NORMAL`, direct port | 0 | 0.384 | 0.678 | 0.388 | 0.569 | **1.257** |
| `NORMAL`, direct port | 10,000 | 0.381 | 0.600 | 0.393 | 0.552 | **1.129** |
| no commit, relay | 0 | — | — | 0.768 | 1.159 | **1.161** |

**The commit is 39 % of the end-to-end p95 on the relay path at `NORMAL`, and 54 % on the direct-port
path.** It is now the largest single component of the interval when the ports are used, and roughly
equal to the whole transport when the relay is used. It is still 0.7 % of `REQ-MONITOR-222`'s budget.

One counter-intuitive line is worth stating rather than smoothing: the `FULL` runs have a **lower**
transport p95 (0.847–0.922 ms) than the `NORMAL` runs (1.052–1.065 ms). The commit is ~700 µs longer,
which spaces the publications further apart and leaves main's event loop more slack. It is an artefact
of the fixed cadence, not a benefit of `FULL`.

### 7.3 The tail, and where the checkpoint lands

The autocheckpoint is visible on the end-to-end path at the same period. Counting the run host's own
commit series across a whole run, warm-up included:

| Run | n | commits over 3 ms | share | gap (median / min / max) | spike p50 | spike max |
|---|---|---|---|---|---|---|
| `NORMAL` 0 rows r1 | 2400 | 19 | 0.79 % | 135 / 1 / 137 | 9.06 ms | 24.66 ms |
| `NORMAL` 0 rows r2 | 2400 | 18 | 0.75 % | 135 / 133 / 137 | 7.64 ms | 11.11 ms |
| `NORMAL` 10,000 rows r1 | 2400 | 18 | 0.75 % | 135 / 128 / 137 | 9.20 ms | 18.51 ms |
| `FULL` 0 rows r1 | 2400 | 20 | 0.83 % | 135 / 17 / 137 | 6.48 ms | 8.47 ms |

Exceedance of the **end-to-end** interval, pooled:

| Condition | n | > 5 ms | > 10 ms | > 25 ms | > 50 ms | > 100 ms | **> 250 ms** | max |
|---|---|---|---|---|---|---|---|---|
| commit `NORMAL`, 0 rows | 6000 | 63 | 29 | 11 | 6 | 2 | **0** | 108.30 ms |
| commit `NORMAL`, 10,000 rows | 6000 | 62 | 28 | 1 | 0 | 0 | **0** | 27.93 ms |
| commit `FULL`, 0 rows | 4000 | 37 | 1 | 0 | 0 | 0 | **0** | 10.18 ms |
| no commit, 0 rows | 4000 | 0 | 0 | 0 | 0 | 0 | **0** | 2.43 ms |

**Zero of 20,000 measured end-to-end publications exceeded 250 ms.** The two samples over 100 ms both
came from the *transport* (transport max 107.846 ms against a commit max of 24.658 ms in the same run),
which is the sporadic `webContents.send` excursion the `ipc-hop-latency` spike already recorded as its
finding 6, not a store effect.

### 7.4 To first paint

`t_post` — a task scheduled after the animation frame following the commit — from `t_commit0`:
p95 **10.088–10.510 ms** with a commit, against **9.572–9.664 ms** without one. As the IPC spike found,
this is dominated by the display cadence, and the commit adds roughly its own p50 to it.

---
