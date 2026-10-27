# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — Consequences accepted

Part 6 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## Consequences accepted

1. The run host pays for one emulator per live stream, and it keeps consuming while nobody watches,
   because `REQ-TOOLS-127` requires the observation to be identical whether or not anyone is attached.
   `REQ-SHELL-151`'s zero-work rule applies to **surfaces**, not to retention.
2. **A conflict between two live requirements, settled above by re-reading a configured key.**
   `REQ-TOOLS-126` calls `runtime.terminal_stream_interval_ms` the output sampling period and defaults it
   to 100 ms. `REQ-SHELL-166` requires the character a keystroke produces to be visible within
   `REQ-SHELL-150`'s 100 ms gesture budget, measured key press to painted frame, and the path crosses two
   process hops and a paint. Read as a fixed period, the default alone spends the entire budget in the
   worst case and half of it on average, before either hop is counted; the budget is unmeetable at the
   specified default and at every larger value the specified range permits. Neither requirement notices
   the other. **The ceiling-plus-flush reading is a reading of `REQ-TOOLS-126`, not a fact**, and it is
   observable to a user who sets that key — under a strict fixed-period reading a configured 2000 would
   withhold that user's own echo for two seconds, and under this one it does not. Raised as a
   specification question (OQ-38) rather than absorbed here.
3. Two emulator instances per visible stream — one authoritative, one displaying — with a golden-stream
   equality test as the evidence for `REQ-SHELL-102`.
4. **This record now owes a budget to another domain.** A change to the coalescing floor, or to how many
   streams may publish at once, is a change to whether `REQ-MONITOR-222` holds — which is not a fact a
   reader of a terminal-rendering record would expect and is why it is stated in its own section rather
   than in a bullet. The dependency runs the wrong way round the record's own subject matter and should
   be read as a symptom of the relay topology, not as a property of terminals.
5. **A degradation that no counter catches.** The spike's collapse case delivered every one of 586,960
   frames with nothing dropped and nothing reordered; the relay fails into unbounded latency, not into
   loss. So the sequence discipline of `REQ-SHELL-104` and `REQ-SHELL-105` stays perfectly satisfied
   while the surface goes stale, and a gap counter would never fire. Whatever diagnostics watches this
   must watch a **rate and a queue depth**, not a gap (ADR-0052).
