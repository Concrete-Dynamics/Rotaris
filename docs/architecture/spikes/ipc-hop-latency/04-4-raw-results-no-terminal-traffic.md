# Spike — the run-host → main → renderer double hop — 4. Raw results — no terminal traffic

Part 4 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

## 4. Raw results — no terminal traffic

End-to-end, run host publish → renderer applied, in **milliseconds**. Percentiles are over the pooled
samples of all runs of that condition; the per-run p95 column shows every individual run so the
run-to-run spread is visible rather than hidden inside the pool.

### 4.1 Transcript increment (4,062–4,064 B), `push` apply

| Topology | resident rows | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|
| relay | 0 | 6700 | 0.438 | 0.779 | 1.015 | **1.133** | 1.632 | 28.041 | 1.100, 1.041, 1.519, 1.090 |
| relay | 5000 | 3200 | 0.500 | 0.822 | 1.123 | **1.353** | 3.723 | 31.466 | 1.277, 1.471 |
| relay | 10000 | 10200 | 0.474 | 0.811 | 1.102 | **1.291** | 2.196 | 47.839 | 1.231, 1.266, 1.373, 1.078, 1.369, 1.444 |
| direct port | 0 | 3500 | 0.242 | 0.410 | 0.533 | **0.583** | 0.747 | 2.184 | 0.589, 0.578 |
| direct port | 10000 | 4700 | 0.243 | 0.425 | 0.556 | **0.624** | 0.954 | 5.327 | 0.612, 0.816, 0.572 |
| two direct ports | 10000 | 1500 | 0.333 | 0.508 | 0.670 | **0.789** | 1.091 | 5.099 | 0.789 |

### 4.2 Transcript increment, `copy-on-append` apply (relay)

| resident rows | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|
| 0 | 3200 | 0.498 | 0.769 | 1.063 | **1.298** | 1.889 | 15.763 | 1.349, 1.211 |
| 5000 | 3200 | 0.500 | 0.783 | 1.049 | **1.242** | 1.969 | 5.324 | 1.443, 1.053 |
| 10000 | 3200 | 0.507 | 0.816 | 1.184 | **1.502** | 2.349 | 5.327 | 1.365, 1.690 |

### 4.3 Whole-session update, 10,000 resident rows

| Topology | payload | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|
| relay | 68,858 B | 3000 | 2.445 | 3.060 | 4.135 | **5.951** | 40.776 | 124.983 | 4.293, 17.722 |
| relay | 283,438 B | 1500 | 7.807 | 8.651 | 10.607 | **12.179** | 16.790 | 22.085 | 12.179 |
| direct port | 68,858 B | 1500 | 0.757 | 1.087 | 1.446 | **1.612** | 2.274 | 4.650 | 1.612 |
| two direct ports | 68,858 B | 1500 | 0.956 | 1.327 | 2.134 | **2.634** | 3.187 | 10.931 | 2.634 |

### 4.4 To first paint

`t_post` — the task after the animation frame that follows the commit — measured in every condition:
**p95 9.127–10.315 ms** with no terminal load, in every topology and at every resident row count. This
is one to two vsync intervals at 60 Hz and is a property of the display cadence, not of the transport:
it does not vary with topology or session length. Under 65.5 MB/s of relayed terminal traffic it rises
to 13.702 ms; at 49 MB/s in 12,000 frames per second it rises to 129.406 ms; under unthrottled load it
tracks the applied figure into the seconds.

---
