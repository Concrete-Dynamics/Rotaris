## A quit denies the approval it should withdraw

A user who quit while an approval dialog was open had the waiting call recorded as denied. The result read "Permission
denied by rule 'preset:ask' … Denied because the user denied the request". The agent then took one more model step on
the denial before the shutdown reached the run. The main window's close takes its modal approval dialog with it, and
REQ-TOOLS-063's rule, "closing the window answers Deny", sent the Deny at once. The run host's shutdown request, which
withdraws a pending approval by the quit, only goes out after every window has closed.

Found 2026-09-27 by building PD-ORCH-005. In the phase 7 rehearsal the built app was quit by closing its window while
the root's `delegate` waited on an approval. The session came to rest as a quit should (paused, iteration open, `quit`),
but with the call denied. The driver's immediate exit denied it the same way.

## Specs

`PD-ORCH-005` clause 9: an approval pending when the run comes to rest "by a pause, a stop, a quit or a crash" is
withdrawn, "never recorded as denied". REQ-TOOLS-063 still governs a dialog the user closes.

The question dock does the same with a question. Its `beforeunload` sends REQ-CHAT-101's cancellation, which reaches
the run host before the shutdown and is recorded as "Questions were cancelled."

## Relevant files

- `apps/desktop/src/main/index.ts` — the approval dialog's `closed` handler, `exitCleanly`, and `before-quit`.
- `apps/desktop/src/main/main-windows.ts` — the main window's close guard (`guardClose`).
- `apps/desktop/src/main/exit.ts` — `QuitState` and `dialogCloseAnswersDeny`.
- `apps/desktop/src/main/commands/session.ts` — the `cancelQuestions` control.
- `packages/ui/src/QuestionStepper.tsx` — the dock's `beforeunload` cancellation.

## Repaired — 2026-09-27

By PD-ORCH-005's phase 7.
- Main tells the quit apart through `QuitState`: the process exiting at once (`exitCleanly`), or every main window's
  close confirmed by its guard (`guardClose` reports the confirmation before it closes).
- While the quit is under way, an approval dialog that closes unanswered sends no Deny, and the dock's cancellation is
  not forwarded. The run host's shutdown withdraws both by the quit.
- While the application stays, the user closing a dialog or one main window of several, REQ-TOOLS-063 and
  REQ-CHAT-101 govern as before.
- A quit Electron starts on its own account (SIGTERM, the desktop's logout, `app.quit()`) would close every window at
  once, a dialog ahead of its window's guard. `before-quit` now closes the main windows through their guards, all or
  none (`closeThroughGuards`). Every guard is asked, every close is confirmed, and only then does any window close.

The first repair covered the window close only. Phase 7's review found the `app.quit()` path and the dock, and the
second repair covered both. The second review then found two main windows whose guards answered at different times:
the faster window's dialog closed while the other still stayed. The third repair asks every guard before any window
closes. OQ-96 records the departure from REQ-TOOLS-063 and REQ-CHAT-101.

Evidence:
- `exit.test.ts`: `QuitState` and the dialog rule.
- `main-windows.test.ts`: the guard reports a confirmed close before closing, and never a refused one. Asking it
  closes nothing.
- `exit.test.ts`, `closeThroughGuards`: two windows whose guards answer at different times are both confirmed before
  either closes, and a refusal closes neither. Two windows were not driven in the built app.
- `commands/session.test.ts`: the dock's cancellation is dropped while quitting, and forwarded otherwise.
- The built app: see PD-ORCH-005's first-execution record, which drove a window-close quit, a SIGTERM quit and a quit
  with a question open.

Residual: a window whose confirmed close never completes stays counted as closing, so a dialog it later closes sends
no Deny. The approval then waits with nothing on screen. This needs a renderer that hangs in `beforeunload`, and it is
not repaired. [`an-approval-asked-after-the-last-window-closes-is-denied.md`](../an-approval-asked-after-the-last-window-closes-is-denied.md)
is the same class of defect, on a path this repair does not reach.
