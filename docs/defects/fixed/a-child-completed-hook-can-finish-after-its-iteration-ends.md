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
own still settling. No case pinned that route in this repair. The fifth round's landing case, below, pins it.

A hook that raises still leaves a parent waiting in the resume loop or in `wait_for_tasks` unreleased. The mark now ends,
so a parent that found the child ended on its own goes on, but `scheduler.settled` is still not called. That is recorded
in [`a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md`](../a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md).

## Found by the verifier's fifth round — 2026-09-29, and repaired

The claim above, "a parent takes a child as ended only once that settle is done", was false of the repair as it stood.
Each wait took the settles running when it began and awaited them once. While a parent waited on one child's hook, a
second child could end and start its own hook. When the first hook ended, the parent went on without looking again:
- `wait_for_tasks` found its whole set ended and returned both reports;
- `runWithChildren`'s loop took both children as newly ended;
- an agent whose loop had ended returned, so the iteration could reach `iteration_end` while the second hook ran.

The verifier reproduced the first two with probe tests. Both recorded this order before the second hook was released:
1. `session_start` started and ended;
2. the root's first and second model calls;
3. `child_completed(first)` started;
4. `child_completed(second)` started;
5. `child_completed(first)` ended;
6. the root's third model call, given the second child's report while its hook still ran.

In those probes the root's own loop end waited again and held `iteration_end` back. That did not hold for the third
route, where an agent's loop had already ended.

The repair is in `IterationChildren.settlesOf`, which all four waits use. Once the settles it waits on end, it looks
again, and it resolves only once none of its tasks is settling. A task settles once, so the wait ends. It still returns
null when none is settling, so an agent with nothing to wait for does not yield. So the claim above now holds, and so do
the runtime view's "the hook finishes before the parent is given the report" and the views README's entry.

The second wait in `wait_for_tasks` looks again for a narrower reason. When the last settle of its set releases the
scheduler's wait (`Scheduler.waitFor`), every settle of the set has already begun. A child's terminal move and the start
of its settle run in one synchronous stretch. But a rest releases that wait early (`Scheduler.hold`). After that, a
task of the set can still end and start its settle, for example a child whose limit expired, which the rest does not
stop. This is established by reading the code; no case drives it.

Evidence is four new cases in the same describe. The first three hold two children's hooks:
- `wait_for_tasks` waiting on the first child's hook while the second ends and starts its own (the verifier's first
  probe);
- the resume loop waiting on the first child's hook while the second ends and starts its own (the verifier's second
  probe);
- a root whose turn fails while the first child's hook runs, the second then ending and starting its own;
- REQ-ORCH-088: a child that lands at its own limit while a child of its own is still in its hook (the route the
  repair above left unpinned). It holds one hook.

With `settlesOf` back to a single wait, the three two-hook cases fail, in five runs of five. With the repair, all ten
cases pass. The mutation pass was repeated over the repaired code, removing each wait in turn:
- the first wait in `wait_for_tasks`: the one-child wait case fails;
- the second: the two-child wait case fails;
- the wait in the loop: the fresh, resume and normal-settle cases fail, and so does the resume-loop two-hook case;
- the wait at the loop's end: the failed-turn case, the failed-turn two-hook case and the landing case fail.

Repaired 2026-09-29 under R-067.
