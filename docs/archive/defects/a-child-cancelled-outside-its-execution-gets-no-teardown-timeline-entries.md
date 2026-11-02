## A child cancelled outside its execution gets no teardown timeline entries

Since the repair of
[`a-child-that-never-started-gets-no-teardown-timeline-entries.md`](a-child-that-never-started-gets-no-teardown-timeline-entries.md)
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

## Outcome — repaired 2026-10-01

**Found the note true on the branch.** Six cases, one per path plus the summarising cancel, were red on the unrepaired code.
Each path wrote the cancelled child's report, and `child_user_cancelled` where it writes one, and no `child_end`,
`child_result` or `child_conversation_closed`. The paths are the user's cancel of a running child and its live descendant,
of a child while it summarises, of a paused child and its paused descendant at rest, "continue without them", the
stale-child settle, and the crash record of an accepted cancel.

**What changed.** Each of the five paths now tears the child down after the report it stores, through
`writeCancelledTeardown`: `IterationChildren.cancel`, `Sessions.cancelPausedUnderLock`, `Run.cancelPausedAgents`,
`recordAcceptedCancel` and `settleStaleChildren`. The three entries come in the settle's words, with the stored report's
status and summary, and after `child_user_cancelled` where the path writes one. The live cancel writes them before it tells
the scheduler, so they precede the terminal callbacks as a settle's do. A running child the user cancels has its execution
aborted, and that execution returns later. Its settle finds the record terminal and returns (`settle`'s early return,
`settleRaised`'s), so it writes no second triple. `writeTeardown` moved from `children/orchestration.ts` to
`children/ledger.ts`, beside `storeChildReport`, because the crash record and the stale settle run from the store alone,
with no `IterationChildren`. It now takes its time from the writer's own clock (`SessionWriter.wall`, a read-only accessor
added for it). OQ-152's reading, that every terminal child is torn down alike, now holds on every path that ends one.

**Pinned by** `packages/engine/src/children/children.test.ts`: the describe "the repair of
a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries: …" (the live cancel with a descendant, held
across the executions' return; "continue without them"; the stale settle), the clause 16 case "REQ-ORCH-098 (the repair of
…)", and the summarising case "REQ-ORCH-133 (found by phase 3's review): a child cancelled while it summarises …". The
summarising case used to assert that no `child_end` was written. It now asserts exactly one triple, in the cancellation's
words, after `child_user_cancelled`. In `packages/engine/src/run/crash.test.ts`, the case "REQ-ORCH-098 (the repair of
…): every agent the record ends cancelled is torn down once …" pins the accepted-cancel record. A second record writes
nothing. All six fail without the repair.

**Shown in the built app** by `pnpm mission-proof` (item 4, the user's cancel of `alpha` with its live descendant `sub`).
It now asserts that each cancelled child's own entries read `child_user_cancelled`, `child_end`, `child_result`,
`child_conversation_closed`, once each, in that order, and it passed on 2026-10-01 (`results.json`'s `cancel.teardowns`).
`part-j-proof`, which the triage named, drives no child cancel or decline: its "cancel" launch answers the message-limit
dialog. It was run and shows nothing of this. No live run was driven for it.

