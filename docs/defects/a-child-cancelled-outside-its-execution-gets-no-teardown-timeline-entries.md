## A child cancelled outside its execution gets no teardown timeline entries

Since the repair of
[`a-child-that-never-started-gets-no-teardown-timeline-entries.md`](fixed/a-child-that-never-started-gets-no-teardown-timeline-entries.md)
(2026-09-30, R-067), REQ-ORCH-098's `child_end`, `child_result` and `child_conversation_closed` are written for a child
settled by its own execution (`IterationChildren.execute`, `settleRaised`) and for one the scheduler settles
(`Scheduler.cascadeBlocked`, `Scheduler.finalizeIncomplete`). Every other path that settles a child `cancelled` writes a
report and none of the three:
- the user's cancel of one child and its live descendants (`IterationChildren.cancel`, REQ-ORCH-133 / REQ-MONITOR-128).
  It writes `child_user_cancelled`; a running child's execution then finds its record terminal and returns without a
  teardown, and a queued one never runs. A case in `children.test.ts` ("a child cancelled while it summarises keeps the
  cancellation's report …") asserts that no `child_end` is written, as its evidence that the summariser wrote nothing
  over the cancellation;
- the cancel of a paused child while its session rests (`Sessions.cancelPausedAtRest`, PD-ORCH-005 clause 16);
- "continue without them", the decline of a resumable iteration (`Run.cancelPausedAgents`, PD-ORCH-005 clause 6);
- the crash record of an accepted cancel (`recordAcceptedCancel`, `run/crash.ts`);
- the settle of a child a previous run left (`settleStaleChildren`, REQ-ORCH-053).

Noticed 2026-09-30 while repairing the note above, under R-067. Established by reading the code; not driven.

## Specs

- `REQ-ORCH-098`: "Whatever terminal state a child reaches … that child MUST be fully torn down: its conversation is
  closed, a `child_conversation_closed` timeline event is emitted for it, …". `cancelled` is a terminal state
  (REQ-MONITOR-300), and none of these paths emits the event.
- `OQ-152` records the reading the repair above built: every terminal child is torn down alike, whether or not it
  started. The last three paths run where no `IterationChildren` is at hand, and the first's test would change what it
  asserts.

## Relevant files

- `packages/engine/src/children/orchestration.ts`: `cancel`, `settleStaleChildren`, and `writeTeardown`, the one
  writer of the three entries.
- `packages/engine/src/sessions.ts`: `cancelPausedAtRest`.
- `packages/engine/src/run/run.ts`: `cancelPausedAgents`.
- `packages/engine/src/run/crash.ts`: `recordAcceptedCancel`.
- `packages/engine/src/children/children.test.ts`: the summarising-cancel case that asserts no `child_end`.
