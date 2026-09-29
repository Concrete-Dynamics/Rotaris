## A child's `child_completed` hook can finish after its iteration ends

A child's settle comes in two forms: the one at the end of `IterationChildren.execute`, and `settleRaised`. Each one:
1. moves the child to its terminal state;
2. writes REQ-ORCH-098's teardown;
3. awaits the `child_completed` hook;
4. only then tells the scheduler (`scheduler.settled`), which wakes a parent waiting on the child.

A parent that finds the child ended on its own does not wait for that. There are three ways it can:
- `runWithChildren` takes every child the ledger shows terminal and unobserved;
- `wait_for_tasks` returns at once when the ledger shows its whole set terminal;
- a wait on several tasks is released by the last settle, while another task of the set still runs its hook.

Nothing at an iteration's end waits for a child's execution unless a rest or a stop is under way (`rest`, `outlast`).
So the parent was given the child's report, and the run went on to `iteration_end` and `session_end`, while the hook
still ran.

A child settled by `settleRaised` hit this every time, because the raise settles it at once. It happened on both paths:
- the fresh path, where the tool port cannot be built;
- the resume path, where the record does not decode.

On the resume path, the hooks started and ended in this order:
1. `session_start` started and ended;
2. `child_completed` started;
3. the root was given the report;
4. `iteration_end` started and ended;
5. `session_end` started and ended;
6. `child_completed` ended, only once the test released it.

A child settled at the end of its own execution hit it in two cases: it ended while its parent was still in its turn,
or its parent's `wait_for_tasks` found it ended.

The builder of the repair of
[`a-child-whose-execution-raises-before-its-turn-stays-running.md`](a-child-whose-execution-raises-before-its-turn-stays-running.md)
noticed it on 2026-09-29, while writing that repair's "the rest waits for the settle" test, and did not record it. The
verifier's fourth round reproduced it with two probe tests, each holding the hook for 300 ms, and asked for it to be
recorded or repaired. It was repaired under R-067 the same day.

## Specs

- `REQ-HOOKS-076` says: "In a run in which all five events occur once, the order is `session_start`,
  `child_completed`, `verifier_finished`, `iteration_end`, `session_end`, matching where each occurs." A
  `child_completed` hook still running at `session_end` breaks that order.
- `REQ-HOOKS-080` says: "Lifecycle hooks SHALL run in line with the run loop: a hook that consumes its whole budget
  holds the run up for that long". A hook the parent does not wait for holds nothing up.
- `REQ-HOOKS-003` fires `child_completed` "once a delegated child agent has finished". That places the hook at the
  child's end, not after the run's end.

## Relevant files

- `packages/engine/src/children/orchestration.ts`:
  - the settle at the end of `execute`, and `settleRaised` (terminal move, teardown, hook, then `scheduler.settled`);
  - `runWithChildren` and `waitForTasks`, which read the ledger's terminal state;
  - `track` and `executing`, which only a rest (`rest`) and a stop (`outlast`) await.
- `packages/engine/src/children/scheduler.ts`:
  - `settled`, which wakes a waiting parent and releases the `wait_for_tasks` waiters;
  - `waitFor`, which is released once the ledger shows every task of its set terminal.
- `packages/engine/src/run/run.ts`: `Run.turn`. At a normal end it finalizes the iteration's children and goes on to
  `iteration_end` without awaiting their executions.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. A settle's hook now runs in line. From the start of its hook until the scheduler is
told, the child is held in `IterationChildren.settles`: `beginSettle` puts it there, and a `finally` takes it out, so a
hook that raises ends it too. A parent takes a child as ended only once that settle is done (`settlesOf`):
- `runWithChildren` waits for any of its children's settles still running before it takes the children newly ended.
- An agent whose loop ends while a child of its own is still settling (for example, its own turn failed) waits for that
  settle before it returns. Its own settle, and the root's iteration end, come after it. A rest and a stop are left to
  their own waits (`rest`, `outlast`), which await the settles as executions.
- `wait_for_tasks` waits for the settles among its set before it checks whether the set has ended. It waits again after
  the wait itself, because the last settle releases that wait.

`Run.turn` is not changed. The root's `runWithChildren` no longer returns while one of its children's settles is still
running.

Evidence is the describe "REQ-HOOKS-076 / REQ-HOOKS-080, the repair of
a-child-completed-hook-can-finish-after-its-iteration-ends" in `packages/engine/src/children/children.test.ts`. Its six
cases each hold one child's `child_completed` hook and record when every lifecycle occurrence starts and ends:
- the fresh path: a background child whose tool port cannot be built;
- the resume path: a paused child whose record cannot be decoded;
- the normal settle: a child that ends while its parent is still in its turn;
- a root whose turn fails while the hook runs;
- `wait_for_tasks` naming a child whose settle is running;
- `wait_for_tasks` naming two children, where the second settles while the first one's hook runs.

Each case asserts two things. While the hook holds, neither the parent's next model call nor `iteration_end` (or
`session_end`) happens. Once the hook is released, the order is REQ-HOOKS-076's.

All six fail on the code before the repair. Removing each wait in turn fails the cases that pin it:
- the wait in the loop fails the first three;
- the wait at the loop's end fails the failed turn;
- each of the two waits in `wait_for_tasks` fails its own case;
- removing either settle's mark fails the cases whose child that settle settles.

The wait at the loop's end also covers a child that stops at its own limit (REQ-ORCH-088's landing) with a child of its
own still settling. No case pins that route.

A hook that raises still leaves a parent waiting in the resume loop or in `wait_for_tasks` unreleased. The mark now ends,
so a parent that found the child ended on its own goes on, but `scheduler.settled` is still not called. That is recorded
in [`a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md`](../a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md).
