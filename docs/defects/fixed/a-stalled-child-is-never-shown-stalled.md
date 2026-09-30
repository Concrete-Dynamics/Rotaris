## A stalled child is never shown stalled

Since 2026-09-29 each delegated child's execution runs a stall watch (`StallWatch`). It writes a warning and a `stall`
issue when the child goes silent, and it calls its stall callback on every evaluation with whether the child is
stalled. `IterationChildren.execute` passes that callback nowhere. No host listens to it, so:
- nothing reaches the child's `AgentRecord`;
- no surface draws a stalled badge, a stalled activity text or a countdown that advances with each evaluation;
- a recovery is written as a session-log line (`child stall recovered: …`) through the run's `warn` (OQ-127), and is
  not notified to any surface.

The entry agent (the root) is not watched at all. The watch is built into a child's execution only, and wiring it into
the root's turn would mean editing `Run.turn`, which another bundle owned in the round that built the watch.

The same missing listener leaves REQ-MONITOR-135's stall-evaluation leg unbuilt: no steering prompt is injected from a
stall evaluation. ADR-0010 reading (d) records that leg as waiting on the stall detector, which now exists.

Noticed 2026-09-29 while building the watch under R-067
([`a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`](a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md)).
Established by reading the code: nothing in `packages/engine/src/run/run.ts`, `sessions.ts` or the run host passes a
stall callback.

## Specs

- `REQ-ORCH-089`: "a stall callback fires on each evaluation with stalled/recovered so a UI badge can update". The
  callback fires, and no UI can update from it.
- `REQ-MONITOR-119`: every stall evaluation must "invoke the host's stall callback", which "fires on every evaluation
  … so a host countdown advances at that rate". `REQ-MONITOR-120`: "When activity resumes, recovery must be logged and
  notified." It is logged and not notified.
- `REQ-MONITOR-117`: "Each agent is evaluated for a stall". The root is not.
- `REQ-MONITOR-135`: injection "opportunistically from stall evaluations".
- `REQ-TUI-139` describes the stalled activity text for the terminal interface. Which surface of this product owes a
  badge is for `REQ-SHELL-023`'s surfaces to say. OQ-127 records the readings the watch was built under.

## Relevant files

- `packages/engine/src/children/stall.ts`: `StallWatch`, with its `evaluated` sink.
- `packages/engine/src/children/orchestration.ts`: `execute`, where the sink is a no-op.
- `packages/engine/src/run/run.ts`: `Run.turn`, the root's turn, which has no watch.
- `packages/engine/src/sessions.ts`: `toAgentRecord`, where a stalled state would reach the record.

## Repaired 2026-09-30 under R-067 (acceptance finding A6)

**Confirmed first.** Three end-to-end cases through `Sessions` failed on the unrepaired engine: a stalled child's record
carried no figure, the stalled root wrote no `stall` issue and its record carried nothing, and a steer to a root waiting on
its child landed only when the child ended.

**What changed.**
- *The callback reaches the host.* `IterationChildren.stallEvaluated` keeps each evaluation's silence while stalled, else
  null, in `AgentActivity.stalled`, and `ProjectionOwner.refreshRecord` republishes the record whenever it changes. It is
  `AgentRecord.stalledSeconds`, and the root's `SessionRecord.entryStalledSeconds`. The figure advances at the watch's
  cadence, and clears at the recovery (REQ-MONITOR-119/120/122).
- *The badge.* The Workspace and Mission agent trees, the Mission table and the persona window draw `stalled Ns` in the
  design system's `tag-wait`, as the mockup's agents panel qualifies a waiting row. The inspector's meta line ends with the
  same words, for a child and for the run-level agent. The activity text stays REQ-MONITOR-047's.
- *The root is watched.* `Run.turn` arms a `StallWatch` over the root's execution: its role's `stall_timeout`, else
  `runtime.child_stall_timeout`, else 90 s. It writes the warning, the `stall` issue and the log lines naming `agent`, and
  counts no silence between its turns (`betweenTurns`).
- *REQ-MONITOR-135's leg.* An evaluation that finds a steer pending for an agent waiting on its own children wakes it
  (`wakeForSteering`), and the step it takes injects the steer. Every delivered steer restarts the watch's silence.
- *A stall that ends with its watch* is reported recovered (`StallWatch.stop`), found by the live run.

The readings are **OQ-153**, put to the owner.

**Pinned by** `packages/engine/src/children/children.test.ts`, "REQ-ORCH-089 / REQ-MONITOR-117..122 / REQ-MONITOR-135, the
repair of a-stalled-child-is-never-shown-stalled: …" (four cases; three fail on the unrepaired engine, the fourth with
`betweenTurns` removed from the root), `stall.test.ts` (the refresh a steer makes, the recovery at `stop`), and
`packages/ui/src/agent-clock.test.ts` and `agents.test.ts` (the badge on each surface, and none once recovered).

**Shown in the built app** by the live run's `faults` scenario against `katalyst`, whose stalled stream is the root's. Its new
check reads REQ-MONITOR-119's `stall` issues for `orchestrator` from 94 s, inside the product's 120 s idle bound, where the
first live run (2026-09-29) recorded nothing until the bound fired. Packs `.live-run/runs/2026-09-30T21-36-48-442Z/` and
`.live-run/runs/2026-09-30T21-42-06-872Z/`. The second, built after the recovery at `stop`, logs `agent stall recovered` 30 s
after the first warning, and its photograph `faults-stall.stalled.png`, at 115 s, shows the inspector following the root:
`running · 1m 53s · 0 tool calls · stalled 104s`. That line wrapped between `stalled` and its figure, so the text now joins
them with a no-break space, after the pack; `agent-clock.test.ts` pins it. No live scenario stalls a child's stream or steers
an agent waiting on its children; the cases are the evidence there.
