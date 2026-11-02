## The coordinator keeps no todo list of its own on multi-step work

A coordinating entry role can take on a task's second work item (a second `delegate` call, or on a direct-work grant a
second call that writes workspace files or runs commands) without ever writing a todo list of its own. REQ-ORCH-029's
clause "work spanning more than one step is accompanied by a todo list it keeps current" reaches the model only as
instruction text: the built-in coordinating persona says so (`ORCHESTRATOR_COORDINATING`) and so does the direct-work
instruction (`DIRECT_WORK_INSTRUCTION`), and nothing the run does holds it. A configured `system_prompt` replaces that text
whole (REQ-CONFIG-100), and a model that skips it meets no check: the run's planner plan, which REQ-ORCH-004 writes on every
run, is not a list the coordinator keeps, and REQ-ORCH-075's success check (`openPlanItems`) reads the coordinator's own plan,
so `openPlanItems(null)` holds nothing against a coordinator that never planned.

Live-run finding K2 (the final default live runs of 2026-10-06 and 2026-10-07, packs at `c2fdd6a` and `c2a9444`): on 3 of
the 6 multi-step runs (edit, resume, frictions) the coordinator delegated more than once and wrote no plan; the task-plan
strip read "Planner plan" with one row, the prompt itself, and the inspector read "todo not used". On the requirements and
terminal runs it planned unasked and the strip read "Agent plan". Ruled under the owner's delegation on 2026-10-07 as
[OQ-213](../../architecture/open-questions.md) (R-072).

## Specs

- `REQ-ORCH-029`: the constraints on the coordinator "MUST hold no matter what playbook cell or instruction text is in
  force, and each is externally checkable from the run's own records"; one of them is "work spanning more than one step is
  accompanied by a todo list it keeps current".
- `REQ-TOOLS-144` / `REQ-TOOLS-147`: the `todo` tool's list is the agent's own and "the run's primary progress display".
- `REQ-CHAT-085` / `REQ-CHAT-088`: the empty state promises "Agent-created tasks will appear during a run", and the plan
  the pane shows names its source.
- OQ-213 (ruled 2026-10-07): the list is the coordinator's own plan, "more than one step" is the task's second work item,
  and the run refuses that work item at dispatch until the entry role has written its list for the task.

## Relevant files

- `packages/engine/src/children/personas.ts` — `ORCHESTRATOR_COORDINATING`, `DIRECT_WORK_INSTRUCTION`: the clause as text.
- `packages/engine/src/run/run.ts` — `replaceAgentTodo`, `coordinatorPlan`, `openRootPlan`: the coordinator's plan and the
  success check that reads it.
- `packages/engine/src/run/todo.ts` — the planner `Task`, where the take-up record (`planExcused`) is already kept.
- `packages/agent-tools/src/gate.ts` — the one dispatch gate, where REQ-ORCH-153's refusal already sits.
- `apps/desktop/src/run-host/tools.ts` — the entry port that hands the gate the run's live checks.
- `packages/engine/src/sessions.ts` — the two `toolsFor` closures that build each agent's tool context.

## Repaired (2026-10-07, fin27)

OQ-213's ruling decides it: the list is the coordinator's own plan, "more than one step" is the task's second work item, and
the run refuses that work item at dispatch until the entry role has written its list for the task.

- `packages/agent-tools/src/todo-list-gate.ts` — `isWorkItem`: a `delegate` call, or on a direct-work grant a call of a public
  tool the registry declares as writing workspace files or running commands. `packages/agent-tools/src/gate.ts` refuses a
  work item after the plan-gate check and before the schema parse when `GateDeps.todoList.owed()` answers: `blocked`,
  `failure_kind: todo_list_owed`, no `tool_error` issue; a work item that reaches execution is counted (`started()`).
- `packages/engine/src/run/todo.ts` — `Task.workItems`, `Task.listWritten`, kept in the stored todo beside `planExcused` and
  removed when the task completes or is given up on. `packages/engine/src/run/run.ts` — `todoListOwed` (the refusal,
  `TODO_LIST_OWED_TEXT`, and the warning citing REQ-ORCH-029), `workItemStarted`, `todoListUnavailable` (one warning per run
  where the entry role holds no `todo`), and `replaceAgentTodo` setting `listWritten` for the current task, or in a plan cycle
  for every task it plans. Nothing applies under `single`, in a plan cycle, or to a person's edit of the plan.
- `packages/engine/src/sessions.ts` — the depth-0 context's `todoList` in both `toolsFor` closures;
  `apps/desktop/src/run-host/tools.ts` hands it to the entry gate only where the resolved set holds `todo`.

Pinned by `packages/engine/src/run/coordinator-plan.test.ts` (the OQ-213 block: twelve cases, six red with the check
answering nothing), `packages/agent-tools/src/gate.test.ts` (eight cases, four red without the gate's check) and
`apps/desktop/src/run-host/tools.test.ts` (three cases, a configured `system_prompt` among them, one red without the wiring).
The built app shows it in `pnpm mission-proof` item 1c (a scripted coordinator's calls read `delegate:ok`,
`delegate:blocked:todo_list_owed`, `todo:ok`, `delegate:ok`; two children; no `tool_error`; the warning in the log), and the
proofs whose scripted coordinator delegates more than once (mission, transcript, mcp, artifacts) open with the scripted
client's new `plan` step. The live run's harness checks it over every session it keeps
(`apps/desktop/scripts/lib/coordinator-todo.mjs`). What the
orchestrator's next default live run should show: on the edit and resume runs a coordinator that delegates twice before
planning has its second `delegate` refused once (a `blocked` row and a session-log warning citing REQ-ORCH-029), writes a
plan and repeats the call; every multi-step coordinating session stores an agent plan and the task-plan strip reads "Agent
plan"; requirements and terminal, which planned unasked, show no refusal.
