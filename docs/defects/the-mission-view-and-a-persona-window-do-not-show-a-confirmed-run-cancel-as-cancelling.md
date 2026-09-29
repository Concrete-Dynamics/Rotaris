## The Mission view and a persona window do not show a confirmed run cancel as cancelling

REQ-MONITOR-127 says that on confirmation of the run's cancel "the session status is optimistically set to `cancelling`",
and that a refusal restores `running`. The Workspace meets it: `WorkspaceView`'s `cancelRun` sets `stopRequested`
before it sends, and clears it on a refusal. The Mission view's run row, confirmed through "Cancel selection", and a
persona window's Cancel on the run's own instance both send the renderer's `cancelRun` and set nothing first. Their
run row, subtitle and status keep reading `Running` until the engine's republished record arrives.

REQ-MONITOR-130 requires the same observable state whichever surface asks. The one-agent cancel is shown at once on
every surface since the repair of
[`cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md`](fixed/cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md).
The run's cancel is not.

Noticed 2026-09-29 while repairing that note under R-067, by reading the code. It was not driven, and it is not repaired.

## Specs

- REQ-MONITOR-127: the optimistic `cancelling`, restored on a refusal.
- REQ-MONITOR-296.
- REQ-MONITOR-130: whichever surface.

## Relevant files

- `packages/ui/src/MissionView.tsx`: `confirmCancel`, which awaits `onCancelRun` with no state set first; the run row's
  and the subtitle's `statusLabel`.
- `packages/ui/src/PersonaWindow.tsx`: the confirmation's `onConfirm`.
- `packages/ui/src/WorkspaceView.tsx`: `cancelRun` and `stopRequested`, the Workspace's form.
- `apps/desktop/src/renderer/session-actions.ts`: `cancelRun`, where the per-window overlay of the one-agent cancel
  (`packages/ui/src/cancel-overlay.ts`) could carry the run's `cancelling` too.
