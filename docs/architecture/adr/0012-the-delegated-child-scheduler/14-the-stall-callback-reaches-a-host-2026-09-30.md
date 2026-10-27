# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — The stall callback reaches a host — 2026-09-30: the watchdog's badge, the root's watch and the steer

Part 14 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## The stall callback reaches a host — 2026-09-30: the watchdog's badge, the root's watch and the steer

*The first execution of the stall watchdog above left three things unbuilt: its callback reached no host, so no badge drew;
the root was not watched; and REQ-MONITOR-135's stall-evaluation leg (ADR-0010 reading (d)) had nothing to hang on.
Acceptance round 1 found them together (finding A6,
[`a-stalled-child-is-never-shown-stalled.md`](../../../defects/fixed/a-stalled-child-is-never-shown-stalled.md)), and their
first execution reports here, under R-067.*

**What was built.** Every evaluation hands the host the agent's silence while it is stalled, else null; it is kept beside
the agent's tool activity and carried as `AgentRecord.stalledSeconds`, the root's as `SessionRecord.entryStalledSeconds`,
and the record is republished whenever it changes (`ProjectionOwner.refreshRecord`). The agent trees, the Mission table,
the persona window and the inspector draw it. `Run.turn` arms a watch for the root over its whole execution. An evaluation
that finds a steer pending for an agent waiting on its own children wakes it to take a step. The readings are **OQ-153**.

**What the execution found.** The decision held: the callback needed only a place to put the figure and a way to publish
it, both of which the activity tracker and the projection owner already had. Three things the record did not anticipate:
- **The root's wait on its children is not silence.** A root watched over its whole execution reads every wait on its
  children as a stall. The watch counts nothing between the root's turns (`betweenTurns`, the mechanism another branch of
  this round builds for a child's own wait).
- **Within a turn, an evaluation has nothing to inject.** The step boundary already delivers a steer at the next step, and
  nothing may join a conversation between a call and its result. What the evaluation leg adds is the agent with no next step
  coming: one waiting on its children.
- **A stall can end with the watch.** The live run's root answered on the retry and its turn ended before the next
  evaluation, so its stall was never logged recovered. ~~`StallWatch.stop` now reports a stall under way as recovered.~~
  *(Corrected 2026-09-30 by acceptance round 1's verifier: reported so, a cancelled, stopped, paused or timed-out stalled
  agent was logged "active again after a stall", which it was not.)* `StallWatch.stop` ends a stall under way and reports
  it recovered only when the agent was active after the evaluation that last found it stalled — a model event that is not
  an error, or something the run gave it; the same holds at an evaluation that finds the agent between its turns.
- **A resumed root can begin between its turns.** A root resumed into waiting (PD-ORCH-005 clause 4) takes no step until a
  child's report; its watch, armed as its execution began, counted that wait as silence until `Run.turn` marked it between
  turns from the start (found by acceptance round 1's verifier).

**What was measured.** Four end-to-end cases through `Sessions` in `children.test.ts`: a child's figure published at 90, 95
and 100 s and cleared; the root's warning, `stall` issue, figure and recovery; a root waiting on a working child writes no
`stall` issue; a steer to the waiting root lands at the next evaluation, before its child ends. Three fail on the
unrepaired engine, and the fourth fails with `betweenTurns` removed from the root. `stall.test.ts` pins the refresh a
delivered steer makes and the recovery at `stop` — reported only after activity since the stall (the verifier's
round added a cancelled stalled root with no recovery line and a root resumed into waiting with no `stall` issue to the
end-to-end cases); `agent-clock.test.ts` and `agents.test.ts` the badge on each surface. The
live run's `faults` scenario against `katalyst` (packs `2026-09-30T21-36-48-442Z` and `2026-09-30T21-42-06-872Z`) stalls
the root's stream: the root's watch wrote its `stall` issues from 94 s, inside the product's 120 s idle bound, where before
nothing was written until the bound fired. The second pack, built after the `stop` repair, logs the recovery 30 s later, and
its photograph at 115 s shows the inspector following the root with `running · 1m 53s · 0 tool calls · stalled 104s`. The
line broke between `stalled` and its figure, so the badge's text now joins them with a no-break space; that change came
after the pack and is pinned by `agent-clock.test.ts` only.

**What was not measured.** No live scenario stalls a child's stream, so a child's badge is shown by the cases alone. No live
scenario steers an agent waiting on its children. The row is in [`../first-executions.md`](../../first-executions.md).
