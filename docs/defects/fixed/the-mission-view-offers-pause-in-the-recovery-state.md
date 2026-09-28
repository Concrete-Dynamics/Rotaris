## The Mission view offers "Pause the whole run" in the recovery state, beside a run it draws `paused`

In REQ-CHAT-008's recovery state the persisted status reads busy but no run is under way. The surfaces lane wired that
state into the Mission view through `restingView(session, entry, needsRecovery)`, so the run-level agent presents
`paused` (`PD-ORCH-005` clause 13, OQ-73) and a crash-left child is offered "Cancel selection" (clause 16, OQ-74). The
view's own `runActive` was still `isBusy(executionStatus)` and never read the recovery fact. Selecting the run row
therefore showed Pause enabled, with "Pauses the whole run after its current step.", beside a root drawn `paused`, and
the engine refused the click because no run exists. The Workspace reads `runActive = sessionBusy && !needsRecovery` and
drew no such Pause.

Found 2026-09-28 by the second review round of the merged revision 4 build of `PD-ORCH-005` (R-064).

## Specs

`PD-ORCH-005` clause 13 (a paused agent presents as `paused` on every surface) and REQ-MONITOR-273/276 (Pause is offered
with its availability explanation, and only for an active run); REQ-CHAT-008 (the recovery state has no run).

## Relevant files

- `packages/ui/src/MissionView.tsx`: `runActive`, `pauseAvailability`, `cancelOffered`.
- `apps/desktop/src/renderer/main.tsx`: the Mission root, which reads `useNeedsRecovery`.
- `packages/ui/src/cancel-paused.test.ts`.

## Repaired — 2026-09-28

By the second fix round of the merged revision 4 build (R-064). `MissionView` takes a `recovery` prop, which the
Mission root passes from the same `useNeedsRecovery` it hands `restingView`, and reads `runActive` as busy and not in
recovery, as the Workspace does. Pause then states "Pause is unavailable because no active run exists." and the live
Cancel predicate reads the same `runActive`.

Evidence: `packages/ui/src/cancel-paused.test.ts`, "in REQ-CHAT-008's recovery state the Mission view offers no
"Pause" for the run it draws `paused`": reverting `&& !recovery` turns it red. The Mission root's
`recovery={needsRecovery}` is composition-root wiring that only `pnpm app:drive` reaches.
