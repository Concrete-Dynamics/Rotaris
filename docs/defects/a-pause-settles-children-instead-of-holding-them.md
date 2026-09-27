## A pause settles children instead of holding them

The whole-run pause (`pause` control, `Run.requestPause`) sets one flag that the root and every child read before
their next model step. A child that sees it ends its turn, and `IterationChildren.execute` then carries on as for any
finished turn: it may re-prompt, it summarises (a model call), and it records the child terminal — `succeeded`, or
`failed` with `incomplete_execution` if it had done nothing. `TurnOutcome.paused` has no reader. The scheduler also
keeps starting queued children while the pause is requested (`startQueued` checks only `cancelled`), and those fail as
no-activity. So a paused run's children end up reported as finished work, and the session persists exactly what a
cancel persists (`paused`, `user_cancelled`).

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-MONITOR-123` (pause is graceful: "the run finishes its current step and then stops") and `REQ-SESSION-108`
("while paused no agent is part-way through execution and no model request is outstanding"): the summarising call is a
model request made after the pause was accepted, and starting a queued child is not finishing the current step.

## Relevant files

- `packages/engine/src/run/run.ts` — `requestPause`, `pauseRequested`, the `shouldPause` handed to children.
- `packages/engine/src/children/orchestration.ts` — `execute`: the re-prompt, the summariser and the terminal state after a paused turn.
- `packages/engine/src/children/scheduler.ts` — `startQueued`, which does not check for a pause.
- `packages/engine/src/run/turn.ts` — `TurnOutcome.paused`, never read.
