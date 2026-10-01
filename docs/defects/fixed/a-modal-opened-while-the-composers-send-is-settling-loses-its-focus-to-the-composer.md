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

## Outcome

Repaired 2026-10-01 in the fin4 round. Confirmed first on `origin/main` (`ecda319`): a scratch copy of `part-j-proof`'s
steer launch that pressed Steer the run only while the composer's send pill was still disabled found that window in
2 of 5 runs (load average about 13), and both lost the steer, the focus in the composer at 3.7 s with the dialog still
open; the trace the note lacked is the order in the log, the dialog opened and then the `session.subscribe` reply
landed. The send settles in the renderer only on that reply, while the attach's snapshot has already drawn the run.

- **The composer takes focus back only when nothing else took it meanwhile.** `composerReclaimsFocus`
  (`packages/ui/src/composer.ts`) is the one rule for every awaited submission: focus returns to the composer when it
  is nowhere (`null` or the body), in the composer, or still on what held it when the submission began. `WorkspaceView`'s
  `reclaimFocus` applies it after `await onQueue`, after `await onSubmit`, and after an executed slash command, whose
  guard (null, body or composer) it replaces. The clause "still on what held it" is beyond the triage's sketch on
  purpose: a click on the send pill leaves the focus on the pill, and a Ctrl+Return from another widget leaves it there
  (REQ-CHAT-001); both returned focus to the composer before and still do. Shown in the built app: a run started by a
  click on the pill had the focus on the pill right after the click once in two, and in the composer once its send
  had settled both times.
- **A verification seam holds the reply.** `ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS` (`session.subscribe` in
  `apps/desktop/src/main/commands/session.ts`, only under `ROTARIS_CAPTURE_PNG`) holds the reply that long after the
  attach is acknowledged, so the window a script cannot hit reliably is wide enough to hit every time; the product path
  is otherwise unchanged. The precedent is `ROTARIS_CAPTURE_QUESTION_STALE` beside it.
- **`part-j-proof` scenario 2b, the steer-early launch** (`apps/desktop/scripts/lib/steer-early.mjs`): the reply held
  1500 ms, Steer the run pressed as soon as it is drawn while the send pill is still disabled, `go left` typed at 4.5 s
  (after the reply went) and the dialog's Steer at 5.0 s. The log must show the press before the reply's release and
  the typing after it (`steerEarlyReading`), the steer must be submitted once and injected, and the root's record must
  hold `[Steering prompt] go left`.

Pinned by `packages/ui/src/composer.test.ts` ("the focus after a submission settles": the rule's cases, and a source
pin that every awaited submission returns the focus through it; the pin fails on the unrepaired `WorkspaceView.tsx`),
`apps/desktop/src/main/commands/session.test.ts` (the seam holds the reply on a fake clock while capturing and never
otherwise), and `apps/desktop/scripts/lib/steer-early.test.ts` (the schedule and its reading).

Shown in the built app, as root under Xvfb, Node 24, the launch alone through a scratch copy of the proof with its
assertions: on a build with the seam and the **unrepaired** renderer, **6 of 6 red**, each with the dialog opened before
the reply's release, the timeline `run_start, notice, run_end` and the focus in the composer at 4.4 s; on the repaired
build, **10 of 10 green** (load average 3.9 to 7.4), the focus in the dialog's field at 4.4 s every time. The whole
`part-j-proof` then passed, every scenario, with the other plan's agents and this branch's lint on the host (load average
14.7 at its start, 19.0 at its end).
