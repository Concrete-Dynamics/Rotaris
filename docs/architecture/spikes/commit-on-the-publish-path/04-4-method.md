# Spike — the transaction commit on the publish path — 4. Method

Part 4 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 4. Method

**What is timed.** Three intervals, from stamps taken in the processes that own them:

| Name | From | To |
|---|---|---|
| **commit** | run host, immediately before `BEGIN IMMEDIATE` | run host, immediately after `COMMIT` returns |
| **transport** | run host `t_send`, immediately before the publish call | renderer, after the store apply, the projection and the recycler's DOM commit have all returned |
| **end to end** | run host `t_commit0` | the same renderer stamp |

`REQ-MONITOR-222` bounds "run activity … appear on the live surfaces"; `REQ-MONITOR-223` says
"measured from the run **emitting** the change to the surface showing it"; `REQ-ORCH-155` says "within
100 ms of the run **recording** it". The end-to-end interval above is the closest match to the first
two. For `REQ-ORCH-155` the clock arguably starts where the recording ends, which is the **transport**
interval; both readings are given in section 10 and the choice is stated rather than assumed.

**Clocks.** In Electron's Node — main process, utility process — `process.hrtime.bigint()` was measured
in situ and ticks at **100 ns**, which resolves a 60 µs commit. The renderer's `performance.now()` is
coarsened to 100 µs, as the IPC spike recorded. Cross-process comparison uses the **same NTP-style
calibration that spike established and validated**: 400 ping-pong exchanges over the transport about to
be measured, θ from the median of the best 10 % by round-trip time, before any measurement begins. The
within-run spread of θ over that best decile was 0.083–0.230 ms across the runs here.

**Sampling.** Every condition is a separate process launch, so no heap or JIT state carries between
conditions. Commit benchmark (sections 5 and 6): 300 warm-up commits, discarded, then
`PRAGMA wal_checkpoint(TRUNCATE)`, then 3,000 measured commits (12,000 for the long runs), the WAL file
size sampled after each timed region. End-to-end (section 7): the IPC spike's protocol unchanged —
prefill, settle 600 ms, two forced `global.gc()` passes, settle 400 ms, 400 calibration exchanges, 400
warm-up publications discarded, 2,000 measured publications.

**Publish cadence.** As the IPC spike recorded, a Node `setInterval` on Windows fires at the ~15.6 ms
system timer granularity whatever period is asked for, so the end-to-end runs publish at ≈64 per second.
That is above `REQ-MONITOR-219`'s 20-per-second coalescing tick and is a stress rather than a
concession. The measured intervals start at `t_commit0` and so are not biased by the cadence.

**Counts.** 34 commit-benchmark launches, 16 end-to-end launches, 11 two-process concurrency runs, 3
`node:sqlite` runs, and 6 targeted probes. Every launch reported below exited 0 and produced output.
`refused = 0` in every end-to-end run, so every quoted latency is a latency of an increment the renderer
actually applied.

---
