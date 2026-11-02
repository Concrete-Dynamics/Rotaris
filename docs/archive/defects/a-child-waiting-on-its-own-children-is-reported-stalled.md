## A child waiting on its own children is reported stalled

A child that delegated in the foreground, or that the run resumes waiting on children from its record, waits inside
`IterationChildren.runWithChildren` between its turns. While it waits it has no model step and no tool call in
flight, so its `StallWatch` sees neither a model event nor an active call. Once the threshold passes, the watch reports
the child `stalled`: the warning says it "appears stalled … the run is still waiting on it", and every evaluation
writes a `stall` issue, although the child is working as designed and its children are the ones working. Noticed by
the verifier of the stall watchdog's build (2026-09-29, R-067), established by reading the code; not driven.

Its other half is repaired and is not this note: a child resumed after such a wait was blamed for it by REQ-NOTIFY-112's
recovery, and a resumed step that failed at once earned the corrective message. Since the verifier's second round
(2026-09-29) every turn the run starts for a child starts its silence again, so the recovery no longer reads the wait
(OQ-127; `children.test.ts`, "a child that waited on its own child past the window …"). What this note records — the
warning and the `stall` issues written during the wait — is unchanged.

## Specs

REQ-ORCH-089 and REQ-MONITOR-118/119 tell a stall from a wait only by "active tool calls"; they do not name a wait on
delegated children, which the watch then reads as silence. Whether that wait pauses the watch, or counts as waiting on
N active children at the informational level of REQ-MONITOR-118, is a reading OQ-127 does not yet state.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `execute`, where the watch is started per attempt, and
  `runWithChildren`, where the wait happens between turns.
- `packages/engine/src/children/stall.ts` — `StallWatch.evaluate`, which knows only tool calls in flight.

## Outcome

**Repaired 2026-09-30 under R-067** (acceptance finding A7, confirmed on the branch by a failing end-to-end case before
the change: `mid`, waiting 120 s on its child `leaf`, had a `stall` issue at every evaluation from 90 s, "no model event
or token for 90 … 120 seconds", its last model event `finish`).

- `StallWatch.betweenTurns` (`packages/engine/src/children/stall.ts`): once a child's turn ends and until the run starts
  its next (`activity`), an evaluation counts no silence. It reports no stall and no wait, calls the callback with *not
  stalled*, and ~~reports a stall under way when the turn ended as recovered~~ ends a stall under way when the turn
  ended, clearing its figure; it is logged recovered only when the agent was active after the evaluation that last found
  it stalled (`StallWatch.endStall`, OQ-153). *Corrected in place 2026-09-30, at the merge with origin/main (found by the
  verifier's review):* the first form read a turn's end as REQ-MONITOR-120's "activity resumes", which a turn that was
  cancelled, paused, timed out or failed is not. `execute`'s `turn` closure
  (`packages/engine/src/children/orchestration.ts`) calls it when each turn's promise settles, so a wait inside
  `runWithChildren` on the child's own children is outside the watch, and the next turn counts from its start.
- The second path this note names — a child the run resumes into waiting from its record (PD-ORCH-005 clause 4, its
  record ending on its own answer) — takes no step before its wait, so no turn settles: `execute` marks its watch
  between turns as it is armed, when the execution's start is resumed and waiting. *Corrected in place 2026-09-30:* the
  bullet above first read "a wait inside `runWithChildren` on the child's own children is outside the watch" of both
  paths, which was false of this one — a child paused while waiting on its child and continued had a `stall` issue at
  every evaluation of the wait and the warning (seven issues in 120 s, found by the verifier's review of the repair).
- The children it waits on keep their own watches: a silent child is still reported, by its own watch.
- The reading is OQ-155's, raised by this repair; OQ-127's two mentions of this note are corrected in place.
- Pinned by `children.test.ts`, "REQ-ORCH-089 / REQ-MONITOR-119 (OQ-155): a child waiting on its own child between its
  turns is not reported stalled; the child that is silent is, by its own watch", and `stall.test.ts`'s two cases for
  `betweenTurns`. All three fail with the `between` limb of `evaluate` reverted. The second `stall.test.ts` case,
  first "a stall under way when the turn ends is reported recovered at the next evaluation", is rewritten to the
  corrected reading as "REQ-MONITOR-120 (OQ-155 with OQ-153): a stall under way when the turn ends is over at the next
  evaluation between turns; it is logged recovered only when the agent was active after it"; the first form fails on
  origin/main's `endStall`, and the rewritten one fails on the first form's `evaluate`.
- The second path is pinned by `children.test.ts`, "REQ-ORCH-089 / REQ-MONITOR-119 (OQ-155) with PD-ORCH-005 clause 4:
  a child resumed into waiting on its own child is not reported stalled; the child that is silent is, by its own watch"
  (pause while `mid` waits on `leaf`, continue, 120 s with `leaf` silent in its resumed step): it fails without the mark
  in `execute`, `mid` then carrying seven `stall` issues.
