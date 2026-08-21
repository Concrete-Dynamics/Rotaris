---
req-id: SWR-3006
status: draft
trace: required
test: required
title: "Sticky prompt header in the chat transcript"
epic: SWR-2000
date: 2026-08-13
---

# SWR-3006 — Sticky prompt header in the chat transcript

When a reader scrolls up in the chat transcript away from the newest output, a header
pinned to the top of the transcript shows the most recent user prompt that has scrolled
above the visible area. The prompt text is clipped to at most three lines, with a
truncation indicator when it is longer. As the reader continues scrolling up past earlier
user prompts, the header updates to show whichever user prompt is now the most recent one
above the viewport. Clicking the header scrolls the transcript so that the shown prompt is
brought back into view. The header is hidden while the reader follows the newest output
(the tail) and when the visible transcript contains no user prompt.

Scope: user-authored prompts only (the reader's own messages). Inline prompt rendering and
the existing jump-to-newest-output behavior are unchanged.

## Acceptance criteria

- Scrolling up so that a user prompt leaves the top of the viewport shows the header with
  that prompt's text.
- The sticky text is clipped to at most three lines and shows a truncation indicator when
  the prompt exceeds three lines.
- Scrolling up past an earlier user prompt replaces the sticky text with that prompt.
- Clicking the header brings the shown prompt's row back into view.
- Scrolling back to the newest output hides the header.
- A transcript with no user prompt never shows the header.
- The header reflects the transcript the reader is currently seeing (the active agent
  filter), not rows hidden by that filter.

## Test portfolio

| Level         | Productive scenario                                                                                                                                                                    | Exercised boundary                                                                                     | Planned/covering test                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Unit          | Given a transcript and a scroll position, the sticky target is the most recent user prompt above the viewport; long prompts clip to three lines with an ellipsis.                      | Prompt-above-viewport selection and three-line clipping, pure and Qt-free.                             | `apps/rotaris/tests/test_transcript.py`     |
| Integration   | Scrolling the transcript updates the sticky header's text and visibility, and activating it scrolls to the shown prompt row.                                                           | Transcript scroll state ↔ sticky header widget wiring.                                                 | `apps/rotaris/tests/test_views.py`          |
| User-flow E2E | A desktop user runs a session, scrolls up past a prompt, sees the sticky header, scrolls past an earlier prompt and sees it update, then clicks the header and returns to that prompt. | Real PySide6 Workspace flow with internal store/service wiring and a fake external agent event source. | `apps/rotaris/tests/test_run_wiring_e2e.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
