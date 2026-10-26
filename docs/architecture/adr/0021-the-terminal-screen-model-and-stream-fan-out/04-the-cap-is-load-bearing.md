# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — The cap is load-bearing

Part 4 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## The cap is load-bearing

This section is new and it is the reason this record was revised. **The coalescing cap stated in the
Decision above is now the architecture's whole protection for `REQ-MONITOR-222`, and it acquired that
role by measurement rather than by design.**

**What the channel separation was taken to buy, and what was measured.** ADR-0044 gives terminal frames
their own named channel (`terminal:frames`, channel 3) separate from `transcript:increment` and
`session:snapshot`, and the spike records that the separation was read as meaning "a high-volume stream
cannot delay a transcript row". ADR-0044 as it now stands is a record another agent owns and it is cited
here rather than amended here; what follows is a measurement of the mechanism, not a reading of that
record's current wording. The `ipc-hop-latency` spike put the separation on a real four-process
arrangement matching ADR-0002 and
found that **a distinct Electron IPC channel name is not a distinct transport**: every
`webContents.send` for one `webContents` is multiplexed onto one pipe and dispatched by one
main-process event loop and one renderer main thread. Against a no-load baseline of transcript-increment
p95 **1.291 ms** at 10,000 resident rows, terminal load on the separate *name* moved transcript p95 to
1.514 ms at 999 frames/s, **7.733 ms** at 65.5 MB/s in 1,000 frames/s, and **126.207 ms** at 49.1 MB/s
delivered in 11,994 frames/s — a rise of **97.8×** over no load, against `REQ-MONITOR-222`'s 250 ms
budget. The relay's cost is **per message, not per byte**: 33.0–37.4 µs in `webContents.send` per 4 KiB
frame against 163.0–195.0 µs per 64 KiB frame, so 12,000 frames/s spends about 0.40 s of every wall
second in `send` alone. A genuinely separate transport — terminal frames on their own transferred
`MessagePort` — held transcript p95 at 1.119 ms at the same 12,000 frames/s, which is what shows the
effect is the shared lane and not the frames themselves.

**Why the outcome nevertheless holds.** At the rate this record's own coalescing licenses, no topology
showed a problem. The arithmetic is this record's: the flush is coalesced so the emitted frame rate per
stream never exceeds what the **20 ms** bottom of `REQ-TOOLS-126`'s range licenses, which is **≤ 50
frames per second per stream**. The spike chose its ladder around that number and measured the relay at
999 frames/s × 4 KiB at **p95 1.514 ms** — inside budget by two orders of magnitude. **So ADR-0044 is
wrong about the mechanism and right about the outcome, and what makes it right is the cap stated here.**

**Three obligations follow, and they are obligations rather than observations.**

1. **The 20 ms coalescing floor may not be relaxed without re-measuring.** It was written as a bound on
   how often a keystroke-armed flush may fire — a display concern. It is now also the input to a
   transport budget. Anything that raises the per-stream emitted rate raises the aggregate rate the
   relay must absorb, and the relay's degradation is steep and non-linear between 4,000 and 12,000
   frames/s.
2. **The aggregate rate must be bounded by something the product actually enforces, and today it is
   not.** The spike bounded its ladder by `REQ-MONITOR-285`'s maximum of 20 agents and flagged in terms
   that it "counts one foreground stream per agent" and that "whether background terminal sessions
   (`REQ-TOOLS-107`) can push the concurrent stream count materially above 20 was not established". It
   is not bounded. `REQ-TOOLS-108` caps concurrent background sessions at
   `runtime.shell_max_background_sessions`, **default 20, minimum 1, and no maximum stated**, and each
   publishes its own `bg:<session_id>` stream (`REQ-TOOLS-127`). At the shipped defaults the concurrent
   stream count is therefore around 40 rather than 20, and it is **user-configurable upward with no
   stated ceiling**. The licensed aggregate is `stream count × 50 frames/s`, and only one of those two
   factors is bounded. **This is a real gap, it is now on the path of a latency requirement, and it is
   raised rather than closed here** — the remedies (a stated maximum on the key, an aggregate rate
   budget across streams, or a genuinely separate transport) are not all architecture's to choose.
3. **The margin is smaller than the figures look, in two directions the spike states.** The harness's
   frame handler "does almost nothing" — it stores the payload in a ring buffer, where a real frame
   drives a VT emulator and a grid paint (this record, ADR-0047) — so the renderer would saturate at a
   *lower* frame rate than measured. And the harness modelled **one window**, while `REQ-MONITOR-243`
   and `REQ-STARTUP-163` allow one session in several windows, which multiplies main's per-message relay
   cost by the window count. The measured pass at the licensed rate is therefore a floor on the cost,
   not a margin to spend.

**What this does not change.** The cap is a property of the product's own rendering path, not of the
benchmark or of any measurement harness. `runtime.terminal_stream_enabled: false` remains the user's
relief valve and `REQ-TOOLS-126` states its cost exactly — the live view, never the command. And
`REQ-TOOLS-127`'s guarantee that streaming changes nothing the agent sees is untouched: the run host
consumes at the sampling period whether or not anyone is attached, and the cap governs what is
*published*, not what is consumed.

**One coupling to OQ-38 that is now worth stating.** The ceiling-plus-flush reading of
`REQ-TOOLS-126` is what produces the ≤ 50 frames/s per stream that has to be capped; under the strict
fixed-period reading the emitted rate would be *lower* at every configured value. So this record's own
reading of that key is what creates the transport pressure, and the flush's coalescing floor is what
contains it. If OQ-38 resolves toward the fixed-period reading, the transport question relaxes and the
echo budget breaks — the trade runs the other way from how it reads in the Decision.
