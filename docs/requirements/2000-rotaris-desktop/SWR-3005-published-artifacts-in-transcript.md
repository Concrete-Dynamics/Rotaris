---
req-id: SWR-3005
status: draft
trace: required
test: required
title: "Persona-published artifacts in the chat transcript"
epic: SWR-2000
date: 2026-08-13
---

# SWR-3005 — Persona-published artifacts in the chat transcript

When a persona publishes an artifact during a session, the chat transcript (the Workspace
transcript) shall show a dedicated row for that artifact containing a clickable hyperlink to
the artifact. The published body shall also be rendered inline in that row, clipped to the
first 10 lines with a fading gradient toward the cutoff, so the row reads as a teaser.
Activating either the hyperlink or the clipped body shall open the artifact dialog for that
artifact.

A three-way display setting shall control how much of a published artifact's body the
transcript renders:

- **Partial** (default): the first N lines of the body, then a fading gradient cutoff.
- **Hidden**: the row shows only the hyperlink; no body is rendered.
- **Full**: the entire body is rendered in the row.

A second, numeric setting shall set the partial-mode line count N, defaulting to 10 lines.
Both settings shall apply to artifact rows already present in the transcript when they
change, without reloading the session, and shall persist across app restarts.

Scope: this requirement covers artifacts a persona deliberately publishes (the `artifact_write`
tool). Auto-generated child-agent terminal reports are out of scope and remain as they are
today.

## Acceptance criteria

- A persona-published artifact produces exactly one transcript row.
- The row contains a hyperlink; activating it opens the artifact dialog for that artifact.
- In partial mode, the inline body is clipped to the first N lines and fades out; activating
  the clipped body opens the artifact dialog.
- In hidden mode, the row shows only the hyperlink and no body.
- In full mode, the entire body is rendered in the row.
- N is configurable and defaults to 10 lines.
- Changing either setting re-renders existing artifact rows without reloading the session.
- Both settings persist across app restarts.
- The artifact row follows the transcript's existing agent filter, search, selection, and copy
  behavior.

## Implementation notes

- "Lines" for the partial-mode clip means the artifact body's source lines — the raw Markdown
  as stored on the artifact, not the rendered rich-text line count.
- The numeric line count N shares the existing desktop display-setting persistence pattern
  (QSettings alongside `autoCollapseTools` / `groupToolCalls`).

## Test portfolio

| Level         | Productive scenario                                                                                                                                                                                        | Exercised boundary                                                                                     | Planned/covering test                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Unit          | A user reads a published artifact row; partial mode clips to N source lines with a fade, hidden mode shows only the link, and full mode shows the whole body.                                              | Transcript row projection and Qt rich-text rendering of the artifact row.                              | `apps/rotaris/tests/test_views.py`          |
| Integration   | A published artifact projects to exactly one transcript row carrying the artifact id, the three display modes resolve correctly from the persisted setting, and N is read from the persisted setting.      | Session projection, config service, and the persisted display settings.                                | `apps/rotaris/tests/test_services.py`       |
| User-flow E2E | A desktop user runs a session, a persona publishes an artifact, sees the hyperlink plus partial body, opens the artifact dialog by activating either, then toggles full/hidden and sees the row re-render. | Real PySide6 Workspace flow with internal store/service wiring and a fake external agent event source. | `apps/rotaris/tests/test_run_wiring_e2e.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
