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
([`part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts`](fixed/part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md)):
its Steer waits for the control and for the composer's send to have settled, and its text and dialog press follow that
deadline. This launch was left as it was, because that note did not name it.

A press that does land early meets a second hazard, the product's: a steer dialog opened before the composer's send has
settled loses its focus to the composer, so the typed text misses the dialog
([`a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer`](fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md)).
This launch's 1.9 s appointment can fall inside that window too.

## Specs

None broken by the product. The launch is the evidence for REQ-MONITOR-133/137 (a steer reaching the entry role at its
next step); a step that never pressed makes it a false red.

## Relevant files

- `apps/desktop/scripts/part-j-proof.mjs`: scenario 2's `ROTARIS_CAPTURE_CLICKS` and `ROTARIS_CAPTURE_TYPE`.
- `apps/desktop/scripts/lib/steer-rest.mjs`: the steer-rest launch's schedule, the shape a repair can follow.
- `apps/desktop/scripts/lib/capture-clicks.mjs`: `unpressedClicks`, which would name the missed press.

Noticed 2026-10-01 while repairing the steer-rest launch under the fin2 round.
