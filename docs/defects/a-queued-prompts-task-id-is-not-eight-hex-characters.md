## A queued prompt's task id is not an 8-character hexadecimal id

`Run.consumeQueued` appends each triggered queued prompt to the planner todo with the prompt's own id as the task id
(`this.todo.appendTask('Queued Prompts', p.prompt_id, …)`). A prompt id is a full UUID (part-j-proof's queue scenario stores
the task as `{ id: "36d4b6fa-…", … }`), so the task's backend id is 36 characters with hyphens, where REQ-CHAT-089 fixes
every backend-assigned task id as 8 lowercase hexadecimal characters. Its name, "Queued Prompt: <first 8 characters of the
prompt id>" (REQ-CHAT-040), already uses only the first eight; the id does not. Whether the other `appendTask` callers
(`Run`'s 'Continued Prompts' task, whose id is `deps.taskId`) mint ids of the required form was not checked.

Noticed 2026-10-01 by the verifier of the repair of
[`a-queued-prompts-task-is-not-named-queued-prompt.md`](fixed/a-queued-prompts-task-is-not-named-queued-prompt.md)
(acceptance A28, R-067), and written here by its repairer. Not repaired: out of that task's scope.

## Specs

REQ-CHAT-089 — "Task and phase ids assigned by the backend MUST be 8-character hexadecimal strings, fixed when the task or
phase is created and unchanged thereafter … The hexadecimal digits MUST be lowercase". A repair has to keep the task
traceable to its prompt some other way (the `prompt_triggered` timeline entry carries the full `prompt_id`), since the
first eight characters of two prompt ids may collide.

## Relevant files

- `packages/engine/src/run/run.ts` — `consumeQueued`, which passes `p.prompt_id` as the task id.
- `packages/engine/src/run/todo.ts` — `Todo.appendTask`, which stores the id it is given.
- `packages/engine/src/session-writer.ts` — `triggerQueuedPrompts`, where the prompt id is recorded on the timeline.
