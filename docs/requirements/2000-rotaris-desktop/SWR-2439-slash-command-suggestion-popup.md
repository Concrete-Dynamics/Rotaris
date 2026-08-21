---
req-id: SWR-2439
status: approved
trace: required
test: required
title: "Slash command suggestion popup in the composer"
epic: SWR-2000
date: 2026-08-07
---

# SWR-2439 — Slash command suggestion popup in the composer

Typing `/` in the workspace composer shall open a suggestion list of available
commands directly above the composer, and shall narrow that list as the user
keeps typing. Without it the advertised slash commands are undiscoverable — the
user has no way to learn which commands exist.

## Scope

- **In scope**: the popup opens on `/` at the start of a single-line composer,
  filters on every keystroke, and closes when the text stops being a slash
  command, when a command is accepted, on `Escape`, or when the composer loses
  focus.
- **In scope**: ranking is prefix-first — commands whose name starts with the
  typed text come before commands that merely contain it, which come before
  commands matched only through their description. Ties keep registration order.
- **In scope**: each row shows the command name, its description, and its kind
  (`action` or `skill`); commands taking arguments show their argument hint.
- **In scope**: unavailable commands remain listed but are rendered as
  unavailable and carry their reason as a tooltip, per SWR-2124.
- **In scope**: the popup does not take keyboard focus — typing continues
  uninterrupted in the composer.
- **Out of scope**: fuzzy or abbreviation matching.
- **Out of scope**: mouse-hover previews of command effects.

## Acceptance criteria

- Typing `/` alone lists every registered command.
- Typing `/st` lists only commands matching `st`, with prefix matches such as
  `/stash` and `/stop` ahead of description-only matches.
- Typing text that matches no command closes the popup.
- The popup never exceeds the composer width and stays inside the workspace at
  the `1000×680` minimum window size.
- The composer keeps keyboard focus the whole time the popup is visible.
- Unavailable commands are visibly distinct and expose their reason.
- The popup closes without altering the composer text when `Escape` is pressed.

## Test portfolio

| Level         | Productive scenario                                                                                     | Exercised boundary                                                                | Planned/covering test                           |
| ------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| Unit          | Prefix-first ranking, description fallback, empty filter listing everything, no-match returning nothing | `SlashCommandRegistry.match` ordering and membership                              | `apps/rotaris/tests/test_slash_commands.py`     |
| Integration   | Typing into the real composer shows, filters, and hides the popup while focus stays in the composer     | `PromptComposer` text changes → popup visibility, row contents, focus ownership   | `apps/rotaris/tests/test_slash_commands.py`     |
| User-flow E2E | User discovers commands by typing `/`, narrows to `/st`, and reads the description before choosing      | Keystrokes through the workspace view → visible suggestion rows                   | `apps/rotaris/tests/test_slash_commands_e2e.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
