# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — Revisit if

Part 7 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## Revisit if

**Two of the limbs below are spent.** OQ-5 and OQ-38 were ruled on 2026-09-11, and neither resolved the way
this clause anticipated — both ratified this record's reading, one of them narrowed (see the ruling section at
the end). What remains live here is the scrollback limb, the headless-emulator limb and the message-port limb.
The original text stands unaltered:

OQ-5 resolves toward plain text throughout; or OQ-38 resolves toward a strict fixed-period reading of
`runtime.terminal_stream_interval_ms`, which makes `REQ-SHELL-166`'s echo budget unmeetable at
`REQ-TOOLS-126`'s own default and turns the conflict into an escalation about which of the two published
figures moves; or a requirement asks for terminal scrollback to survive a restart, which would make the
emulator's state persistent and change everything above; or the shell slice chooses a renderer whose
emulator cannot be run headless, in which case UI's placement returns as the fallback with its
two-parser risk accepted explicitly. **Or the update channels move to a direct message port**, which
would restore the isolation ADR-0044 claims for one more `MessageChannelMain` and demote this record's
cap back to the display concern it was written as — the spike measured that arrangement holding
transcript p95 at 1.119 ms under 12,000 frames/s. **Or the concurrent-stream count gains a stated
ceiling**, which would let the aggregate rate be computed rather than assumed.
