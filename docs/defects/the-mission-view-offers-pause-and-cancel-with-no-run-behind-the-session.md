## The Mission view offers Pause and Cancel with no run behind the session

The Mission view decides whether a run is active from the persisted status alone (`runActive = isBusy(status)`), not
from REQ-CHAT-008's recovery condition the Workspace reads (`needsRecovery`, the one liveness predicate). A session a
crash left still claiming `running` therefore offers the run-level selection's Pause — explained as "Pauses the whole
run after its current step." — and the engine refuses it, since no run is behind the session. The same `runActive`
offers "Cancel selection" for any agent that still presents live in that session — one the crash left outside the open
iteration, still stored `running` or `queued` and not settled while the status claims a run — and the engine refuses
that too. The Workspace's composer, on the same session, shows the recovery state and no live-run control.
Noticed while building `PD-ORCH-005` clause 13 (R-064, 2026-09-28), which now presents that session's run-level agent
`paused` in the Mission view (OQ-73) beside a Pause that still reads as available; not repaired. The run's own "Cancel
selection" is no longer offered there: clause 16's build (OQ-74) offers Cancel by `cancelOffered`, which refuses the
run-level agent presenting `paused`, and the view now takes `resting` (`runLevelResting`) from its caller.

## Specs

REQ-MONITOR-274 (pause carries an availability explanation) with `pauseAvailability`'s own "Pause is unavailable because
no active run exists"; REQ-CHAT-008 (a session claiming busy with no local run is in the recovery state, not running).

## Relevant files

- `packages/ui/src/MissionView.tsx` — `runActive`, `pause`, `cancelable`.
- `apps/desktop/src/renderer/main.tsx` — `Mission`, which reads `useNeedsRecovery` for the run-level agent and for
  `resting`, but does not pass it to the view's `runActive`.
- `packages/ui/src/agents.ts` — `pauseAvailability`.
