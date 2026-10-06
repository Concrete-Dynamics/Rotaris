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
