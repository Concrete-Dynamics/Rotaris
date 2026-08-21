---
req-id: SWR-2440
status: approved
trace: required
test: required
title: "Composer highlights whether a typed slash command matches"
epic: SWR-2000
date: 2026-08-07
---

# SWR-2440 — Composer highlights whether a typed slash command matches

While a user types a slash command, the composer shall colour the command token
so the user can tell — before submitting — whether it resolves to a real command.
Today the text is uniform, so a typo is only discovered after it has been sent to
an agent as a prompt.

## Scope

- **In scope**: three visually distinct states for the leading `/name` token —
  resolved (an exact registered command), partial (a prefix of at least one
  command), and unknown (matches nothing).
- **In scope**: the argument portion after the command name is rendered as
  secondary text so the command name stands out.
- **In scope**: all colours come from `rotaris.theme` tokens and clear the
  project's `MIN_TEXT_CONTRAST` floor against the composer ground.
- **Out of scope**: highlighting inside prompts that merely contain a slash.
- **Out of scope**: highlighting argument values against a command's expected
  argument type.

## Acceptance criteria

- `/stop` (registered) renders the token in the resolved style.
- `/sto` (prefix of `/stop`) renders the token in the partial style, distinct
  from both other states.
- `/zzz` (no match) renders the token in the unknown style.
- Typing the fourth character of `/stop` moves the token from partial to resolved
  without the user submitting anything.
- `/model gpt-5` renders `/model` in the resolved style and ` gpt-5` in the
  secondary style.
- `/ hello` and multi-line text receive no command highlighting at all.
- Every colour used clears `theme.MIN_TEXT_CONTRAST` against `theme.BG`.

## Test portfolio

| Level         | Productive scenario                                                                                     | Exercised boundary                                                        | Planned/covering test                             |
| ------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------- |
| Unit          | Classifying a typed token as resolved, partial, or unknown, and splitting name from arguments           | `classify_slash_token` over registered names, prefixes, misses, escapes   | `apps/rotaris/tests/test_slash_commands.py`       |
| Integration   | The highlighter applies the matching character format to the composer document as characters are typed  | `SlashHighlighter` formats on `QTextDocument`, contrast of each token colour | `apps/rotaris/tests/test_slash_commands.py`       |
| User-flow E2E | User mistypes `/stpo`, sees it flagged as unknown, corrects it to `/stop` and sees it confirmed         | Composer keystrokes → visible character formats                           | `apps/rotaris/tests/test_slash_commands_e2e.py`   |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
