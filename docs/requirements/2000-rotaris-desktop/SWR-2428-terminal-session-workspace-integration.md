---
req-id: SWR-2428
status: approved
trace: required
test: required
title: "Live terminal preview in the transcript and interactive pop-out"
epic: SWR-2000
date: 2026-08-19
---

# SWR-2428 — Live terminal preview in the transcript and interactive pop-out

When an agent runs a shell command, Rotaris shall show its output *while it
runs* — not only after it finishes — and shall let the user open that same
terminal in a separate window to watch it full-size and type into it.

The terminal belongs to the agent. The user is a guest with the ability to
intervene: answer a prompt, interrupt a runaway command, inspect a dev server.
Intervention is deliberate rather than accidental, because keystrokes injected
into a command the agent is waiting on can desynchronise the agent's reading of
its own result.

There are exactly two display stages: the streaming preview inside the
transcript row, and the pop-out window. Closing the window returns to the
preview, which never stopped streaming.

Both stages call the feature by one name — *terminal* — because a control, a
window title and a keyboard command that name the same thing differently read as
three features.

## Acceptance criteria

- **Streaming preview.** While a `terminal` tool call is running, its transcript
  row renders the tool header, an elapsed clock, and the tail of the live
  terminal screen in a fixed-width font with ANSI colour and text attributes
  applied. The preview updates several times per second and reflects carriage
  returns, screen clears, and cursor addressing — a progress bar redraws in place
  rather than accumulating lines.

- **A live screen belongs to the running row.** The live screen is shown only on
  the row whose command is still running. Once a command finishes, its row
  renders that command's own recorded output and behaves like every other
  finished tool row: a one-line collapsed preview that expands to the
  `INPUT`/`OUTPUT` card (SWR-2417, SWR-2445). One agent's terminal is reused
  across its commands, so a finished row that kept reading the live screen would
  show a later command's output as if it were its own.

- **Preview does not disturb reading.** The preview is bounded to the last rows
  of the screen so a row cannot grow without limit, and it obeys the workspace
  scroll rules: a reader away from the tail keeps their position and is offered
  the existing new-output control.

- **Grouping and auto-collapse.** A running terminal call is never folded into a
  collapsed tool-run group and is never auto-collapsed (SWR-2420); its preview
  and its way into the window stay visible. Finished terminal rows group and
  auto-collapse like any other tool row.

- **Pop-out.** The user can open the terminal window from the running transcript
  row, from a workspace toolbar control that states how many terminals are
  running, and from a keyboard command in the command registry. The toolbar
  control stays available even when no terminal has run yet; the window itself
  explains that state rather than a tooltip on a disabled control. Each open
  stream — the agent's foreground terminal and every background session — is a
  tab in that window.

- **Interactive.** The pop-out renders the full terminal screen with scrollback
  and forwards keystrokes and control sequences to the underlying terminal.
  Text is selectable and copyable, and the scrollback is reachable from the
  keyboard even while input is armed. The window shows the command, run status,
  and the exit code once the command ends.

- **Take control.** Keystrokes are forwarded only after the user explicitly arms
  a take-control action, and the armed state is visible in the control itself,
  not only in its label. While the agent is mid-command and control is armed, a
  persistent inline warning explains that typing can disturb the agent's reading
  of the command result. A key pressed while control is not armed is answered
  with a way to arm it rather than silently discarded. Interrupt and kill
  controls remain available without arming, because those express unambiguous
  intent; killing a process is confirmed first and names what it affects.

- **Unavailable controls explain themselves.** When a process has ended, the
  controls it disables expose the reason through an enabled, keyboard-reachable
  help control (SWR-2124), not through tooltips on disabled controls.

- **Failures are visible.** An interrupt, kill, resize or keystroke the terminal
  refuses is reported in the window rather than looking identical to a
  successful one.

- **User input is user action.** Keystrokes the user types are not agent tool
  calls: they are not matched against the terminal command permission patterns
  (SWR-2502), and they are recorded in the permission audit log (SWR-2506) as
  user-originated terminal input. Typed input is recorded per submitted line
  rather than per keystroke, so a held key cannot flood the audit trail.

- **Replay on open.** Output produced before the preview or the window was
  opened is shown immediately; opening a terminal late never shows a blank
  screen for a command that has already printed.

- **Resize.** Resizing the pop-out window changes the emulated screen size and
  the underlying terminal's window size where the platform supports it.

- **Close and reopen.** Closing the window leaves the command running and the
  preview streaming. Reopening shows the accumulated screen.

- **Ended streams.** When the command ends, the window states that the process
  exited, shows the exit code, and stops accepting input while keeping the
  output readable and copyable.

- **Session focus.** Terminals belong to the focused session. Switching focus
  swaps them; a window the user had open is reopened for the newly focused
  session rather than disappearing without explanation.

- **Session reload.** A session loaded from disk has no live stream; its
  terminal rows render the persisted output, and no surface presents a finished
  command as if it were still running.

- **Opening on demand.** When the preference to open the terminal window
  automatically is on, the window opens when a command *starts*, and does so
  without taking keyboard focus from whatever the user is typing.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Emulated screen resolves carriage returns, colour, clears, and resize so the preview tail and the window show the same state. | `TerminalScreen` model in isolation, no Qt. | `apps/rotaris/tests/test_terminal_screen.py` |
| Integration | Streamed frames reach the transcript preview and the pop-out; typed keys reach the terminal backend; the window announces every control and clears its contrast thresholds. | Bridge ↔ screen ↔ view seam, the key-encoding path, and the pop-out's accessibility surface. | `apps/rotaris/tests/test_terminal_panel.py`, `apps/rotaris/tests/test_terminal_a11y.py` |
| User-flow E2E | A run prints output over several seconds; the user watches it stream in the transcript, opens the terminal window, takes control, types a command, closes the window and sees the preview still live; when the command finishes the row folds back to an ordinary tool row and a later command's output never appears on it. | Public boundary: the real desktop window driven by accessible name, faking only the LLM provider and the terminal backend. | `apps/rotaris/tests/test_terminal_workspace_flow.py` |

## Derived requirements

- [SWR-2429 — Terminal emulator widget](SWR-2429-terminal-emulator-widget.md)
- [SWR-3619 — Desktop terminal stream bridge and emulated screen](SWR-3619-terminal-stream-bridge.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
