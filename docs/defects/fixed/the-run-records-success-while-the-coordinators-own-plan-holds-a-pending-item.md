## The run records success while the coordinator's own plan holds a pending item

A run ends `completed` / `tasks_complete` with "The run completed." although the coordinator's own plan (its tool-owned
todo, REQ-TOOLS-144) still holds an item that is not done. An iteration marks its planner task complete whenever the
root's turn reports `succeeded` (`Run.iterate`, `packages/engine/src/run/run.ts`), and the stop conditions read only the
planner's tasks (`stopCondition`, `packages/engine/src/run/stop-conditions.ts:84-90`, fed `this.todo.allTasksComplete`
and `this.todo.pendingCount` at `run.ts:1025`). The root's plan (`Run.agentTodo`, `packages/engine/src/todo-view.ts`'s
`AgentTodoDocument`) is never consulted, so the record says the run succeeded while the plan the Todo pane draws says it
did not.

Live-run finding: G5 of the final default live run at origin/main `27a5127` (2026-10-06).

## Specs

- `REQ-ORCH-029`: while the entry role acts as coordinator "it does not report the run successful while a todo item is
  non-terminal or while a todo item's recorded state disagrees with what happened", a constraint that "MUST hold no
  matter what playbook cell or instruction text is in force" and is "externally checkable from the run's own records".
- `REQ-ORCH-069` (1) and `REQ-ORCH-082` (3) read success off the planner's tasks; `REQ-ORCH-068` gives an iteration three
  ways to resolve its task (complete, given up on, returned to the pending queue).

## Evidence

Default pack `.live-run/runs/2026-10-06T01-30-08-282Z/` of the `live` worktree at `27a5127` (git-ignored; the self-hosted
endpoint), session `5bcf4f82` (`terminal`, classified `exploration`, so the orchestrator coordinated):

- `workspace.db`, `sessions.todo`: the planner task `c7b58194` is `complete`; the agent plan holds task `6cc673ca` "Run the
  sequence verbatim via a terminal-equipped specialist" `COMPLETED` and task `7762ee2b` "Report each command's outcome in
  one line" `PENDING`. The row reads `execution_status` `completed`, `stop_reason` `tasks_complete`.
- `terminal/terminal.png`: the header reads "Completed 3:48" beside the Todo pane's "1 of 2 tasks done".
- `terminal/transcript.md`: the closing system row reads "The run completed."

## Relevant files

- `packages/engine/src/run/run.ts` — `iterate()`: the `succeeded` branch marks the planner task complete; the loop's
  `stopCondition` call.
- `packages/engine/src/run/stop-conditions.ts` — `stopCondition`, `summarise`.
- `packages/engine/src/run/todo.ts` — the planner todo (`allTasksComplete`, `pendingCount`).
- `packages/engine/src/todo-view.ts` — the agent plan's document and the projection the Todo pane draws.
- `packages/ui/src/TodoPane.tsx` — `todoCountLabel`, the "1 of 2 tasks done" count.

## Repaired (2026-10-06, fin18)

REQ-ORCH-029 decides it: the coordinator does not report the run successful while a todo item is non-terminal, and
REQ-ORCH-069 (1) and REQ-ORCH-082 (3) read success off the planner's tasks, so a planner task must not be marked complete
while the coordinator's own plan holds an open item. Of REQ-ORCH-068's three resolutions the build takes the pending return
(the work is not done, and it is not given up on).

- `Run.iterate` (`packages/engine/src/run/run.ts`): a root that answers `succeeded` while its own plan holds an item that is
  neither `COMPLETED` nor `ABANDONED` (`openPlanItems`, `packages/engine/src/run/stop-conditions.ts`) has its task returned
  to the pending queue (`todo.requeue`), `iteration.end` closing `partial` with `planNotDoneSummary`, and the next
  iteration's fresh root is told the open items after its task (`planCarry`, REQ-ORCH-068's continuation payload). At the
  consecutive-retry limit the task is given up on: `lastFailure` names the open items and the session reads `failed`
  ("The run failed: the coordinator answered with 1 item of its plan not done: …", REQ-ORCH-082 rule 4), never
  `completed` / "The run completed.".
- Under a `single` override the entry role is the worker (REQ-ORCH-025) and REQ-ORCH-029 does not bind it: the override
  reaches the run as `RunDeps.coordinating` (`RuntimePosture.runOverride`, `packages/engine/src/sessions.ts`, filled by the
  run host's `runtimeFromConfiguration`, which already carried it), and such a run completes as before.
- The stop conditions are unchanged: with the task returned to the queue, `tasks_complete` cannot be reached while the
  plan is open. The Todo pane's count (`packages/ui/src/TodoPane.tsx`) is unchanged too; what changed is that a run the
  record calls completed now has a plan that reads every task done beside it.

The coordinator's plan is the session's (stored with the todo), so an item an earlier run left open counts for the next
run's iterations as well, and an item a person adds to the agent plan during the run counts like the coordinator's own.

Pinned by `packages/engine/src/run/coordinator-plan.test.ts`: a coordinator that answers with "Report each command's
outcome in one line" `PENDING` closes iteration 1 `partial`, its next root is told the item, completes it, and the run ends
`completed` / `tasks_complete` with the projected plan (the Todo pane's source, REQ-CHAT-088) reading every task `done`;
one that never finishes is given up on at the third iteration and the session reads `failed`; an `ABANDONED` item is
terminal; a `single` run completes on its first iteration. The first two fail without the repair (each run ended after
one `succeeded` iteration). The helpers by `packages/engine/src/run/run-pure.test.ts`. The built app shows the repair in
the next default live run's `terminal` scenario (the orchestrator's; an agent's live-run launch is refused).
