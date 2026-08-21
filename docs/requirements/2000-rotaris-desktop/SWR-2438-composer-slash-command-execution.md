---
req-id: SWR-2438
status: approved
trace: required
test: required
title: "Composer slash commands execute instead of starting a run"
epic: SWR-2000
date: 2026-08-07
---

# SWR-2438 — Composer slash commands execute instead of starting a run

The Rotaris workspace composer advertises slash commands in its placeholder text
("type / for commands"). Submitting a slash command shall run that command, not
send its literal text to an agent as a prompt.

When the composer's text is a single line that begins with `/`, submitting it
(Enter or the Send button) shall be interpreted as a command invocation rather
than a prompt. The first token after the `/` is the command name; the remainder
of the line is the argument string passed to the command.

## Scope

- **In scope**: `/name`, `/name args…`, and case-insensitive command names.
- **In scope**: `/ ` (slash followed by a space) is an escape — it is a normal
  prompt, so a user can still ask a question that starts with a slash.
- **In scope**: multi-line composer text is always a prompt, even if line 1
  starts with `/`.
- **Out of scope**: slash commands typed into any other input surface (search
  field, todo editor, settings).
- **Out of scope**: sending slash commands to a running agent as steering text.

## Acceptance criteria

- Submitting `/stop` while a run is active cancels the run and starts no new run;
  no `prompt_submitted` intent is emitted.
- Submitting `/model gpt-5` sets the active model to `gpt-5` and starts no run.
- Submitting a recognised command clears the composer.
- Submitting an unrecognised command such as `/nope` starts no run, surfaces a
  persistent inline error naming the command, and **leaves the typed text in the
  composer** so the user can correct it.
- Submitting a command that is currently unavailable (for example `/stop` with no
  active run) starts no run and surfaces the availability reason; the text stays
  in the composer.
- Submitting `/ what does this slash mean?` sends a normal prompt.
- Submitting text whose first line is `/stop` but which has further lines sends a
  normal prompt.
- Prompt history recall (`↑`/`↓`) and Shift+Enter newline insertion behave exactly
  as before when no slash command is being typed.

## Test portfolio

| Level         | Productive scenario                                                                                                        | Exercised boundary                                                                     | Planned/covering test                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit          | Parsing composer text into a command name and arguments, including the `/ ` escape and multi-line rejection                | `parse_slash_input` / registry `execute` return values, unknown and unavailable command | `apps/rotaris/tests/test_slash_commands.py`       |
| Integration   | Workspace view intercepts a submitted slash command, clears the composer on success, preserves the text and reports on error | `WorkspaceView._submit` → command handler vs `prompt_submitted` / `slash_error` signals | `apps/rotaris/tests/test_slash_commands.py`       |
| User-flow E2E | User types `/stop` during a live run and the run cancels; user then types `/nope` and sees an inline error with no run start | Composer keystrokes → main window wiring → run bridge cancel, notice surface            | `apps/rotaris/tests/test_slash_commands_e2e.py`   |

Derived requirements: [SWR-2443 — Framework-free slash command registry](SWR-2443-slash-command-registry.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
