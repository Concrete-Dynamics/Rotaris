# ADR-0010 — Three channels between the run host and its surfaces — Revisit if

Part 5 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## Revisit if

Measurement in the real renderer, or with several windows, or with concurrent runs publishing, shows the
double hop threatening `REQ-MONITOR-222` or `REQ-MONITOR-223` — the remedy is then alternative F, with a
second port for terminal frames, and it is already measured. Or the whole-session update at the maximum
supported agent count with full bounded collections proves too expensive at the rate `REQ-MONITOR-217`
forces — the answer is then field-level diffing of that same payload, not folding it into the event
stream. Or ADR-0021's coalescing cap is relaxed, or `REQ-TOOLS-107`'s background sessions are shown to
raise the concurrent stream count materially, in which case the terminal channel needs a real transport
of its own before it needs anything else. Or OQ-42 is answered against continuing publication, in which
case consequence 7 becomes a decision to withhold and `REQ-MONITOR-218`'s no-delay-floor rule must be
reconciled with it explicitly.
