---
req-id: SWR-2441
status: approved
trace: required
test: required
title: "Slash popup keyboard navigation takes precedence over history recall"
epic: SWR-2000
date: 2026-08-07
---

# SWR-2441 — Slash popup keyboard navigation takes precedence over history recall

The composer already binds `↑`/`↓` to prompt history recall (SWR-2003). While the
slash suggestion popup is open those keys must navigate the suggestion list
instead, otherwise choosing a command replaces the half-typed command with an old
prompt and the feature is unusable from the keyboard.

## Scope

- **In scope**: while the popup is visible, `↑`/`↓` move the selection, `Tab` and
  `Enter` accept the selected command, and `Escape` closes the popup.
- **In scope**: accepting a command inserts `/name ` into the composer and leaves
  the caret at the end so arguments can be typed. Accepting never submits by
  itself.
- **In scope**: `Enter` when the composer already holds exactly the selected
  command's name submits instead of completing — re-inserting the identical text
  would cost the user a keystroke for nothing. `Tab` always completes.
- **In scope**: selection wraps at neither end — it clamps at the first and last
  row.
- **Out of scope**: mouse selection semantics (covered by SWR-2439).
- **Out of scope**: changing any binding when the popup is not visible.

## Acceptance criteria

- With the popup open, `↓` moves to the next suggestion and does not change the
  composer text.
- With the popup open, `↑` on the first row keeps the first row selected and does
  **not** recall a prompt from history.
- With the popup closed, `↑`/`↓` recall prompt history exactly as before.
- `Tab` with the popup open completes the composer text to `/<name> ` and closes
  the popup; no run starts.
- `Enter` with the popup open on a partially typed name completes the selected
  command rather than submitting the partial text.
- `Enter` with the popup open on a fully typed name (`/stop` with `stop`
  selected) submits it, and does not require a second `Enter`.
- `Enter` with the popup closed submits, as before.
- `Escape` closes the popup and leaves the composer text untouched.
- Shift+Enter inserts a newline in every case and closes the popup, because
  multi-line text is never a command.

## Test portfolio

| Level         | Productive scenario                                                                                        | Exercised boundary                                                             | Planned/covering test                             |
| ------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit          | Selection index movement clamps at both ends and reports the currently selected command                     | `SlashCommandPopup.move_selection` / `current` over empty and populated lists   | `apps/rotaris/tests/test_slash_commands.py`       |
| Integration   | Key events on the real composer route to the popup while it is open and to history recall while it is closed | `PromptComposer.keyPressEvent` precedence, completion insertion, no submission  | `apps/rotaris/tests/test_slash_commands.py`       |
| User-flow E2E | User types `/`, arrows to a command, presses Tab to complete it, then presses Enter to run it               | Keyboard-only path from an empty composer to an executed command                | `apps/rotaris/tests/test_slash_commands_e2e.py`   |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
