## `part-j-proof`'s steer launch presses Steer at an appointment the run's start can miss

Scenario 2 of `part-j-proof` (the `steer` launch) presses `[data-testid="composer-strip"] [aria-label="Steer the run"]`
at a fixed 1900 ms, types `go left` at 2300 ms and presses the dialog's Steer at 2600 ms. The Steer the run control is
drawn only while a run is active (`runActive && onSteer` in `packages/ui/src/WorkspaceView.tsx`), so the first press
finds nothing when the run starts later than 1.9 s after the capture's start. The typing then goes to whatever holds
focus, the dialog's Steer finds no dialog, and the proof fails with "the steer was not submitted and injected", a red
that says nothing about the product.

Not seen failing in this launch. Seen in the same step of the steer-rest launch (scenario 3b), which had the same three
appointments: on 2026-10-01, at a load average of 3.5, as root under Xvfb, Node 24, `--skip-build`, its run started
2.16 s in and the log read `capture: no "[data-testid="composer-strip"] [aria-label="Steer the run"]" control on screen`.
The steer-rest launch was repaired with its own note
([`part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts`](part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md)):
its Steer waits for the control and for the composer's send to have settled, and its text and dialog press follow that
deadline. This launch was left as it was, because that note did not name it.

A press that does land early meets a second hazard, the product's: a steer dialog opened before the composer's send has
settled loses its focus to the composer, so the typed text misses the dialog
([`a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer`](a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md)).
This launch's 1.9 s appointment can fall inside that window too.

## Specs

None broken by the product. The launch is the evidence for REQ-MONITOR-133/137 (a steer reaching the entry role at its
next step); a step that never pressed makes it a false red.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs`: scenario 2's `ROTARIS_CAPTURE_CLICKS` and `ROTARIS_CAPTURE_TYPE`.
- `apps/desktop/scripts/lib/steer-rest.mjs`: the steer-rest launch's schedule, the shape a repair can follow.
- `apps/desktop/scripts/lib/capture-clicks.mjs`: `unpressedClicks`, which would name the missed press.

Noticed 2026-10-01 while repairing the steer-rest launch under the fin2 round.

## Outcome

Repaired 2026-10-01 in the fin4 round, in the proof; no product code changed. Confirmed first with origin/main's
schedule through a scratch copy of the launch, as root under Xvfb, Node 24: load alone did not reach it (8 of 8 green at a
load average of 5 to 12, 6 of 6 beside four busy loops at about 11), but a run started late on purpose
(`ROTARIS_CAPTURE_PROMPT_MS=1700`, the prompt seam's own timing, so the run started about 2.5 s in) failed 3 of 3, the
log reading `capture: no "[data-testid="composer-strip"] [aria-label="Steer the run"]" control on screen` and the
timeline `run_start, loop_supervisor_activation, run_end`: the proof's red, not the product's.

- **The launch takes the steer-rest launch's steer.** `STEER_CLICKS`, `STEER_TYPE` and `STEER_WHATS` in
  `apps/desktop/scripts/lib/steer-rest.mjs` are its first two presses and its text, shared rather than copied: Steer
  the run waits (`@~3500`) for its control and for the composer's settled send, `go left` follows at 3800 ms and the
  dialog's Steer at 4200 ms.
- **A missed press is the proof's red by name.** After the launch, `part-j-proof` asks `unpressedClicks` for both
  presses and fails naming any step the log does not show pressed on its own control.
- **The run is still at its step when the steer lands.** The script holds the second step 5 s
  (`read,wait:5000,read,read`, where it was four plain reads), so a steer submitted at the latest deadline is injected
  at the step after; the capture waits 11 s.

The product half the note named, the focus a dialog opened before the send settled lost to the composer, was repaired
in the same round ([`a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer`](a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md));
that window is now the steer-early launch's (scenario 2b), and this launch keeps out of it on purpose.

Pinned by `apps/desktop/scripts/lib/steer-rest.test.ts`'s "steer schedule, scenario 2" cases (5): the Steer step waits
and requires the settled send, the text and the dialog's Steer follow its deadline, the schedule is the steer-rest
launch's own first two steps, and the launch line in `part-j-proof.mjs` runs `STEER_CLICKS` and `STEER_TYPE` with no
appointment of its own and reads its presses back; that last case fails on origin/main's proof.

Shown in the built app, the launch alone through the scratch copy with the proof's assertions: 6 of 6 green (load
average 6.9 to 10.6), 6 of 6 with the run started late (the Steer pressed 2.0 to 2.3 s in), and 4 of 4 with the run
started late beside four busy loops. The whole `part-j-proof` then passed three times in a row beside two busy loops
and the other plan's agents (load average 6.1 to 10.1), its Steer pressed 1.3 to 1.9 s in.
