## The Mission view's Pause reads "Pausing…" after the session has rested

`MissionView` sets its own `pausePending` when a pause is accepted and never clears it. While the view stays mounted,
its Pause button keeps reading `Pausing…` after the session has come to rest `paused` — beside the subtitle and the run
row that read Paused, and beside the reason "Pause is unavailable because no active run exists." Leaving the view and
coming back remounts it and restores `Pause`. It is the Mission view's copy of the composer defect the merged
revision 4 build repaired
([`fixed/the-pause-control-stays-disabled-after-the-first-pause.md`](fixed/the-pause-control-stays-disabled-after-the-first-pause.md)),
which scoped the composer's mark to the run that accepted the pause (`pausePendingAfter`) and left this one as it was.

Found 2026-09-28 by the built-app drive of the merged revision 4 build of `PD-ORCH-005` (R-064): with the run row
selected, press Pause, stay on the view, wait for `paused`; `[data-testid=mission-pause]` reads `Pausing…`.

## Specs

REQ-MONITOR-296: the Pause control shows its pending mark only after the run accepted the pause, and the mark belongs to
the run that accepted it; REQ-NOTIFY-050's state vocabulary reads `paused` once the run has rested.

## Relevant files

- `packages/ui/src/MissionView.tsx` — `pausePending` (`useState(false)`), set by `requestPause` and never cleared; the
  Pause button's label and `aria-disabled`.
- `packages/ui/src/composer.ts` — `pausePendingAfter`, the rule the composer now applies, which this view could share.
