---
req-id: SWR-3619
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2428
title: "Desktop terminal stream bridge and emulated screen"
epic: SWR-2000
date: 2026-08-19
---

# SWR-3619 — Desktop terminal stream bridge and emulated screen

The live terminal (SWR-2428) needs two supporting pieces on the desktop side: a
framework-free emulator state that both display stages read, and a bridge that
carries frames from the engine's stream hub onto the Qt thread.

One emulated screen per stream is what makes the two stages consistent — the
transcript preview is the last rows of the very screen the pop-out paints in
full, so they can never disagree.

## Acceptance criteria

- `TerminalScreen` holds the emulator state for one stream: it consumes both
  incremental output and whole-screen replacement frames, resolves control
  sequences, exposes the visible grid, the scrollback, the cursor position, and
  a revision counter that changes whenever the screen changes.
- `TerminalScreen` imports no UI framework, so it is testable without a running
  application.
- The revision counter is what invalidates cached transcript rendering; a screen
  that changed always re-renders and a screen that did not never does.
- `TerminalScreen` can be resized, and resizing preserves content already on the
  screen as far as the emulator allows.
- The bridge registers one sink with the engine's stream hub for the session it
  follows, and discards it when the run ends or the session loses focus.
- The sink runs on the engine's thread and never touches UI state directly; it
  hands frames over a queued signal, in the same discipline the session observer
  already follows.
- The bridge replays a stream's buffered history when a display stage attaches
  to it late.
- The bridge exposes the open streams with their command, running state, and
  exit code, and reports when a stream opens and closes.
- Keystrokes and control sequences handed to the bridge are forwarded to the
  engine-side stream, and are dropped without error when the stream has ended.

## Test coverage

Unit tests construct a `TerminalScreen` directly and assert emulation, revision
behaviour, and resize. Integration tests in
`apps/rotaris/tests/test_terminal_panel.py` drive the bridge against a fake hub
and assert frames reach the screen, replay works on late attach, and typed keys
reach the stream.

Derived from: [SWR-2428 — Live terminal preview in the transcript and interactive pop-out](SWR-2428-terminal-session-workspace-integration.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
