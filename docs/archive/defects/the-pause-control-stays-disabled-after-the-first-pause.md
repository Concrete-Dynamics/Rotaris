## The Pause control stays disabled after the first pause in a window

`WorkspaceView`'s `pausePending` was set on an accepted pause (the strip button's handler and `/pause`) and never
cleared. After one pause in a window, every later run of any session in that window drew "Pause the run" disabled with
the pending icon, and a click sent nothing. `/pause` still worked, because its path did not check the flag. The code
predates revision 4 (introduced 2026-09-20).

Found 2026-09-28 by the fourteenth review round of the merged revision 4 build of `PD-ORCH-005` (R-065), driving the
built app.

## Specs

REQ-MONITOR-296: `pausing` is shown only after the run accepted the pause. The mark belongs to that run, and nothing
allows it to disable Pause for a later one.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx`: `pausePending` and the Pause strip button.
- `packages/ui/src/composer.ts`: `pausePendingAfter` and `PauseScope`.
- `packages/ui/src/composer.test.ts`: the tests.

## Repaired — 2026-09-28

By the fourteenth fix round of the merged revision 4 build (R-065). The mark is scoped to the session shown and whether
its run is busy. `WorkspaceView` re-derives it during render when that scope changes (`pausePendingAfter`), so the mark
ends when the run that accepted the pause leaves the busy states, or when another session is shown.

Evidence: `composer.test.ts`, "holds while that run stays busy, and ends when it rests, ends, or another session is
shown", red with the mark kept; its source check pins `WorkspaceView`'s use of the rule. In the built app, after one run
was paused, a second session's run showed "Pause the run" enabled (`ph-pause`), and a click paused it.
