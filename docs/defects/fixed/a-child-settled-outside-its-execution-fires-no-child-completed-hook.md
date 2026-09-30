## A child settled outside its execution fires no `child_completed` hook

`child_completed` fires from two places only, both in `children/orchestration.ts`:
- the end of a child's own execution (`IterationChildren.execute`);
- since 2026-09-29, `settleRaised`, which settles a child whose execution raised outside its turn.

Every other path that brings a child to a terminal state fires no hook:
- the blocking cascade (`Scheduler.cascadeBlocked`, REQ-ORCH-048);
- the finalize sweep (`Scheduler.finalizeIncomplete`, REQ-ORCH-052);
- the user's cancel of one child (`IterationChildren.cancel`, REQ-ORCH-133);
- the at-rest cancel (`Sessions.cancelPausedAtRest`, `PD-ORCH-005` clause 16);
- the settle of a child a previous run left (`settleStaleChildren`, REQ-ORCH-053);
- the decline of a resumable iteration (`PD-ORCH-005` clause 6).

A hook configured on `child_completed` therefore never hears of a child that was blocked or cancelled.

Noticed 2026-09-29 while repairing
[`a-child-blocked-by-its-dependency-gets-no-report.md`](a-child-blocked-by-its-dependency-gets-no-report.md).
Established by reading the code; not driven.

## Specs

`REQ-HOOKS-003`: "`child_completed` once a delegated child agent has finished, whatever its final state". Whether a
child that never started (`blocked`), or one cancelled while paused, has "finished" is a reading. `cancelled` and
`blocked` are terminal states (REQ-MONITOR-300), and REQ-ORCH-048 has terminal-state callbacks fire for cascaded
records "exactly as for directly completed ones", which suggests the hook should fire too. Some of these paths run
where no hook port is at hand, such as `Sessions` at rest.

## Relevant files

- `packages/engine/src/children/scheduler.ts`: `cascadeBlocked` and `finalizeIncomplete`. The scheduler has no hook
  port.
- `packages/engine/src/children/orchestration.ts`: `cancel`, `settleStaleChildren`, and the two paths that do fire.
- `packages/engine/src/sessions.ts`: the at-rest cancel.

## Outcome

**Repaired 2026-09-30 under [R-067](../../product/requests.md#r-067)** (acceptance round 1, finding A15), for every path
the specification places inside a run; three paths outside one are raised as
[OQ-152](../../architecture/open-questions.md) and built to fire nothing until it is ruled.

Confirmed on the branch first: five cases in `packages/engine/src/children/children.test.ts` (the describe "… a child
settled outside its execution fires `child_completed`") were red on the code as it stood; a sixth, added with the repair,
holds the hook of a child the finalize sweep cancels at an ordinary exit and is red both without the repair and with the
run's wait for the sweep's hooks removed. Each recorded no
`child_completed` for the child in question: one the cascade blocked, one the user cancelled in a live run, one the
finalize sweep cancelled at the explicit cancel before it had started, one a previous run left `running` and the next run
settled, and one the user declined with "continue without them". The reading the note left open is settled by the
specification itself: REQ-HOOKS-075 lists `blocked` and `cancelled` among
`child_completed.state`'s values and REQ-ORCH-048 and REQ-ORCH-052 have the terminal callbacks fire for cascaded and swept
records "exactly as for directly completed ones".

What changed:

- `IterationChildren` (`children/orchestration.ts`) listens to every terminal move the scheduler is told of. One that
  its own settle (`afterTerminal`) did not make — the cascade, the finalize sweep, `cancel` — fires `child_completed`
  through `completedOutside`. The hooks run one after another, in the order the children settled, each child held as
  settling until its hook is done. So its parent takes it as ended only then (REQ-HOOKS-080), a rest waits for it as for
  an execution, and the run waits for all of them after the finalize sweep, before `iteration_end`
  (`completionsSettled`). The fields are the terminal record's and its report's (`childCompletedFields`, REQ-HOOKS-075).
- The stale settle (`settleStaleChildren`) hands each settled child's fields to its run (`RunDeps.settledBeforeStart`),
  which fires them once its `session_start` has, before anything else runs.
- The decline (`Run.closeLeftOpenIteration`) fires one for each paused agent it cancels, after the continuing run's
  `session_start` and before the declined iteration closes.

Not fired, per OQ-152's reading as built: the cancel of a paused child at rest (clause 16, no run and no hook port), the
explicit cancel's close after its run's `session_end`, and the record of an accepted cancel whose host died
(`recordAcceptedCancel`). The last was not in this note's list; it was found by the repair's own sweep of every terminal
move.

Found by the repair's verification, and closed with it: a settle's end removed its child's `settles` entry whatever
settle had put it there. A child the user cancelled and its parent then followed up (clause 22) while the cancel's hook
still ran began a second settle over the first, and the first hook ending took the second's entry with it, so the
terminal listener found none and fired `child_completed` a third time (REQ-HOOKS-076, "exactly once"). `beginSettle`'s
end now removes the entry only while it is its own. Pinned by the case "a child followed up while its cancel's hook still
runs fires it once for each end" in the same describe, red before that change (three hooks for two ends).

The bound, stated: at a stop or a quit these hooks are awaited as executions only within what is left of the stop's 30 s
grace (REQ-SESSION-092); one still running then is given up on with the executions, as a settle's own hook inside a
child's execution already is, and may finish after `session_end`, bounded by its per-hook timeout (REQ-HOOKS-033). A pause
waits for it; every other exit waits for all of them.

Not driven in the built app or live: the live-run scenarios configure no lifecycle hook, and the note was found by
reading the code.
