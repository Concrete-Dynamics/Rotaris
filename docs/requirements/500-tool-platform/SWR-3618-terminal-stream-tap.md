---
req-id: SWR-3618
status: approved
trace: required
test: required
type: technical
derived-from: SWR-500
title: "Per-backend terminal stream tap"
epic: SWR-500
date: 2026-08-19
---

# SWR-3618 — Per-backend terminal stream tap

The hardened terminal runs on three different backends — a tmux pane, a POSIX
pseudo-terminal, and a PowerShell process — and only one of them exposes a raw
byte stream. Publishing live output (SWR-3617) therefore needs a per-backend
adapter that samples whichever backend is in use and normalises what it finds
into frames, plus the input and resize paths the pop-out terminal needs.

Sampling must never change what the agent observes: the tap only reads, and a
tap that fails degrades to no streaming rather than failing the command.

## Acceptance criteria

- A tap is chosen from the live terminal backend. An unrecognised backend falls
  back to reading the visible screen rather than failing.
- A backend that exposes accumulated output publishes only what is new since the
  previous sample, as incremental output.
- A backend that can only be screen-scraped publishes whole-screen replacements,
  and publishes nothing while the screen is unchanged.
- Sampling runs on its own thread at a configurable interval and stops when the
  command ends, when the tap is closed, or when the engine shuts down.
- Streaming can be disabled by configuration, in which case no sampling thread is
  started at all.
- Any failure inside the tap is logged and stops streaming for that stream only;
  the command's own result is unaffected.
- The tap forwards text and named keys to the backend, serialised so concurrent
  senders cannot interleave a single key sequence.
- The tap resizes the backend's terminal where the platform supports it, and is a
  no-op where it does not.
- Foreground commands and background terminal sessions both publish, and their
  streams are distinguishable by identifier.
- A stream's exit code is published when its command ends.

## Test coverage

Unit tests in `tests/unit/test_terminal_tap.py` drive each tap variant with a
fake backend: incremental output, unchanged-screen suppression, fallback
selection, disabled streaming, a raising backend, and key forwarding. An
integration test in `tests/integration/test_terminal_streaming.py` runs a real
command through the hardened terminal executor and asserts frames are published
before the command's observation is returned.

Derived from: [SWR-500 — Tool Platform & Integrations](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)
