## The Mission view and a persona window do not show a confirmed run cancel as cancelling

REQ-MONITOR-127 says that on confirmation of the run's cancel "the session status is optimistically set to `cancelling`",
and that a refusal restores `running`. The Workspace meets it: `WorkspaceView`'s `cancelRun` sets `stopRequested`
before it sends, and clears it on a refusal. The Mission view's run row, confirmed through "Cancel selection", and a
persona window's Cancel on the run's own instance both send the renderer's `cancelRun` and set nothing first. Their
run row, subtitle and status keep reading `Running` until the engine's republished record arrives.

REQ-MONITOR-130 requires the same observable state whichever surface asks. The one-agent cancel is shown at once on
every surface since the repair of
[`cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md`](cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md).
The run's cancel is not.

Noticed 2026-09-29 while repairing that note under R-067, by reading the code. It was not driven, and it is not repaired.

*Corrected 2026-10-01, at the repair: "The Workspace meets it" was false. `WorkspaceView`'s `stopRequested` drives only
its stop button's label ("Force stop"); its run header, its composer and the status strip read the record's status, so the
Workspace did not show `cancelling` either. And the engine's republished record does not carry `cancelling`: the explicit
cancel (`Run.cancelAgent` on the reserved run id) writes no status, so the run's records read `running` until the teardown
writes the run at rest (`paused`, stop reason `user_cancelled`, REQ-ORCH-082). Only the stop writes `cancelling`.*

**Outcome.** Repaired 2026-10-01 under R-067 (acceptance finding A35). Confirmed on `fix-accept1-22` first: the cases
below were red before the change (`beginRun` did not exist, and the renderer's `cancelRun` set nothing).
- `packages/ui/src/cancel-overlay.ts` gains the run's cancel: `beginRun` lays an overlay with no agent ids and the run's
  `runStartedAt`, and `shownSession` shows the session's status `cancelling` over every active record of that run,
  answered or not. A refusal removes it; an acceptance keeps it until the run's first record at rest, and it never covers
  a later run (OQ-158 — the engine gives the overlay no `cancelling` record to yield to).
  *Corrected 2026-10-01, at the verification: "it never covers a later run" was false as first built. Keyed on
  `runStartedAt` alone, the overlay covered the next run's pre-flight, whose records carry the cancelled run's key until
  the engine writes the new one after the pre-flight, so a follow-up read `Cancelling` and the composer refused input.
  The store now ends a run's overlay at the first record of its session at rest that it takes after the confirmation
  (`witness`, `restedAt`), covers no record taken after that one, and covers a record taken between the two whatever key
  it carries. Pinned by three further cases in `cancel-overlay.test.ts`, red before this correction ("once the run has
  rested, its next run is shown as the engine writes it…", "a run that rests before the engine answers ends the overlay
  too…", "covers the run it was confirmed against when that run writes its own runStartedAt…").*
- `apps/desktop/src/renderer/session-actions.ts`: `cancelRun` begins the overlay before it sends the reserved run id's
  `cancelAgent`, refuses it on any refusal (the engine's, or an unreachable command) and accepts it on an acceptance.
  Every confirmed "Cancel the run?" comes here — the Workspace, the Mission view's "Cancel selection", a persona window's
  Cancel on the run's own instance — and their roots read the session through the overlay (`useShownSession`,
  `useCancelOverlaid`), so no surface sets a state of its own. The status strip (`apps/desktop/src/renderer/main.tsx`)
  now reads the shown status too; it read the replica's record directly.
- Pinned by `packages/ui/src/cancel-overlay.test.ts` ("REQ-MONITOR-127: a confirmed cancel of the run is shown cancelling
  at once", five cases, eight with the correction above) and `apps/desktop/src/renderer/session-actions.test.ts` ("REQ-MONITOR-127: a confirmed cancel of
  the run is shown cancelling before the engine answers, and restored on its refusal"), and by `pnpm mission-proof` item
  4b, new: the run row selected, "Cancel selection" confirmed, and every sample the log records after the confirm click
  reads the subtitle, the run row and the strip `Cancelling` until the run's record at rest — never `Running`. Green on the
  repair (three samples `Cancelling`, then `Paused` from about 50 ms after the confirm); red on a build of the base's
  `session-actions.ts` and `main.tsx` (see the first-executions row of 2026-10-01).
- What is not repaired: another window shows the cancel only when the run's record at rest reaches it, since the engine
  writes no `cancelling` for the explicit cancel. OQ-158 asks whether it should.

## Specs

- REQ-MONITOR-127: the optimistic `cancelling`, restored on a refusal.
- REQ-MONITOR-296.
- REQ-MONITOR-130: whichever surface.

## Relevant files

- `packages/ui/src/MissionView.tsx`: `confirmCancel`, which awaits `onCancelRun` with no state set first; the run row's
  and the subtitle's `statusLabel`.
- `packages/ui/src/PersonaWindow.tsx`: the confirmation's `onConfirm`.
- `packages/ui/src/WorkspaceView.tsx`: `cancelRun` and `stopRequested`, the Workspace's form.
- `apps/desktop/src/renderer/session-actions.ts`: `cancelRun`, which now lays the run's overlay
  (`packages/ui/src/cancel-overlay.ts`, `beginRun`).
- `apps/desktop/src/renderer/main.tsx`: the status strip's run item, which now reads the shown status.
- `apps/desktop/scripts/mission-proof.mjs` item 4b — the proof.
