## The Mission view's Pause reads "Pausing…" after the session has rested

`MissionView` sets its own `pausePending` when a pause is accepted and never clears it. While the view stays mounted,
its Pause button keeps reading `Pausing…` after the session has come to rest `paused` — beside the subtitle and the run
row that read Paused, and beside the reason "Pause is unavailable because no active run exists." Leaving the view and
coming back remounts it and restores `Pause`. It is the Mission view's copy of the composer defect the merged
revision 4 build repaired
([`the-pause-control-stays-disabled-after-the-first-pause.md`](the-pause-control-stays-disabled-after-the-first-pause.md)),
which scoped the composer's mark to the run that accepted the pause (`pausePendingAfter`) and left this one as it was.

Found 2026-09-28 by the built-app drive of the merged revision 4 build of `PD-ORCH-005` (R-065): with the run row
selected, press Pause, stay on the view, wait for `paused`; `[data-testid=mission-pause]` reads `Pausing…`.

## Specs

REQ-MONITOR-296: the Pause control shows its pending mark only after the run accepted the pause, and the mark belongs to
the run that accepted it; REQ-NOTIFY-050's state vocabulary reads `paused` once the run has rested.

## Relevant files

- `packages/ui/src/MissionView.tsx` — `pausePending` (`useState(false)`), set by `requestPause` and never cleared; the
  Pause button's label and `aria-disabled`.
- `packages/ui/src/composer.ts` — `pausePendingAfter`, the rule the composer now applies, which this view could share.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. `MissionView` now scopes its mark to the run that accepted the pause, as the composer
does: it derives the scope `{ sessionId, busy }` during render, busy being REQ-NOTIFY-050's, and clears `pausePending`
through `pausePendingAfter` (`composer.ts`) whenever that scope changes. The mark ends when the run leaves the busy states,
paused or ended first, or when another session is shown. The view's Pause then reads `Pause` beside the subtitle's
Paused, and a later run of the session starts with Pause offered.

Confirmed before the repair in the built app. `mission-proof`'s third launch gained an end probe of the still-mounted
view. On `origin/main` 0b133d9 it failed with `the Pause control at rest read "Pausing…" (data-enabled=0) beside "Pause
is unavailable because no active run exists."`, and with the repair it passes with `pauseAtRest: "Pause"` and
`subtitleAtRest: "delegation tree · pause me · Paused"`.

The unit pin is `packages/ui/src/MissionView.test.ts`, "clears the mark through the composer's rule whenever the scope
changes". It pins the view's source, as `composer.test.ts` pins the Workspace's, since vitest has no DOM, and it is red
on the unrepaired view.
