## `part-j-proof`'s steer-rest launch presses Pause as soon as the run starts, racing its own Steer press

The steer-rest launch (scenario 3b) is meant to submit a steer and then pause, both inside the entry role's held
second step. Its comment says so: "the steer submitted meanwhile and the pause that follows it". Its Pause step is written
`[data-testid="composer-strip"] [aria-label="Pause the run"]@~3400`. The `~` form presses as soon as the selector
matches, and the Pause control is drawn the moment the run starts, at about 1.9 s. The Steer control's press is set for
1900 ms. So the two presses land within milliseconds of each other, in either order, and the pause always comes first
or at the same instant, never after the steer as the comment intends.

Measured 2026-09-30 on `fix-accept1-4`, as root under Xvfb, Node 24, `--skip-build`, one `part-j-proof` run with no
other load of note (load average 2.2). The launch logged `clicked "…Steer the run"` at 14.556 and
`clicked "…Pause the run"` at 14.557. The Pause press went nowhere: the steer dialog was opening. The run then ended
`run_start,run_end` with no pause, the Continue never drew, and the proof failed with "the pause and the continuation
are not both recorded". The re-run, alone, pressed Pause at 41.821 and Steer at 42.170, recorded the pause and passed.
No product change was involved: the steer's typed text `go left` sends the same events it sent before this branch.

## Specs

None broken by the product. The launch is meant to exercise REQ-MONITOR-134 with PD-ORCH-005 clause 4 (a steer still
pending when the run comes to rest). As written it cannot put the pause after the steer, and it can press Pause into the
opening Steer dialog, which is a false red.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs`: the steer-rest launch's `ROTARIS_CAPTURE_CLICKS` (the `@~3400` Pause step).
- `apps/desktop/src/main/capture/host.ts`: `settleAt`, where `@~ms` makes the time a deadline rather than an appointment.

Noticed 2026-09-30 while running the proofs of the typing repair under R-067.

## Outcome

Repaired 2026-10-01 in the fin2 round, in the proof and the capture grammar; no product code changed. The launch's
schedule moved to `apps/desktop/scripts/lib/steer-rest.mjs`, which `part-j-proof.mjs` reads:
- **Pause waits for the steer to have been accepted.** The step is written `@4300~8500`, a new form of the capture
  grammar (`@from~ms`, `parseSteps` and `settleAt` in `apps/desktop/src/main/capture/host.ts`): the waiting form that
  looks at nothing before `from`. Its selector starts with `body:not(:has(.dialog.steer))`, and the steer dialog
  closes only when the steer was accepted, so the press follows the dialog's Steer and never lands in the dialog. The
  plain `~` form could not express this: no steer dialog is open from the run's start, so it would have pressed at
  once, the defect again. The triage's fixed `@3400` was not taken: under load the run starts late, and an
  appointment can fall before the steer as easily as the `~` form did.
- **Steer the run waits (`@~3500`) for its control and for the composer's send to have settled**, and the typed text
  (3800 ms) and the dialog's Steer (4200 ms) are appointments after that deadline. A run starting at 2.16 s missed the
  old 1900 ms appointment once on 2026-10-01; a dialog opened before the send settled lost its focus to the composer
  (recorded as its own product defect,
  [`a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer`](a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md)).
- **The proof asserts what the launch exercised.** It fails by name on any step the log does not show pressed on its
  own control (`unpressedClicks`), and on a timeline where the steer was not pending when the pause was asked for
  (`steerPendingAtPause`: `steering_submitted` before `run_pause_requested`, and no `steering_injected` before it).

Pinned by `apps/desktop/scripts/lib/steer-rest.test.ts` (9 cases; with the old schedule restored, "never looks for Pause
before the dialog's Steer was pressed" and "types the steer only after the Steer control's wait has ended" fail) and by
the `@from~ms` cases in `apps/desktop/src/main/capture/host.test.ts` (the grammar, and `settleAt` probing nothing before
`from` on a fake clock).

Shown in the built app, as root under Xvfb, Node 24, `--skip-build` after one `pnpm build`, scenario 3b alone through a
scratch copy of the proof that runs only it with the proof's own assertions: **12 of 12 green**, six with only the other
plan's agents on the host (load average 1.8 to 9.0) and six more beside two busy loops (10.2 to 14.3). In the six
loaded runs the Steer pressed 3.5 to 5.6 s after the launch, and the Pause followed the dialog's Steer by 97 to 296 ms
every time. The whole `part-j-proof` then passed, every scenario, with the other plan's agents on the host (load
average 9.7 at its start, 4.8 at its end).

Not repaired here: the `steer` launch (scenario 2) keeps the fixed appointments this launch had (repaired later the
same day in the fin4 round, when it took this launch's steer)
([`part-j-proofs-steer-launch-presses-steer-at-an-appointment-the-runs-start-can-miss`](part-j-proofs-steer-launch-presses-steer-at-an-appointment-the-runs-start-can-miss.md),
recorded).
