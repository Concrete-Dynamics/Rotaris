## Every "Cancel the run?" sends the stop, and the stop asks "Cancel the run?"

The composer's stop control opened REQ-MONITOR-126's confirmation, "Cancel the run? Cancellation cannot be undone in
this session", and on confirmation sent the stop (the `cancel` operation). The inspector's run-level cancel, the Mission
view's run row and the wait header's "Cancel the run" sent the stop too. Before PD-ORCH-005 the stop and the cancel ended
the same way, so the conflation cost nothing. Under clause 3 a stop comes to rest, and every agent is left `paused` and
resumable. So a user who confirmed "cannot be undone" got a run that the next continue resumed. The final cancel, which
the engine keeps behind the reserved run id, was reachable from no surface.

Found 2026-09-27 by building PD-ORCH-005. The built-app rehearsal for phase 7 pressed "Stop run" and was shown the cancel
confirmation.

## Specs

`PD-ORCH-005` clause 3: "The cancel control (REQ-MONITOR-126, 'cannot be undone in this session') … end[s] their agents
`cancelled` as today, and those are never resumed". Also REQ-MONITOR-126 and REQ-MONITOR-009 against REQ-SESSION-186,
which describe two controls.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — the stop control, the inspector's cancel, the wait header, and the dialogs.
- `packages/ui/src/MissionView.tsx` and `packages/ui/src/ConfirmDialog.tsx` — the run row's confirmation and its text.
- `apps/desktop/src/renderer/session-actions.ts` — `stopRun` and the new `cancelRun`.
- `apps/desktop/src/renderer/main.tsx` and `windows.tsx` — which surface is wired to which.

## Repaired — 2026-09-27

By PD-ORCH-005 phase 5's second repair.
- The stop control sends the stop, with no confirmation.
- Every confirmed "Cancel the run?" sends the reserved run id through `cancelRun`, the final cancel.
- The persona window's Cancel on the run's own instance, which asks no confirmation, stays the stop.

The readings are in OQ-69, beside the one this defect falsified.

Evidence:
- `apps/desktop/src/renderer/session-actions.test.ts`, "PD-ORCH-005 clause 3…": the stop is `cancel`, graceful and
  then forced, and the run's cancel is `cancelAgent` with `run`. A refusal of the cancel says the run is no longer
  cancellable.
- The built app. "Stop run" opened no dialog, and the run came to rest with both children `paused` by `stop` and the
  iteration open. The inspector's Cancel opened "Cancel the run?", with focus on "Keep running", and Escape closed it.
  Confirming it left both children and the iteration `cancelled`, with no interruption.
