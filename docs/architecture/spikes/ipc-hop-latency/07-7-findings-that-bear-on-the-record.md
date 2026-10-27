# Spike — the run-host → main → renderer double hop — 7. Findings that bear on the record

Part 7 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

## 7. Findings that bear on the record

### 7.1 ADR-0044's "terminal frames on their own lane" is not implemented by a channel name

Consequence 5 of ADR-0044 already keeps the two sequence vocabularies distinct, and consequence 3
already anticipates the double hop. What is not in the record is that **`transcript:increment` and
`terminal:frames` are the same lane** under `webContents.send`. The isolation ADR-0044 attributes to
channel 3 exists only if channel 3 has its own transport. The measurements say the difference is 6× to
98× in transcript p95 at loads above ~4,000 frames/s or ~20 MB/s.

Two things follow, and both are cheap. First, if terminal frames stay on `webContents.send`, the
architecture's protection against this is entirely ADR-0021's coalescing cap, and that cap becomes
load-bearing for `REQ-MONITOR-222` rather than merely being a display concern. Second, if a direct port
is adopted for the update channels, giving terminal frames a **second** port costs one more
`MessageChannelMain` and recovers the isolation ADR-0044 claims.

### 7.2 The relay's cost is per message, not per byte

Main's `webContents.send` costs 33.0–37.4 µs for a 4 KiB frame and 163.0–195.0 µs for a 64 KiB frame —
a 16× payload for a 5× cost. The corollary is that the relay's capacity is a message rate, and that
message rate is the thing to instrument in diagnostics (ADR-0052). At 12,000 messages/s it is at ~40 %
utilisation in `send` alone and p95 has already risen 98×; unthrottled it collapses into an unbounded
backlog (main's event-loop lag reached 22,777 ms; the queue drained for tens of seconds after the run
host stopped publishing).

ADR-0044 consequence 4 asks diagnostics to "distinguish a gap caused by an overflowing subscriber queue
from one caused by the relay". Worth noting for that: in the collapse, **nothing was dropped and nothing
was reordered** — `refused = 0`, and the renderer received every one of the 586,960 frames the run host
sent. The relay degrades into unbounded latency, not into loss, so a gap counter would never fire and
the failure would present only as a stale interface.

### 7.3 `REQ-MONITOR-223` passes for a reason that depends on the residency cap

The idiomatic immutable store update, `[...rows, row]`, is O(N) at 2.83 ns per resident row. At the
5,000-row cap of `REQ-SESSION-192` that is ~14 µs and is invisible against the ~500 µs transport floor,
which is why the measured ratio is 1.16 rather than something alarming. The margin is being supplied by
the transport, not by the store. ADR-0057's "every selector carries an explicit equality function …
which breaks `REQ-MONITOR-223` under load and is invisible when idle" is the same hazard one level up;
this measurement gives it a number, and a test that measures the store apply in isolation would catch a
regression that an end-to-end p95 would not.

### 7.4 Structured-clone cost is nowhere near dominating the budget

ADR-0044's "Revisit if" names structured-clone cost dominating the 250 ms p95 for large snapshots. Two
measurements bear on it: `structuredClone` of a 4.06 KB increment costs **18.65–43.75 µs** in the
renderer, and a 283,438-byte whole-session update crosses both relay hops and is applied in a p95 of
**12.179 ms**. Quadrupling the snapshot from 68,858 to 283,438 bytes multiplied the p95 by 2.05, not by
4. On this evidence the revisit trigger is a long way off; the sporadic 88 ms `webContents.send` in
finding 6/`REQ-ORCH-155` is a much nearer hazard than the clone cost, and it is not a function of size
in any way this spike could reproduce on demand.

### 7.5 `performance.timeOrigin` is not a shared clock across Electron processes

Measured offset between the run host and the renderer ranged over **1.43 ms across 46 runs** — larger
than the entire one-way latency on the direct-port path. Any conformance test for `REQ-MONITOR-222`,
`REQ-MONITOR-223` or `REQ-ORCH-155` that stamps in one process and compares in another must calibrate,
or it will report a number whose error is the size of the thing it is measuring. `REQ-MONITOR-225`
already requires each snapshot load and each projection duration to be recorded in diagnostics; those
are single-process intervals and are unaffected. A cross-process one is not.

---
