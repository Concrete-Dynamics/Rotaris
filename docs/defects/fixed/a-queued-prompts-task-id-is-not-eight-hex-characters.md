## A queued prompt's task id is not an 8-character hexadecimal id

`Run.consumeQueued` appends each triggered queued prompt to the planner todo with the prompt's own id as the task id
(`this.todo.appendTask('Queued Prompts', p.prompt_id, …)`). A prompt id is a full UUID (part-j-proof's queue scenario stores
the task as `{ id: "36d4b6fa-…", … }`), so the task's backend id is 36 characters with hyphens, where REQ-CHAT-089 fixes
every backend-assigned task id as 8 lowercase hexadecimal characters. Its name, "Queued Prompt: <first 8 characters of the
prompt id>" (REQ-CHAT-040), already uses only the first eight; the id does not. Whether the other `appendTask` callers
(`Run`'s 'Continued Prompts' task, whose id is `deps.taskId`) mint ids of the required form was not checked.

Noticed 2026-10-01 by the verifier of the repair of
[`a-queued-prompts-task-is-not-named-queued-prompt.md`](a-queued-prompts-task-is-not-named-queued-prompt.md)
(acceptance A28, R-067), and written here by its repairer. Not repaired: out of that task's scope.

**Repaired 2026-10-01.** The other callers had the same fault: the first run's task was `<session>:main:1` (`Sessions.start`)
and a continue's `<session>:continued:<n>` (`continuedTaskId`); a planner phase had no id at all, the plan showing its name
in that place. Every backend task and phase id is now minted by `mintTodoId` (`packages/engine/src/run/todo.ts`): 8
lowercase hexadecimal characters, unique within the todo (its tasks' and phases' ids) and among the task ids the session's
iterations recorded — the first run's task, a continue's, a queued prompt's (`Run.consumeQueued`), a todo edit's added task
(live and at rest; the id a request sends is no longer recorded), and each phase `Todo` creates (`Phase.id`, shown by
`projectPlannerTodo`, by which an edit names its phase). The queued prompt stays traceable by its task's name and by the
`prompt_triggered` timeline entry, which carries its full id. A record written under the old forms reads back unchanged:
an id is compared, never parsed, and a phase with no id is shown and edited by its name. Pinned by
`packages/engine/src/run/message-task.test.ts` ("every task and phase id a run appends is 8 lowercase hexadecimal
characters…", which failed on `S-msg-1:main:1` before the repair), `run/todo.test.ts` (`mintTodoId`, phase ids, an old
document edited by phase name), `todo-view.test.ts` and `control.test.ts`; `part-j-proof`'s queue scenario asserts every
stored task and phase id has the form, finds the iteration that took the prompt up by its task's id (it compared the
iteration's `todo_task_id` with the prompt's UUID), and finds the prompt by its timeline entry.

## Specs

REQ-CHAT-089 — "Task and phase ids assigned by the backend MUST be 8-character hexadecimal strings, fixed when the task or
phase is created and unchanged thereafter … The hexadecimal digits MUST be lowercase". A repair has to keep the task
traceable to its prompt some other way (the `prompt_triggered` timeline entry carries the full `prompt_id`), since the
first eight characters of two prompt ids may collide.

## Relevant files

- `packages/engine/src/run/run.ts` — `consumeQueued`, which passes `p.prompt_id` as the task id.
- `packages/engine/src/run/todo.ts` — `Todo.appendTask`, which stores the id it is given; `mintTodoId` since the repair.
- `packages/engine/src/sessions.ts` — `start`'s `<session>:main:1` and `continuedTaskId`'s `<session>:continued:<n>`.
- `packages/engine/src/session-writer.ts` — `triggerQueuedPrompts`, where the prompt id is recorded on the timeline.
