# Spike — the run-host → main → renderer double hop — 3. Method

Part 3 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

## 3. Method

**What is timed.** From the run host's `t_send`, taken immediately before the publish call, to the
renderer's `t_applied`, taken immediately after the store apply, the projection and the recycler's DOM
commit have all returned. A second stamp `t_post` is taken in a task scheduled after the
`requestAnimationFrame` that follows the commit, which is the earliest point at which the frame has
been handed to the compositor.

**This interval is a strict subset of what the requirements bound.** `REQ-MONITOR-222` starts at "run
activity"; `REQ-ORCH-155` starts at "the run recording it", and `REQ-MONITOR-221` requires the change to
be persisted before it is published. The database commit, the run host's own projection, and everything
upstream of the publish call are **outside** this measurement. Every figure below is therefore a lower
bound on the requirement's own interval, and is offered as the cost of the transport, not as the cost of
the product. `REQ-MONITOR-223`'s wording — "from the run emitting the change to the surface showing it"
— is the closest match to what was measured.

**Clocks.** All three processes stamp with `performance.timeOrigin + performance.now()`. That is not
adequate on its own: measured across 46 runs the run-host-to-renderer offset ranged from **−1.393 ms to
+0.041 ms**, which is larger than the whole one-way latency on the direct-port path. Each run therefore
performs **400 NTP-style ping-pong exchanges over the same transport it is about to measure**, before
any measurement begins, and takes θ from the median of the best 10 % by round-trip time
(θ = ((T₁−T₀) + (T₂−T₃))/2). The within-run spread of θ over that best decile had a **median of
0.125 ms and a worst case of 0.180 ms** across all runs, so the calibration is good to roughly ±0.09 ms.
This assumes the forward and return path delays are symmetric, which is the standard assumption and is
reasonable over an identical two-hop relay in both directions.

**Independent check on the calibration.** An early analysis applied θ with the wrong sign. Under the
correct sign the eight batch-1 runs — whose θ ranged over 1.27 ms — collapse to a **floor of
0.438–0.507 ms**, agreeing to within 70 µs. Under the wrong sign the same eight runs' floors spread over
0.415–2.958 ms. The agreement of the corrected floors across runs with widely different offsets is what
gives confidence that the correction is right.

**Resolution.** The renderer's `performance.now()` was measured in situ; its median tick is **100 µs**.
Single-operation renderer-side costs are therefore quantised at 0.1 ms and are not resolvable from the
end-to-end samples. Those costs are reported separately in section 5.4 from batched micro-benchmarks of
2,000 iterations each, run **after** the measured window so they cannot perturb it.

**Sampling.** Each condition is a **separate application launch**, so no heap or JIT state carries
between conditions. Each run: prefill the renderer's resident window with N rows → settle 600 ms →
two forced `global.gc()` passes (`--js-flags=--expose-gc`) → settle 400 ms → 400 calibration exchanges →
**400 warm-up publications, discarded** → 1,200–2,000 measured publications. 46 runs were completed;
none hit its watchdog; every one exited 0.

**Publish cadence.** The publish timer was nominally 5 ms but a Node `setInterval` on Windows fires at
the ~15.6 ms system timer granularity. Measured host-side publish interval: **p50 15.55 ms, p95
16.24–16.35 ms** — that is ~64 publications per second. The one exception is the unthrottled-load runs,
where the busy loop raised the effective timer resolution and the interval was **p50 5.00 ms**. The
end-to-end measurement is taken from `t_send` and so is not biased by the cadence, but the cadence
determines the arrival rate and is stated for reproduction.

**Window state.** The window is shown and `backgroundThrottling: false`. An occluded or throttled window
would have distorted every `requestAnimationFrame` figure.

---
