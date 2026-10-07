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
[OQ-213](../architecture/open-questions.md) (R-072).

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
