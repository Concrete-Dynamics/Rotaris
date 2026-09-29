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
[`a-child-completed-hook-can-finish-after-its-iteration-ends.md`](fixed/a-child-completed-hook-can-finish-after-its-iteration-ends.md)
(2026-09-29) changes one case. A parent that finds a child ended on its own now waits for that child's settle
(`IterationChildren.settles`). The settle's mark ends in a `finally`, so a raise from the hook does not hold that
parent. A parent waiting for `scheduler.settled` itself is still not released.

Calling `scheduler.settled` on that branch is not obviously safe: the same branch is taken for a child the user
cancelled (REQ-ORCH-133), whose cancel path already fired the terminal listeners, and firing them twice could deliver
its report to the parent twice. Which of the two a terminal child reaching `settleRaised` was is not recorded.

Noticed 2026-09-29 by the verifier of the repair of
[`a-child-whose-execution-raises-before-its-turn-stays-running.md`](fixed/a-child-whose-execution-raises-before-its-turn-stays-running.md)
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
