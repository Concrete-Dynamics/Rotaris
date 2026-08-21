---
req-id: SWR-3617
status: approved
trace: required
test: required
type: technical
derived-from: SWR-500
title: "Terminal output stream hub"
epic: SWR-500
date: 2026-08-19
---

# SWR-3617 — Terminal output stream hub

Live terminal output (SWR-2428) needs a way out of the engine while a command is
still running. The existing event bus is the wrong carrier: it feeds the JSONL
event stream that headless consumers read, and terminal frames arrive many times
per second — they would drown it.

This requirement introduces a separate, session-keyed hub for terminal frames
with the same late-binding discipline the event bus already uses, so an engine
with no attached UI pays nothing.

## Acceptance criteria

- A frame identifies its stream, carries a monotonically increasing sequence
  number, its payload, the screen size it was produced at, and states whether the
  payload is incremental output or a whole-screen replacement.
- Sinks register and are discarded per session; registering is idempotent per
  session and discarding an unknown session is not an error.
- Publishing to a session with no registered sink is a silent no-op, so the
  headless engine and the existing test suite run unchanged.
- A sink that raises never breaks the command that produced the frame.
- Each stream keeps a bounded buffer of recent frames whose size is configurable;
  when it overflows, the oldest frames are dropped and the buffer records that
  output was dropped.
- A late attacher can replay a stream's buffered frames in order.
- The hub reports the streams open for a session, each with its command, whether
  it is still running, when it started, and its exit code once known.
- Opening and closing a stream are observable, so a display attached to the
  session learns about a terminal it did not ask for.
- The hub is safe to use from several threads at once.

## Test coverage

Unit tests in `tests/unit/test_terminal_stream_hub.py` cover registration and
discard, the no-sink no-op, a raising sink, buffer overflow and drop accounting,
replay ordering for a late attacher, and open-stream reporting.

Derived from: [SWR-500 — Tool Platform & Integrations](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)
