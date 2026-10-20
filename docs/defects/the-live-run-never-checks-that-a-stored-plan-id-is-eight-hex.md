## The live run never checks that a stored plan id is eight-hex

Recorded 2026-10-20 by loc1 (bundle `loc1-todo-reader`) from fin47's reviewers' optional finding on bundle `fin47-accept1-6`,
which left it unrecorded.

fin47's finding A6 (`docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md`) was a `replace` storing a
new task under the id its model sent (`impl101`, `test101`, `doc101`, `verify101` in the 3c03287 swarm session). Its repair is
pinned by `tools.test.ts`, but no check of the live run reads the ids a coordinating session's plans store: a recurrence — a new
path that keeps a model's id, or a regression of `resolveIds` — would pass every live check and be seen only by an autopsy that
happens to read `sessions.todo`. The three Todo-state checks would not catch it either, since `todoStates` reads any id since
finding A7.

## Specs

REQ-TOOLS-144: phases and tasks "both carry stable auto-generated 8-hex-character ids". The product meets it as built; the gap
is the live run's, which asserts nothing of it.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `checkCoordinatorTodo`, which reads each kept session's stored plan and its children's.
- `apps/desktop/scripts/lib/coordinator-todo.mjs` — `rootAgentPlan` and `planItemIds` read the plans; nothing holds their ids to
  REQ-TOOLS-144's shape.
- `AGENTS.md` — the paragraph on the readings over every session.
