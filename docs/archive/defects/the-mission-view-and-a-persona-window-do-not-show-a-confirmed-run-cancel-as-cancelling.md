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
  a later run (OQ-165 — the engine gives the overlay no `cancelling` record to yield to).
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
  *Corrected 2026-10-01, at the second verification: reading the session through the overlay did not make a persona
  window show it, and this bullet claimed it did. The window reads no session status of its own; it draws the run's
  instance through the agent vocabulary, which has no `cancelling` (`runLevelAgent` presents every busy status as
  `running`), so its heading's state and its tab's tooltip read `running` until the record at rest arrived — before this
  repair and after its first build alike. They now read the run's `cancelling` on the run's own live instance while the
  shown session reads it (`agentStateLabel` in `packages/ui/src/agents.ts`, read by `PersonaWindow`; the dot keeps
  pulsing, since the instance is live until the run rests; OQ-165 states the word's reading). Pinned by
  `packages/ui/src/persona-run-cancel.test.ts`, which renders the window under `beginRun` and was red before
  ("expected 'running' to be 'cancelling'"), and by `pnpm mission-proof` item 4c, new: the inspector pops out the
  run-level agent, the window's Cancel on the run's own instance is confirmed, and every snapshot after the confirmation
  was handled reads `cancelling` or the run at rest — green on the repair (six snapshots `cancelling`, then `cancelled`),
  red on a build of the base's `PersonaWindow.tsx` (six snapshots `running`).*
- A run overlay also ends when the window follows another session before the run rests (`witness` takes a record of
  another session): it will not take that run's final read, and on its return a run started meanwhile would read
  `Cancelling` until it rested. Pinned by "ends when the window follows another session before the run rests…" in
  `cancel-overlay.test.ts`, red before (the verifier's optional finding at the second verification).
- Pinned by `packages/ui/src/cancel-overlay.test.ts` ("REQ-MONITOR-127: a confirmed cancel of the run is shown cancelling
  at once", five cases, eight with the correction above) and `apps/desktop/src/renderer/session-actions.test.ts` ("REQ-MONITOR-127: a confirmed cancel of
  the run is shown cancelling before the engine answers, and restored on its refusal"), and by `pnpm mission-proof` item
  4b, new: the run row selected, "Cancel selection" confirmed, and every sample the log records after the confirm click
  reads the subtitle, the run row and the strip `Cancelling` until the run's record at rest — never `Running`. Green on the
  repair (three samples `Cancelling`, then `Paused` from about 50 ms after the confirm); red on a build of the base's
  `session-actions.ts` and `main.tsx` (see the first-executions row of 2026-10-01). How long the `Cancelling` window lasts
  is host timing — the runs of 2026-10-01 measured between about 40 and 80 ms — so the count of samples inside it is
  recorded, never asserted.
  *Corrected 2026-10-01, at the second verification: "every sample the log records after the confirm click" did not
  mean "read after the click was handled". The click is an input event the renderer handles after the main process logs
  it, and a separate probe can run first: the verifier's run went red on a subtitle probe logged in the same millisecond
  as the click and reading `Running`, while the run-row probe 6 ms later read `Cancelling` — the product was right. Item
  4b now reads each sample as one selector list (the dialog, the subtitle, the run row and the strip in one instant)
  and counts only the snapshots that no longer hold the confirmation, which closes in the same commit that lays the
  overlay; the "never `Running`" and "no other active status" assertions are unchanged.*
- What is not repaired: another window shows the cancel only when the run's record at rest reaches it, since the engine
  writes no `cancelling` for the explicit cancel. OQ-165 asks whether it should.

## Specs

- REQ-MONITOR-127: the optimistic `cancelling`, restored on a refusal.
- REQ-MONITOR-296.
- REQ-MONITOR-130: whichever surface.

## Relevant files

- `packages/ui/src/MissionView.tsx`: `confirmCancel`, which awaits `onCancelRun` with no state set first; the run row's
  and the subtitle's `statusLabel`.
- `packages/ui/src/PersonaWindow.tsx`: the confirmation's `onConfirm`; the heading's state and the tab tooltip, which now
  read `agentStateLabel` (`packages/ui/src/agents.ts`).
- `packages/ui/src/WorkspaceView.tsx`: `cancelRun` and `stopRequested`, the Workspace's form.
- `apps/desktop/src/renderer/session-actions.ts`: `cancelRun`, which now lays the run's overlay
  (`packages/ui/src/cancel-overlay.ts`, `beginRun`).
- `apps/desktop/src/renderer/main.tsx`: the status strip's run item, which now reads the shown status.
- `apps/desktop/scripts/mission-proof.mjs` items 4b and 4c — the proof; item 4c drives the persona window through the
  capture seam `ROTARIS_CAPTURE_PERSONA_CLICKS` (`apps/desktop/src/main/capture/seams.ts`, forbidden in a package by
  `apps/desktop/scripts/package.mjs`).
