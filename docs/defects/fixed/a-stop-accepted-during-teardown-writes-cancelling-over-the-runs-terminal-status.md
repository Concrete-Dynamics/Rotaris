## A stop accepted during teardown writes `cancelling` over the run's terminal status

`Run.stopAccepted` guards only `this.ended`, which teardown sets in its last `finally`. Between the terminal transaction
(`writer.endRun`, which writes the run's rest: `completed`, `failed`, `paused`, …) and that `finally`, teardown awaits the
terminal pair's forwarding (`drain`) and runs the hooks advisory. A stop control (`Sessions.control`, `op: 'cancel'`)
accepted in that window answers `{ ok: true }`, sets `cancelSaved` and saves through `saveRunning`, which writes
`cancelling` over the terminal status; nothing writes the rest again, so the session record keeps reading an active
`cancelling` claim for a run that has ended. `SessionWriter.save` has no guard against a non-terminal save after `endRun`.
The explicit cancel (`cancelAgent`) already refuses once `cancelWindowClosed` is set; the stop does not. Found by fin22's
verifiers (finding 11, older than fin22); acceptance finding F05 of finacc3.

## Specs

REQ-SESSION-186 (the stop control) with OQ-165's ruling (R-071, PD-ORCH-005 clause 3): an accepted stop reads `cancelling`
**until the teardown writes the run's end**, never after it. REQ-SESSION-073 makes `cancelling` a transitional status honoured
as an active claim, so a finished run left reading it is reported active to every reader; REQ-MONITOR-127 and REQ-MONITOR-130
ask every surface to read the same, true state from the record.

## Relevant files

- `packages/engine/src/run/run.ts` — `stopAccepted` (guards `ended` only); `teardown` (`cancelWindowClosed = true`, then
  `endRun`, then `await this.drain()` and the hooks advisory, then `ended = true` in the last `finally`); `saveRunning`.
- `packages/engine/src/sessions.ts` — `control`, `case 'cancel'`: raises the stop and calls `stopAccepted`, answering `ok`.
- `packages/engine/src/session-writer.ts` — `save`: no terminal guard.

## Outcome

Repaired 2026-10-06 by finacc3's repair bundle `finacc3-accept1-9` (acceptance finding F05). `Run.endWritten` reads
`ended` or `cancelWindowClosed`, which the teardown sets just before the terminal transaction with nothing awaited between,
so it marks the run's end as written. The stop is refused from there (`Run.acceptsStop`, read by `Sessions.control`'s
`cancel` before it raises the stop, which answers `{ ok: false }` as the explicit cancel does; `stopAccepted` refuses too),
and so are the pause, the mode change and the todo edits, which would otherwise save `pausing` or `running` over the end in
the same window, or be answered `ok` and lost; `saveRunning` writes nothing once the end is written. Pinned by two tests in
`packages/engine/src/run/turn.test.ts`, each sending its controls from the hooks advisory (after the terminal transaction and
the terminal pair's forwarding, before `ended`): "a stop accepted after the teardown wrote the run's end is refused and
leaves the terminal status" (red before: `{ ok: true }` and `cancelling` over `completed`) and "no control accepted after the
teardown wrote the run's end saves an active status over it" (red before: the pause and the mode change answered `ok`, the
record reading `running`). `pnpm composer-proof` and `pnpm mission-proof` (the stop and cancel controls on the built app, the
run at rest `paused` / `user_cancelled`) pass on the repaired build; neither can place a press inside the teardown's window,
which only the unit tests reach.
