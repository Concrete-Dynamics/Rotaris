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

## Relevant files

- `apps/desktop/src/main/index.ts` — the approval dialog's `closed` handler, and `exitCleanly`.
- `apps/desktop/src/main/main-windows.ts` — the main window's confirmed close.
- `apps/desktop/src/main/exit.ts` — `dialogCloseAnswersDeny`.

## Repaired — 2026-09-27

By PD-ORCH-005's phase 7. A dialog that closes unanswered answers Deny only while the application stays. That covers
the user closing the dialog, and one main window of several closing. A dialog closed by the quit answers nothing. The
quit means the process exiting at once (`exitCleanly`), or every main window's close confirmed; the Electron adapter now
reports each confirmed close. The run host's shutdown then withdraws the approval by the quit.

Evidence: `exit.test.ts`, "PD-ORCH-005 clause 9…", covers the three cases. The built app is quit by closing its window
with an approval pending; its evidence is in PD-ORCH-005's first-execution record.
