# Spike — the run-host → main → renderer double hop — 6. Verdicts

Part 6 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

## 6. Verdicts

### `REQ-MONITOR-222` — 250 ms at the 95th percentile, at zero rows and at thousands — **PASS**

Measured p95, run host publish → renderer applied: **1.133 ms at 0 rows and 1.291 ms at 10,000 rows on
the relay topology.** Including the wait for the frame after the commit, the pooled p95 is 9.632 ms at
0 rows (n = 6,700) and 9.834 ms at 10,000 rows (n = 10,200).
The pooled p99 at 10,000 rows is 2.196 ms and the worst single sample over 10,200 samples is 47.839 ms.
The margin against 250 ms is roughly two orders of magnitude and it holds at both ends of the
requirement's "regardless of how long the session already is".

It also holds under every terminal load the architecture licenses (section 5.1): worst measured p95 at
or below 1,000 frames per second is **7.733 ms**, at 65.5 MB/s. It continues to hold at 12,000 frames
per second (p95 126.207 ms), which is twelve times the licensed rate. It **fails** only under
unthrottled load — p95 31.7 s at ~50,000 frames per second. Reaching that rate would need about a
thousand concurrently flushing streams at ADR-0021's 20 ms floor; it is fifty times what
`REQ-MONITOR-285`'s 20 agents can emit at that floor, and it is not reachable by any value of
`terminal_stream_interval_ms`, which only ever makes the rate lower. It is a stress ceiling, and it is
reported to locate the cliff rather than as a conformance failure. The caveat is that the harness
counts one foreground stream per agent; whether background terminal sessions (`REQ-TOOLS-107`) can push
the concurrent stream count materially above 20 was not established and is left as a question for the
record rather than answered here.

### `REQ-MONITOR-223` — 10,000 rows must cost no more than twice 0 rows, p95, same content — **PASS**

| Apply strategy | Topology | p95 @ 0 rows | p95 @ 10,000 rows | **ratio** | ceiling |
|---|---|---|---|---|---|
| `push` | relay | 1.133 | 1.291 | **1.14** | 2 |
| `copy-on-append` | relay | 1.298 | 1.502 | **1.16** | 2 |
| `push` | direct port | 0.583 | 0.624 | **1.07** | 2 |

At `REQ-SESSION-192`'s actual residency cap of 5,000 rows the relay ratio is 1.353 / 1.133 = **1.19**.
The 10,000-row condition holds all 10,000 rows resident, which is above that cap and therefore the
harder case; both readings pass.

The mechanism is confirmed independently by section 5.4: the increment on the wire is one row whatever
the session length, and an O(1) apply is flat in resident rows. `copy-on-append` is genuinely O(N) at
2.83 ns per row, but at the residency cap that is ~14 µs against a ~500 µs transport floor, so it does
not move the end-to-end ratio. See finding 7.3 — this passes today for a reason that would stop being
true if the residency cap were relaxed.

### `REQ-ORCH-155` — a state change reflected within 100 ms — **PASS at p95; the absolute reading is not reliably met on the relay**

The surfaces `REQ-ORCH-155` names — the child graph, the model-slot and rate-limit waits, verification
progress, the run-progress summary — are non-transcript state and therefore travel on the whole-session
update (`REQ-MONITOR-216`, ADR-0044 channel 2), so section 4.3 and section 5.3 are the relevant
measurements, not the increment figures.

**The requirement states no percentile.** It is quoted here in full because the reading changes the
verdict: "Each of these surfaces MUST reflect a state change the run has recorded within 100 ms of the
run recording it."

- **Read as a p95:** relay p95 is **5.951 ms** unloaded and **7.807 ms** under 65.5 MB/s of terminal
  frames, against a 68,858-byte payload. At 283,438 bytes it is 12.179 ms. **PASS**, with a margin of
  8× to 40×.
- **Read as an absolute bound on every update:** **24 of 9,000 relay samples exceeded 100 ms**, in 2 of
  6 runs — worst 124.983 ms in an *unloaded* run and 375.746 ms in a loaded one. On the direct-port
  path, 0 of 6,000 samples exceeded 50 ms and the worst was 25.482 ms. Under the absolute reading the
  relay **fails** and the direct port does not.

The excursions have two distinct causes, and both were caught in the instrumentation. In the unloaded
run a **single `webContents.send` of the 69 KB payload took 88.263 ms** while main's event loop was
otherwise idle. In the loaded run there was no single slow send (worst 10.234 ms) but a contiguous burst
of 32 samples over 50 ms — main falling behind the terminal stream and draining. Neither appears on the
transcript-increment payload: over 10,200 relay samples at 10,000 rows, **no sample exceeded 50 ms**.

This is recorded as a finding rather than resolved, because which reading is correct is a question for
the specification, not for a spike.

### Question 2 — does a separate channel name stop a terminal stream delaying a transcript row? — **No**

ADR-0044 gives terminal frames their own channel so "a high-volume stream cannot delay a transcript
row". A distinct Electron IPC **channel name does not create a distinct transport**: every
`webContents.send` for a given `webContents` is multiplexed onto one IPC pipe and is dispatched by one
main-process event loop and one renderer main thread. Measured on the relay against the no-load
baseline of p95 1.291 ms at 10,000 rows:

| Terminal load | transcript p95 | ratio to no load |
|---|---|---|
| 4.1 MB/s in 999 frames/s | 1.514 ms | 1.17× |
| 16.4 MB/s in 3,998 frames/s | 1.402 ms | 1.09× |
| 65.5 MB/s in 1,000 frames/s | 7.733 ms | 5.99× |
| 49.1 MB/s in 11,994 frames/s | 126.207 ms | **97.8×** |
| ~200 MB/s unthrottled | 31,716.7 ms | 24,568× |

The cost is **per message, not per byte**: 49.1 MB/s delivered in 12,000 frames/s is far worse than
65.5 MB/s delivered in 1,000 frames/s. Main spends 33.0–37.4 µs in `webContents.send` per 4 KiB frame,
so 12,000 frames/s is ~0.40 s of send time per second of wall clock, before the receive side from the
run host is counted. That is what puts the transcript row's p95 at 126 ms.

**A genuinely separate transport does buy the isolation.** With terminal frames on their own
transferred `MessagePort`, transcript p95 is 1.521 ms at 65.5 MB/s and 1.119 ms at 12,000 frames/s,
against a 0.789 ms no-load baseline — a 1.4×–1.9× effect where the relay showed 6×–98×.

The important qualification: **at the frame rate ADR-0021's own coalescing licenses — 50 frames/s per
stream, ≈1,000 frames/s across `REQ-MONITOR-285`'s 20 agents — no topology showed a problem.** The relay
at 999 f/s × 4 KiB measured p95 1.514 ms. The claim in ADR-0044 is therefore wrong about the mechanism
but is not, at the licensed rate, wrong about the outcome.

### Question 3 — is ADR-0002's remedy better? — **Yes, and the margin is large**

| Measurement | relay | direct port | improvement |
|---|---|---|---|
| increment p95, 0 rows | 1.133 ms | 0.583 ms | 1.94× |
| increment p95, 10,000 rows | 1.291 ms | 0.624 ms | 2.07× |
| increment floor (min) | 0.438 ms | 0.242 ms | 1.81× |
| 68,858 B whole-session p95 | 5.951 ms | 1.612 ms | 3.69× |
| 68,858 B whole-session worst sample | 124.983 ms | 4.650 ms | 26.9× |
| increment p95 at 65.5 MB/s terminal | 7.733 ms | 1.521 ms | 5.08× |
| increment p95 at 12,000 frames/s | 126.207 ms | 1.119 ms | 113× |

The remedy also discharges ADR-0044's cross-channel ordering obligation by removing the hop that could
violate it, as ADR-0044 consequence 3 anticipates. It was verified to work with `sandbox: true`,
`contextIsolation: true` and `nodeIntegration: false` intact — the port arrives in the sandboxed main
world through the preload's `window.postMessage` transfer, so none of ADR-0002's renderer posture is
given up to get it.

**It is not required by the measurements against `REQ-MONITOR-222` and `REQ-MONITOR-223`**, both of
which the relay meets with a large margin. It is the difference between passing and failing only on
`REQ-ORCH-155` read as an absolute bound, and only for the whole-session payload.

---
