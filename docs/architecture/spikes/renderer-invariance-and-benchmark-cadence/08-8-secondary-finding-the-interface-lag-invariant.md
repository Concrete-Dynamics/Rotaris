# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 8. Secondary finding — the interface-lag invariant and how a phase is driven

Part 8 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

## 8. Secondary finding — the interface-lag invariant and how a phase is driven

Not asked for, but it falls out of the phase records and bears on ADR-0053. `REQ-UIBENCH-118` requires
`event_loop_lag_ms` strictly below 100 ms in **every** record, probed every 10 ms per `REQ-UIBENCH-049`.

The harness's driver applies each phase's updates in one synchronous burst, which is the obvious way to
implement the phase text. Measured maximum `event_loop_lag_ms` over a run:

| driver | top variant | follow variant |
|---|---|---|
| burst, no yielding | 588, 591, 581.7 ms | 2752.4, 2568.2, 2546.5 ms |
| yields to the event loop after every update | **74.8 ms** | **68.7 ms** |

With a burst driver, `interface_lag_within_budget` is **false**, by a factor of up to 27. With a driver
that yields after every update it is **true** in both variants, with the largest value being
`apply_fixture`'s single bulk assignment, which yielding cannot break up.

Yielding is not free: `ordered_appends` goes from 363.8 ms to 6,318.2 ms and `streaming_updates` from
593.0 ms to 15,693.9 ms in the top variant, because each yield costs a clamped timer turn. The widget
counts and the operation counters are unchanged.

This is a property of how the benchmark drives a phase, not of the recycler, and it is a choice ADR-0053
currently leaves implicit. Whichever way it is settled, one of `REQ-UIBENCH-118`'s boolean and the phase
wall times is going to look very different from the other reading, and the two are not separately tunable.

---
