## The window close's box counts runs its Yes cannot stop

The close of one of several main windows asks while the run host counts a run active in the window's workspace
(`runs.active` keyed, `Sessions.activeRunCount(root)`, which reads `isRunActive`: a live run not yet ended, or a stored
status that is busy). Its Yes stops what `Sessions.stopActiveIn(root)` takes: a live run not yet ended **that still accepts
a stop** (`run.acceptsStop`, false once the run's end is written). The two predicates differ for a run whose end is
written but which has not finished ending — the teardown's terminal status saved, the plan gate's park
(`awaiting_plan_decision`) or the message-limit pause written, and the drain and `session_end` hooks still awaited. Such a
run is counted, the box says the close ends it, and the Yes stops nothing; the run comes to its own end, and the box's
count of runs the close "ends" is wrong by it (fin28 reviewers' finding (d) on 2631eaf).

## Specs

`PD-SHELL-009` ("asks … while the closing window's own workspace has a run active", "Its Yes stops those runs as the
stop control does"), REQ-STARTUP-046 (the box conveys that closing the window ends the run), REQ-SHELL-122 (the count).

## Relevant files

- `packages/engine/src/sessions.ts` — `activeRunCount`, `isRunActive`, `stopActiveIn`.
- `apps/desktop/src/run-host/dispatch.ts` — `runs.active`, `runs.stopWorkspace`.
- `apps/desktop/src/main/index.ts` — `confirmRunsAtClose`'s `workspaceRuns`.

## Repaired — 2026-10-07, fin29 (PD-SHELL-009, REQ-STARTUP-046)

The close of one of several main windows now counts with the stop's own predicate: `runs.active` takes `scope:
'stoppable'`, which the run host answers with `Sessions.stoppableRunCount(workspaceRoot)`; it and `stopActiveIn` share one
predicate (`Sessions.stoppable`: a live run whose end is not yet written). `activeRunCount` is unchanged for REQ-SHELL-021's
gate 3, the restore's refusal and the instance-wide counts. Pinned by `run.test.ts`'s "finding d" case (a run held while it
forwards its end is counted active and not stoppable, and the stop takes nothing) and `dispatch.test.ts`'s scope case, both
red on the source before (no such count existed). ADR-0013's sixth execution carries the correction beside its claim.
