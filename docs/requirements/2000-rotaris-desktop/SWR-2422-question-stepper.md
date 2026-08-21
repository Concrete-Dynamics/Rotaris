---
req-id: SWR-2422
status: approved
trace: required
test: required
title: "Question Stepper Widget"
epic: SWR-2000
date: 2026-07-28
---

# SWR-2422 — Question Stepper Widget

A modal `QuestionStepper` dialog renders the structured question steps sent by
the `ask_questions` tool.  The user navigates between steps, selects from
pre-defined options or types freeform answers, and submits all answers at once.

The widget comprises:

- **Step indicator** — horizontal pill row showing step numbers. Active step =
  accent bg, completed = run bg, inactive = chrome bg.
- **Current step body** — card-like frame with bold title and dim description.
- **Option list** — vertical list of clickable selection cards (single-select).
  Selected card shows accent border.
- **Freeform input** — `QTextEdit` shown when no option is selected and
  `allow_freeform=True`. Placeholder: "Or type your own answer...".
- **Navigation bar** — Back (disabled on first step), Next (disabled until step
  has an answer), Submit (replaces Next on last step).
- **Signals** — `answers_submitted(Signal)` emits `QuestionAnswers`; `cancelled`
  emits on Escape/close.

The widget opens as a modal `QDialog` triggered by clicking a
`rotaris-questions:{row}` anchor in a `kind="question_stepper"` transcript
row.  This preserves the virtual-transcript performance constraint (SWR-2078).

All colors reference `theme.py` tokens.  No hex values are hard-coded.

## Acceptance criteria

- Steps render in order with proper active/completed/inactive pill styling.
- Selecting an option highlights it; selecting a different option deselects the
  prior one.
- Freeform input appears only when `allow_freeform=True` and no option is
  selected.
- Back navigates to the previous step preserving the previously entered answer.
- Next is disabled until the current step has at least an option selection or
  non-whitespace freeform text.
- Submit emits `answers_submitted` with all step answers; then the modal closes.
- Escape on step 0 emits `cancelled`; Escape on later steps navigates back.
- Closing the modal via window-close (X) emits `cancelled` once and immediately
  releases the exact waiting tool call.
- Answer delivery failure remains visible in the modal so the user is not told
  submission succeeded when no waiter received it.
- All colors come from `theme.py`; no hex values in widget code.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | User can select, type, navigate, submit, and cancel without duplicate signals | `QuestionStepper` widget | `apps/rotaris/tests/test_views.py` |
| Integration | Pending projection creates one stable transcript trigger without poll churn | Session projection and `WorkspaceStore` | `apps/rotaris/tests/test_services.py` |
| User-flow E2E | User opens visible prompt, chooses an answer, and submits it | Real PySide6 transcript, modal, bridge | `apps/rotaris/tests/test_main_window.py::test_user_answers_exact_waiting_agent_through_rotaris` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
