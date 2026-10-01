## A modal opened while the composer's send is settling loses its focus to the composer behind it

The steer dialog the composer strip's "Steer the run" opens (`SteerDialog` in `packages/ui/src/WorkspaceView.tsx`) puts
its focus in its text field (`autoFocus`). The control is drawn as soon as the run is active. If it is pressed after the
run has started but before the composer's send has settled, the focus leaves the dialog's field for the composer under
the modal backdrop. What the user then types goes into the composer they cannot see, and the dialog's Steer refuses with
"Steering is unavailable for this run: the text is empty."

Seen in `part-j-proof`'s steer-rest launch (scenario 3b), run alone through a scratch copy of the proof, as root under
Xvfb, Node 24, `--skip-build`, with another plan's agents on the host (load average 2.6 to 10.5), on 2026-10-01. The
launch types its prompt at 1.0 s and presses Steer the run as soon as it is drawn, at 1.2 to 1.7 s. In 4 of 17 runs
the steer was never submitted (the timeline read `run_start, notice, run_end`). In two of them an inspection at 8.2 s
found the dialog still open with an empty field and that error and the focus on the dialog's Steer button, and in
both the last photograph shows `go left` in the composer behind the dialog. In 5 other runs an inspection at 3.25 s
found the focus in the dialog's field, and those runs passed.

The likely path, not yet confirmed by a trace: the composer's `submit` awaits `onSubmit` (the renderer's
`submitPrompt`, which waits for the `session.start` reply) and then calls `area.current?.focus()` unconditionally. The
run's events can make the Steer control appear before that reply arrives, so a dialog opened in between has its focus
taken by the composer when the reply lands. The same unconditional focus follows a queued send (`onQueue`). The slash
path already guards against this ("unless the command opened a dialog that has already taken it"); the send paths do
not. Another dialog opened in that window would be exposed the same way; none other was observed.

## Specs

- REQ-MONITOR-137: a steer started from the card must reach the run; here the text the user types for it goes
  elsewhere and the card reports an empty text.
- REQ-CHAT-002: Ctrl+L is the composer's focus move. Nothing in the specification moves focus out of an open modal; the
  dialog is `aria-modal`, and its backdrop covers the composer.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx`: `submit` (the trailing `area.current?.focus()` after `await onSubmit` and after
  `await onQueue`), the slash path's guarded focus, `SteerDialog`, and the strip's `Steer the run` control.
- `apps/desktop/src/renderer/session-actions.ts`: `submitPrompt`, the send that waits for the `session.start` reply.
- `apps/desktop/scripts/lib/steer-rest.mjs`: the steer-rest launch now presses Steer only once the send pill is enabled
  again, so its own evidence is not taken by this defect; the `steer` launch (scenario 2) still can be.

Noticed 2026-10-01 while repairing `part-j-proof`'s steer-rest launch in the fin2 round.
