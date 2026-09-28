## The Mission view offers Pause and Cancel with no run behind the session

The Mission view decided whether a run is active from the persisted status alone (`runActive = isBusy(status)`), not
from REQ-CHAT-008's recovery condition the Workspace reads (`needsRecovery`, the one liveness predicate). A session a
crash left still claiming `running` therefore offered the run-level selection's Pause — explained as "Pauses the whole
run after its current step." — and the engine refused it, since no run is behind the session. The same `runActive`
offered "Cancel selection" for any agent that still presented live in that session — one the crash left outside the open
iteration, still stored `running` or `queued` and not settled while the status claims a run — and the engine refused
that too. The Workspace's composer, on the same session, showed the recovery state and no live-run control.
Noticed while building `PD-ORCH-005` clause 13 (R-064, 2026-09-28), which presents that session's run-level agent
`paused` in the Mission view (OQ-73) beside a Pause that still read as available. The run's own "Cancel selection" was
already withheld there: clause 16's build (OQ-74) offers Cancel by `cancelOffered`, which refuses the run-level agent
presenting `paused`, and the view takes `resting` (`runLevelResting`) from its caller. The run row and the subtitle also
labelled that session "Running" beside the root drawn `paused`, where the Workspace's run header reads "Run needs
recovery" (found by the third review round of the merged revision 4 build).

## Specs

`PD-ORCH-005` clause 13 (a paused agent presents as `paused` on every surface); REQ-MONITOR-274 (the Mission view pauses
the run-level selection) and REQ-MONITOR-273 (a disabled control states its reason), with `pauseAvailability`'s own
"Pause is unavailable because no active run exists"; REQ-CHAT-008 (a session claiming busy with no local run is in the
recovery state, not running).

## Relevant files

- `packages/ui/src/MissionView.tsx` — `runActive`, `pause`, `cancelable`, the run row's and the subtitle's status label.
- `apps/desktop/src/renderer/main.tsx` — `Mission`, which reads `useNeedsRecovery` for `restingView` and the view's
  `recovery`.
- `packages/ui/src/agents.ts` — `pauseAvailability`, `cancelOffered`.
- `packages/ui/src/cancel-paused.test.ts`.

## Repaired — 2026-09-28

By the second and third fix rounds of the merged revision 4 build (R-064). `MissionView` takes a `recovery` prop, which
the Mission root passes from the same `useNeedsRecovery` it hands `restingView`, and reads `runActive` as busy and not in
recovery, as the Workspace does. Pause then states "Pause is unavailable because no active run exists.", and the live
Cancel predicate reads the same `runActive`, so an agent still presenting live offers no Cancel there. In that state the
run row and the subtitle read REQ-CHAT-008's "Run needs recovery" rather than "Running".

Evidence: `packages/ui/src/cancel-paused.test.ts`, "in REQ-CHAT-008's recovery state the Mission view offers no "Pause"
for the run it draws `paused`" (reverting `&& !recovery` turns it red) and "… the Mission view's run row and subtitle
read the recovery label" (reverting the label turns it red). The Mission root's `recovery={needsRecovery}` is
composition-root wiring that only `pnpm app:drive` reaches.
