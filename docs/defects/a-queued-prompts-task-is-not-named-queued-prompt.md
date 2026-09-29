## A queued prompt's task is not named "Queued Prompt: <id>"

REQ-CHAT-040 and REQ-ORCH-071 have a queued prompt become a task **named** "Queued Prompt: <first 8 characters of the
prompt id>" that **carries the prompt text as its content**. The planner todo's task has one text and no name
(`Task` in `packages/engine/src/run/todo.ts`), and `Run.consumeQueued` stores the prompt's text there
(`todo.appendTask('Queued Prompts', p.prompt_id, p.content)`), so the Todo pane and every handoff's todo list show the
prompt's text where the requirement names the task; the name appears only in the `prompt_triggered` timeline entry
(`SessionWriter.triggerQueuedPrompts`). Giving the task a name beside its content needs a field the todo document does
not have, and a decision on which of the two the pane, the handoff's 80-character title and the iteration's first
message read.

Noticed 2026-09-29 while repairing `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`, whose repair sends
the task's text (the prompt) to the iteration that takes it up; OQ-117 asks whether that task should be named as the
requirement names it. Not repaired.

## Specs

REQ-CHAT-040 ("a task named "Queued Prompt: <first 8 characters of the prompt id>" carrying the prompt text as its
content") and REQ-ORCH-071 ("tasks named "Queued Prompt: <first 8 characters of the prompt id>"").

## Relevant files

- `packages/engine/src/run/run.ts` — `consumeQueued`, which appends the prompt's text as the task.
- `packages/engine/src/run/todo.ts` — `Task`, which has a text and no name.
- `packages/engine/src/session-writer.ts` — `triggerQueuedPrompts`, where the name is written to the timeline only.
- `packages/engine/src/todo-view.ts` and `packages/ui/src/TodoPane.tsx` — the pane, which draws the task's text.
