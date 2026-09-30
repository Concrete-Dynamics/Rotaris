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
