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
[OQ-154](../../architecture/open-questions.md) and built to fire nothing until it is ruled.

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
  (`completionsSettled`). The fields are the terminal record's and its report's (`childCompletedFields`, REQ-HOOKS-075),
  taken as the scheduler is told the child settled and carried to its hook. *(Corrected 2026-09-30, the second
  verification: this line first read "the fields are the terminal record's", and the code read the record when the hook
  started — see below.)*
- The stale settle (`settleStaleChildren`) hands each settled child's fields to its run (`RunDeps.settledBeforeStart`),
  which fires them once its `session_start` has, before anything else runs.
- The decline (`Run.closeLeftOpenIteration`) fires one for each paused agent it cancels, after the continuing run's
  `session_start` and before the declined iteration closes.

Not fired, per OQ-154's reading as built: the cancel of a paused child at rest (clause 16, no run and no hook port), the
explicit cancel's close after its run's `session_end`, and the record of an accepted cancel whose host died
(`recordAcceptedCancel`). The last was not in this note's list; it was found by the repair's own sweep of every terminal
move. A fourth was added by the second verification: the stale settle of a run that ends before its `session_start` (a
stop requested during its pre-flight, or a raise before that point) hands its children's fields to a run that never fires
them, and no later run does.

Found by the repair's verification, and closed with it: a settle's end removed its child's `settles` entry whatever
settle had put it there. A child the user cancelled and its parent then followed up (clause 22) while the cancel's hook
still ran began a second settle over the first, and the first hook ending took the second's entry with it, so the
terminal listener found none and fired `child_completed` a third time (REQ-HOOKS-076, "exactly once"). `beginSettle`'s
end now removes the entry only while it is its own. ~~Pinned by the case "a child followed up while its cancel's hook still
runs fires it once for each end" in the same describe, red before that change (three hooks for two ends).~~ *(Corrected
2026-09-30, the third verification: that case was red before this change, but since the second verification the terminal
listener reads `tellingOwnSettle`, not `settles`, so the third hook can no longer come through `beginSettle` and the case
stays green with the guard removed. It now pins only that each end fires once.)* What `beginSettle`'s guard protects now is
`settlesOf`: the second end's entry still says the child is settling after the first end's hook is done, so a parent that
finds the child ended on its own — in the resume loop or in `wait_for_tasks` — waits for the second end's hook
(REQ-HOOKS-080). Pinned by the case "a child followed up while its cancel's hook runs is still settling when that hook
ends and the follow-up's own hook runs — its parent waits for the second", red with the guard removed (the root's next
model step came before the follow-up's hook ended).

The third verification also found the parent's wait on an outside hook pinned by no case: with `completedOutside` holding
no `settles` entry, every case stayed green. `completedOutside` holds its child as settling (`beginSettle`) until its hook
is done, so a parent the cancel, the cascade or the sweep wakes takes the child as ended only then, as a settle's own hook
holds it (REQ-HOOKS-080). Pinned by the case "a parent takes a child the user cancelled as ended only once its
`child_completed` hook is done — its next model step waits for the hook", red with that entry removed.
The same round's optional finding: the terminal listener read the child's record with nothing to catch a store that
raises, so the scheduler only warned and no hook fired. It now falls back to the row the terminal move returned, as
`afterTerminal` does — the hook fires with the terminal state, and the report's status and summary it cannot read are
empty. Pinned by the case "a store that cannot be read as the scheduler is told still fires the hook, from the moved
row", which recorded no hook before.

Found by the repair's second verification, and closed with it: a hook `completedOutside` queued behind one still running
read the child's record when it started, not when the child settled. A child the user cancelled while an earlier child's
hook still ran, and its parent then followed up (clause 22) and saw succeed, had its cancel's hook read the follow-up's
record: the cancelled end was sent as `succeeded`, with the follow-up's summary, beside the follow-up's own — the
cancelled occurrence lost and the succeeded one fired twice (REQ-HOOKS-075, REQ-HOOKS-076); had the earlier hook ended
while the follow-up ran, the state sent was not a terminal one. The falsified claim was "the fields are the child's record
once it is terminal". The terminal listener now takes the fields as the scheduler is told — every path stores the report
before it tells — and `completedOutside` carries them to the hook. The same round found the listener's guard wrong in the
same shape: it took a `settles` entry to mean the child's own settle fires the hook, but a queued outside hook holds one
too, so the follow-up cancelled again from outside before the first hook ended fired nothing (REQ-HOOKS-003). The guard is
now `tellingOwnSettle`, set only while `afterTerminal` tells the scheduler. Pinned by the cases "a hook queued behind
another carries the fields of the end that queued it" and "a followed-up child cancelled again while its first cancel's
hook is still queued fires it for the second cancel too" in the same describe, each red before the change
(`['succeeded','succeeded']` for `x`'s ends; one hook for two cancels). The bound, stated: each end fires once with its own
fields, but a hook queued behind another is delivered after a later end's own hook when that later end comes first,
because a follow-up does not wait for the queue.

~~The bound, stated: at a stop or a quit these hooks are awaited as executions only within what is left of the stop's 30 s
grace (REQ-SESSION-092); one still running then is given up on with the executions, as a settle's own hook inside a
child's execution already is, and may finish after `session_end`, bounded by its per-hook timeout (REQ-HOOKS-033). A pause
waits for it; every other exit waits for all of them.~~ *(Corrected 2026-09-30, the fourth verification: "a pause waits for
it" was false of the code. A rest waited on the executions it saw when it began — a pause on a snapshot of `executing`, a
stop or a quit on `outlast`'s — so a hook the user's cancel of one child queued while the rest waited was awaited by
nothing, and the run went on to `session_end` while it ran: the order recorded was `session_start`,
`child_completed(b)`, `session_end`, then that hook's end. The run's rest branch never waited for these hooks either, so a
paused child the user cancelled once the rest was recorded, before the run ended, had its hook end after `session_end`
too — REQ-HOOKS-076's order and REQ-HOOKS-080's in-line run both broken.)*

What holds now:

- The rest's wait looks again until no execution is left (`IterationChildren.drained`, used by `rest` for a pause and by
  `outlast` for a stop or a quit), so a hook queued while the rest waits is waited for: by a pause, bounded only by the
  hook's own timeout; by a stop or a quit, within what is left of the stop's 30 s grace (REQ-SESSION-092).
- Before `session_end` the run waits for every hook the last iteration's children queued from outside a settle
  (`Run.childCompletionsSettled`): bounded only by each hook's own timeout (REQ-HOOKS-033) when no stop was requested,
  and within what is left of the stop's grace when one was. This covers a paused child the user cancels once the rest is
  recorded and before the run ends.
- The bound, stated: at a stop or a quit a hook still running when the grace is spent is given up on with the
  executions, as a settle's own hook inside a child's execution is, and may finish after `session_end`, bounded by its
  per-hook timeout. The explicit cancel's finalize sweep is awaited (`completionsSettled`) before `outlast`, so its hooks
  are bounded by each hook's own timeout only, not by the stop's grace: they hold the run, as REQ-HOOKS-080 has lifecycle
  hooks do.
- Not closed here: a user's cancel of one child accepted while the run's own `session_end` hooks run fires its
  `child_completed` after `session_end`. Recorded as
  [`a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`](a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md).

Pinned by three cases in the same describe, each red before this change and each red with only its own part removed:
"a child the user cancels while a pause waits on the executions is waited for too — its `child_completed` ends before
the rest is recorded and before `session_end`" (red with the pause's snapshot wait restored), "a child the user cancels
while a stop waits on the executions is waited for within the stop's grace …" (red with `outlast`'s snapshot restored),
and "a paused child the user cancels once the rest is recorded, before the run ends, fires `child_completed` before
`session_end`" (red with `Run.childCompletionsSettled` removed).

Not driven in the built app or live: the live-run scenarios configure no lifecycle hook, and the note was found by
reading the code.
