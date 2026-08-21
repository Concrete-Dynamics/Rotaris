---
req-id: SWR-2429
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2428
title: "Terminal emulator widget"
epic: SWR-2000
date: 2026-08-19
---

# SWR-2429 — Terminal emulator widget

The pop-out terminal (SWR-2428) needs a reusable Rotaris UI primitive that
paints an emulated terminal screen and captures keyboard input. It does not own
the process lifecycle, the stream transport, or the emulator state — it renders
a `TerminalScreen` it is handed and emits what the user typed.

A rich-text editor cannot express cursor addressing or the alternate screen, so
the widget paints a character grid directly.

## Acceptance criteria

- Paints the screen as a monospace character grid: per-cell foreground and
  background colour, bold, italic, underline, and reverse video, plus a block
  cursor at the emulator's cursor position.
- Renders scrollback and lets the user scroll back through it while output
  continues to arrive.
- Reports its size in columns and rows whenever the widget is resized, so the
  host can resize the emulator and the underlying terminal.
- Supports selecting text with the mouse and copying it.
- Encodes key presses into the terminal key vocabulary the backend accepts —
  printable text, `ENTER`, `TAB`, `BS`, `ESC`, arrows, `HOME`, `END`, `PGUP`,
  `PGDN`, and `C-<letter>` control sequences — and emits them for the host to
  forward. It never invents a key the backend has no encoding for.
- Does not emit anything while input is disabled, and says so: a key press the
  widget discards is reported to the host, which decides how to answer it.
- Keeps a keyboard path to the scrollback while input is armed. Paging keys
  belong to the process, so the shifted paging keys and the control-modified
  home/end keys scroll the widget's own history instead.
- Reserves one key for leaving. An armed widget forwards `TAB` to the process,
  so back-tab always moves focus onward instead of being sent; a widget that
  swallowed every key would be a focus trap with no keyboard way out.
- Copies the selection when the copy shortcut is pressed with text selected, and
  otherwise treats the interrupt key as a control sequence.
- Takes every colour from the Rotaris design tokens, including the sixteen ANSI
  colours; no hard-coded values in views.
- Carries an accessible name and keeps its content copyable for debugging.

## Test coverage

Unit tests drive the widget with a constructed `TerminalScreen` and assert the
emitted key encodings, the reported grid size on resize, that no input is
emitted while input is disabled but the rejection is reported, and that the
scrollback keys scroll instead of reaching the process. Integration tests pair
it with the stream bridge in `apps/rotaris/tests/test_terminal_panel.py`.

Derived from: [SWR-2428 — Live terminal preview in the transcript and interactive pop-out](SWR-2428-terminal-session-workspace-integration.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
