## A pause settles children instead of holding them

The whole-run pause (`pause` control, `Run.requestPause`) sets one flag that the root and every child read before
their next model step. A child that sees it ends its turn, and `IterationChildren.execute` then carries on as for any
finished turn: it may re-prompt, it summarises (a model call), and it records the child terminal — `succeeded`, or
`failed` with `incomplete_execution` if it had done nothing. `TurnOutcome.paused` has no reader. The scheduler also
keeps starting queued children while the pause is requested (`startQueued` checks only `cancelled`), and those fail as
no-activity. So a paused run's children end up reported as finished work, and the session persists exactly what a
cancel persists (`paused`, `user_cancelled`).

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-MONITOR-123` (pause is graceful: "the run finishes its current step and then stops") and `REQ-SESSION-108`
("while paused no agent is part-way through execution and no model request is outstanding"): the summarising call is a
model request made after the pause was accepted, and starting a queued child is not finishing the current step.

## Relevant files

- `packages/engine/src/run/run.ts` — `requestPause`, `pauseRequested`, the `shouldPause` handed to children.
- `packages/engine/src/children/orchestration.ts` — `execute`: the re-prompt, the summariser and the terminal state after a paused turn.
- `packages/engine/src/children/scheduler.ts` — `startQueued`, which does not check for a pause.
- `packages/engine/src/run/turn.ts` — `TurnOutcome.paused`, never read.

## Repaired — 2026-09-27

By `PD-ORCH-005` phase 3, whose clause 2 is this defect's opposite: a pause stops every agent where it stands. An
accepted pause stops the scheduler (`Scheduler.hold`: no child is admitted, promoted or started from there), wakes
every parent waiting on children, and has every agent stop before its next model call: the turn checks the rest at the
top of its loop, after supervision and after compression; the resilience ladder makes no retry and no fallback once the
run rests; and a provider-limit wait is released at once. A child execution that comes to rest makes no re-prompt, no
summary and no report and reaches no terminal state: it is left `paused` with its interruption and the state it resumes
into (`IterationChildren.execute`), and every child that had not started is paused where it stood
(`IterationChildren.rest`). `TurnOutcome.paused` is read: a turn that stopped mid-way resumes `running`, and so does a
parent with a finished child whose report it has not yet received, so the report is not lost with a closed iteration.
The pause also withdraws every approval and question (clause 9) and cuts the calls still in flight at REQ-ORCH-134's
deadline. The iteration is left open, and the session persists `paused`.

The phase's adversarial review found the first version incomplete. A finished but unreported child was ignored, a
transient retry and a provider-limit wait still made a request after the pause, and a timed-out child was left `paused`.
The second review found three more gaps:

- the summariser retried an unusable answer after the pause;
- the status read `running` again once the pause released a wait;
- the manual compression was still accepted.

Each is repaired in the same phase, and the readings are in OQ-96.

This does not make the pause REQ-SESSION-108's outer-loop pause. Clause 2 stops agents mid-iteration, and OQ-96 records
how the build reads REQ-SESSION-108 against it.

Evidence:
- `children.test.ts`, "clause 2, the repair of a-pause-settles-children-instead-of-holding-them…": no summarising call,
  no step of the parked child, both children paused, the iteration open. It fails when the rest in `execute` or the
  scheduler's hold is reverted.
- `children.test.ts`, "…a child that ended with a report its parent has not been given leaves the parent unfinished…".
- `ladder.test.ts`, "…a pause accepted during a provider-limit wait releases it at once…" and "…a pause accepted during
  a transient retry's backoff makes no retry".
- `children.test.ts`, "clause 2: the call in flight when the pause came finishes; an unusable answer is not retried…".
