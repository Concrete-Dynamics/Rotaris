## A raise after a child's terminal transition never releases its parent

The settle at the end of `IterationChildren.execute` moves the child to its terminal state first, then writes
REQ-ORCH-098's teardown, then awaits the `child_completed` hook (`deps.hooks.fireLifecycle`), and only then calls
`this.scheduler.settled(...)`, which fires the terminal listeners and resolves the `wait_for_tasks` waiters. If anything
between the transition and that call raises — the hook port is an interface, and the run guards its own
`session_end` call to the same port with a `try`, so a raise from it is expected somewhere — the raise reaches
`executeSettling`, which hands it to `settleRaised`. `settleRaised` finds the child already terminal, warns, and
returns without calling `scheduler.settled`. The parent waiting in `runWithChildren`'s resume loop, or in a
`wait_for_tasks` on that child, is then never released by it, and the run waits on a child that has ended.

The repair of
[`a-child-completed-hook-can-finish-after-its-iteration-ends.md`](a-child-completed-hook-can-finish-after-its-iteration-ends.md)
(2026-09-29) changes one case. A parent that finds a child ended on its own now waits for that child's settle
(`IterationChildren.settles`). The settle's mark ends in a `finally`, so a raise from the hook does not hold that
parent. A parent waiting for `scheduler.settled` itself is still not released.

Calling `scheduler.settled` on that branch is not obviously safe: the same branch is taken for a child the user
cancelled (REQ-ORCH-133), whose cancel path already fired the terminal listeners, and firing them twice could deliver
its report to the parent twice. Which of the two a terminal child reaching `settleRaised` was is not recorded.

Noticed 2026-09-29 by the verifier of the repair of
[`a-child-whose-execution-raises-before-its-turn-stays-running.md`](a-child-whose-execution-raises-before-its-turn-stays-running.md)
(R-067), and recorded by its repairer. Established by reading the code; not driven.

## Specs

- `REQ-ORCH-052`: no child is left without its settle; a child that ended with its parent still waiting on it breaks
  the same promise from the other side.
- `REQ-ORCH-048`: terminal-state callbacks fire for every child that reaches a terminal state.
- `REQ-TOOLS-156`: `wait_for_tasks` resolves when every task in its set is terminal.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — the settle at the end of `execute` (transition, teardown, hook,
  then `scheduler.settled`), and `settleRaised`'s early return for a terminal child.
- `packages/engine/src/children/scheduler.ts` — `settled`, which fires the terminal listeners and resolves the waiters.
- `packages/engine/src/hooks-port.ts` — `fireLifecycle`, whose contract does not say it never raises.

## Outcome — repaired 2026-09-30 under R-067

Confirmed on `fix-accept1-11` (from origin/main 47d9acc) before the repair: three tests, each with a hook port whose
`child_completed` raises, went red on the unrepaired code — a foreground delegation's wait never resolved, a parent
waiting in its resume loop for a background child was never resumed, and a child settled by `settleRaised` after its
parent began waiting never released that wait. Each child had ended (`succeeded` or `failed`) and its parent waited on.

Both settles now end through one tail, `IterationChildren.afterTerminal` (`packages/engine/src/children/orchestration.ts`).
Once the child has made its terminal move it writes REQ-ORCH-098's teardown, runs the `child_completed` hook, and then
tells the scheduler (`scheduler.settled`) **in a `finally`**, so the terminal callbacks fire (REQ-ORCH-048) and every
wait on the child is released (REQ-TOOLS-156) whatever raised before it. A raise out of the hook port is caught there and
reduced to a warning naming the child — REQ-HOOKS-079: the occurrence completes, the child's terminal status is
unaffected, and no error reaches an agent — as the run already did for `session_end`. A raise out of the teardown is
re-raised after the scheduler is told, and reaches `settleRaised`, which finds the child terminal and only warns.

The question the note left open — whether `settleRaised`'s terminal branch could call `scheduler.settled` without
delivering a cancelled child's report twice — no longer arises: whatever made a child terminal has told the scheduler
itself (the user's cancel did already; a settle now always does), so that branch correctly tells it nothing.

Pinned by `packages/engine/src/children/children.test.ts`, the describe "the repair of
a-raise-after-a-childs-terminal-transition-never-releases-its-parent": the settle in `execute` under a foreground wait
and under the resume loop, and the settle in `settleRaised` under a foreground wait (the child held behind a model slot
of one so that it starts, and raises, only once its parent is waiting). Each also asserts the hook fired once per child,
the report reached the parent once, and the iteration closed. No proof or live-run scenario shows it: the product's hook
engine (`packages/hooks/src/engine.ts`) is written so that `fireLifecycle` completes (REQ-HOOKS-079), so the defect is
reachable only through a port that raises anyway, which only a unit test can supply. Repaired 2026-09-30 under R-067.

