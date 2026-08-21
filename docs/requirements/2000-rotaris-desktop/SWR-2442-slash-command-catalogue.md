---
req-id: SWR-2442
status: approved
trace: required
test: required
title: "Slash command catalogue covers palette actions, run control, and skills"
epic: SWR-2000
date: 2026-08-07
---

# SWR-2442 — Slash command catalogue covers palette actions, run control, and skills

The suggestion popup is only useful if it lists commands worth running. Rotaris
shall populate its slash catalogue from what the application already knows,
rather than maintaining a second hand-written list that drifts from the command
palette.

## Scope

- **In scope**: every entry of the existing `CommandRegistry` (SWR-2030) is
  mirrored into the slash catalogue, so the command palette and slash commands
  never disagree about what exists.
- **In scope**: run-control commands that map onto existing main-window
  behaviour — stopping, pausing, compressing context, clearing the transcript,
  starting a new session, resuming a session, searching the transcript, creating
  a worktree, stashing and popping prompts.
- **In scope**: argument-taking commands `/model <name>` and `/persona <name>`,
  validated against the store's model catalogue and persona list.
- **In scope**: every discovered skill that the user may invoke becomes a
  command; skills configured as automatic-only are not offered.
- **In scope**: commands declare availability and a reason, so unavailable ones
  can be shown with an explanation instead of failing silently (SWR-2124).
- **In scope**: the catalogue is rebuilt when settings change, so a rescanned
  skill list is reflected without restarting Rotaris.
- **Out of scope**: file-based custom prompt commands (`~/.codex/prompts`), which
  remain TUI-only for now (SWR-1186).
- **Out of scope**: user-defined command aliases.

## Acceptance criteria

- Every command registered in the command palette is invocable by typing its id
  as a slash command.
- `/stop`, `/pause`, `/compress`, `/clear`, `/new`, `/resume`, `/search`,
  `/worktree`, `/stash`, and `/pop` invoke the corresponding existing main-window
  behaviour.
- `/model <name>` with a name from the model catalogue changes the active model;
  an unknown name reports the error and changes nothing.
- `/persona <name>` with a known persona sets the session persona override; an
  unknown name reports the error and changes nothing.
- `/model` and `/persona` with no argument report their usage instead of applying
  an empty value.
- A discovered user-invocable skill appears as `/<skill-name>`; invoking it loads
  that skill's content for the next prompt.
- A skill whose invocation mode is automatic-only is absent from the catalogue.
- `/stop` and `/pause` report themselves unavailable, with a reason, when no run
  is active; `/clear` and `/search` do so when the transcript is empty.
- After skills are rescanned in Settings, the catalogue reflects the new list.

## Test portfolio

| Level         | Productive scenario                                                                                                 | Exercised boundary                                                              | Planned/covering test                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit          | Building the catalogue from a command registry, a store's skills, and availability predicates over run/transcript state | Catalogue membership, skill filtering by invocation mode, availability reasons   | `apps/rotaris/tests/test_slash_commands.py`       |
| Integration   | Invoking catalogue commands on a wired main window changes model, persona, run, and transcript state                  | Main-window slash registry → existing run-control and store mutations           | `apps/rotaris/tests/test_slash_commands.py`       |
| User-flow E2E | User switches model with `/model`, loads a skill with `/<skill>`, and sees `/stop` explained as unavailable when idle | Composer → catalogue → store/run-bridge effects visible in the workspace        | `apps/rotaris/tests/test_slash_commands_e2e.py`   |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
