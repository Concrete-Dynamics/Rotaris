# Spike — the run-host → main → renderer double hop — 5. Raw results — under terminal-frame load

Part 5 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

## 5. Raw results — under terminal-frame load

10,000 resident rows, transcript increment payload, `push` apply. Terminal frames travel on
`terminal:frames` (relay), the shared port (`direct`) or their **own** port (`direct2`). Rates are the
**achieved** rates measured in the run host, not the requested ones.

### 5.1 Relay

| Terminal load (achieved) | n | min | p50 | p90 | **p95** | p99 | max |
|---|---|---|---|---|---|---|---|
| none | 10200 | 0.474 | 0.811 | 1.102 | **1.291** | 2.196 | 47.839 |
| 64 f/s × 4 KiB = 0.3 MB/s | 2000 | 0.444 | 0.785 | 1.059 | **1.193** | 4.076 | 30.638 |
| 322 f/s × 4 KiB = 1.3 MB/s | 2000 | 0.421 | 0.982 | 1.396 | **1.544** | 2.612 | 6.003 |
| 999 f/s × 4 KiB = 4.1 MB/s | 1500 | 0.516 | 0.853 | 1.238 | **1.514** | 11.317 | 42.056 |
| 321 f/s × 64 KiB = 21.0 MB/s | 2000 | 0.524 | 1.580 | 2.013 | **2.165** | 6.729 | 29.917 |
| 3,998 f/s × 4 KiB = 16.4 MB/s | 1500 | 0.470 | 0.756 | 1.065 | **1.402** | 2.089 | 6.248 |
| 1,000 f/s × 64 KiB = 65.5 MB/s | 1500 | 2.498 | 3.651 | 4.470 | **7.733** | 18.835 | 30.014 |
| 11,994 f/s × 4 KiB = 49.1 MB/s | 1500 | 0.420 | 0.774 | 80.929 | **126.207** | 206.198 | 232.783 |
| unthrottled, ~50k f/s × 4 KiB = 200–209 MB/s | 4000 | 5443.4 | 19335.1 | 30345.3 | **31716.7** | 32982.1 | 33572.7 |

### 5.2 Direct ports

| Topology | Terminal load (achieved) | n | min | p50 | p90 | **p95** | p99 | max |
|---|---|---|---|---|---|---|---|---|
| one shared port | none | 4700 | 0.243 | 0.425 | 0.556 | **0.624** | 0.954 | 5.327 |
| one shared port | 322 f/s × 64 KiB = 21.1 MB/s | 2000 | 0.363 | 0.652 | 0.883 | **1.015** | 8.741 | 26.731 |
| one shared port | unthrottled, ~46k f/s = 190 MB/s | 4000 | 1507.9 | 5261.4 | 8634.3 | **9056.5** | 9534.8 | 9705.9 |
| **terminal on its own port** | none | 1500 | 0.333 | 0.508 | 0.670 | **0.789** | 1.091 | 5.099 |
| **terminal on its own port** | 999 f/s × 64 KiB = 65.5 MB/s | 1500 | 0.331 | 0.590 | 1.128 | **1.521** | 6.649 | 15.040 |
| **terminal on its own port** | 11,993 f/s × 4 KiB = 49.1 MB/s | 1500 | 0.310 | 0.521 | 0.743 | **1.119** | 5.488 | 8.754 |
| **terminal on its own port** | unthrottled, ~40k f/s = 162.9 MB/s | 1500 | 1360.2 | 3461.4 | 5436.7 | **5682.3** | 5888.9 | 5948.3 |

Side by side at the two loads measured on both, with the same 10,000 resident rows:

| Load | relay p95 | own-port p95 | factor |
|---|---|---|---|
| 65.5 MB/s in 1,000 frames/s | 7.733 | 1.521 | **5.1×** |
| 49.1 MB/s in 12,000 frames/s | 126.207 | 1.119 | **113×** |
| unthrottled (~200 vs ~163 MB/s) | 31716.7 | 5682.3 | 5.6× |

### 5.3 Whole-session update under load

68,858 B whole-session update, 10,000 resident rows, against 999–1,000 f/s × 64 KiB = 65.5 MB/s of
terminal frames.

| Topology | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|
| relay | 6000 (4 runs) | 2.449 | 3.609 | 6.419 | **7.807** | 14.781 | 375.746 | 9.302, 7.516, 8.303, 7.432 |
| terminal on its own port | 3000 (2 runs) | 0.867 | 1.189 | 2.517 | **2.754** | 8.773 | 25.482 | 2.753, 2.760 |

### 5.4 Component costs

**Main's relay cost**, measured as the wall time of `webContents.send` in main, p95 unless stated:

| Payload | p95 (range over runs) | worst single call observed |
|---|---|---|
| 4.06 KB transcript increment | 72–151 µs (29 runs) | 24,481 µs |
| 68,858 B whole-session update | 528–1,057 µs (6 runs) | 88,263 µs |
| 283,438 B whole-session update | 1,569 µs (1 run) | — |
| 4 KiB terminal frame | 33.0–37.4 µs (mean over 29k–587k frames) | — |
| 64 KiB terminal frame | 163.0–195.0 µs (mean over ~30k frames) | — |

**Renderer-side per-operation costs**, batched over 2,000 iterations each:

| Resident rows | apply `push` (store + projection) | apply `copy-on-append` | apply + 40-slot DOM commit (`push`) | apply + DOM (`copy-on-append`) | `structuredClone` of the 4.06 KB increment |
|---|---|---|---|---|---|
| 1,600 | 2.85 µs | 7.75 µs | 44.65 µs | 38.75 µs | 43.75 / 20.00 µs |
| 6,600 | 2.20 µs | 18.05 µs | 34.95 µs | 46.20 µs | 27.50 / 19.80 µs |
| 11,600 | 1.20 µs | 36.05 µs | 28.95 µs | 56.80 µs | 22.60 / 19.65 µs |
| 11,900–12,400 (10 further runs) | 0.95–1.70 µs | — | 24.35–38.50 µs | — | 18.65–31.15 µs |

`push` is flat in resident rows. `copy-on-append` grows at **≈ 2.83 ns per resident row**
((36.05 − 7.75) µs / 10,000 rows).

*The resident counts in this table are `N + warm-up + measured` because the benchmark runs after the
measured window; the "0 rows" condition benchmarks at 1,600 resident, not at 0.*

**Tail excursions**, counted over every sample of every run:

| Group | runs | samples | > 10 ms | > 50 ms | > 100 ms | worst |
|---|---|---|---|---|---|---|
| transcript increment, relay, 10,000 rows | 6 | 10,200 | 11 | 0 | 0 | 47.8 ms |
| transcript increment, direct port, 10,000 rows | 4 | 6,200 | 0 | 0 | 0 | 5.3 ms |
| whole-session update, relay | 6 | 9,000 | 202 | 57 | **24** | 375.7 ms |
| whole-session update, direct port | 4 | 6,000 | 27 | 0 | 0 | 25.5 ms |

---
