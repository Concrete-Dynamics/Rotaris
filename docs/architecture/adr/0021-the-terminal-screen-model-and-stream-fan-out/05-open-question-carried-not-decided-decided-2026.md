# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — Open question carried, not decided — decided 2026-09-11; kept as written, see the ruling section below

Part 5 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## Open question carried, not decided — decided 2026-09-11; kept as written, see the ruling section below

`REQ-TOOLS-127`'s closing frame must carry "text equal to the observation's final output text", which
is plain, 100,000-character-capped, oldest-first-truncated text — **not VT**. EXEC proposed emitting
the closing frame as a `screen` frame whose payload is that plain text with an explicit marker that it
is a literal replacement, so a display resets its screen and writes it verbatim. That satisfies the
letter of `REQ-TOOLS-127` while keeping every earlier frame VT-faithful, and it is harmless because the
process has ended. **It is a reading, not a fact.** The alternative reading is that the specification
intends plain text throughout, which would contradict `REQ-SHELL-095` and `REQ-SHELL-166`. See OQ-5.
