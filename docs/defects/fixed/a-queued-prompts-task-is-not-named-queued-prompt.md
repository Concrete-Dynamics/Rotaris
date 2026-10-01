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

## Outcome — repaired 2026-10-01 under R-067 (acceptance A28)

A todo task carries an optional `name` beside its text (`Task.name` in `packages/engine/src/run/todo.ts`), and
`Run.consumeQueued` appends a queued prompt as a task named `Queued Prompt: <first 8 characters of the prompt id>` whose
text is the prompt (`appendTask`'s fourth argument). Which of the two each reader takes, the decision the note left open:

- **the Todo pane** draws the name (`projectPlannerTodo` through `taskTitle`), as it draws an agent task's name
  (REQ-TOOLS-144), so the pane's `TodoPane.tsx` is unchanged; a rename renames the name and keeps the content
  (`Todo.editTask`, REQ-CHAT-091), as an agent task's rename keeps its description;
- **the handoff's todo list** (`buildContinuationPayload`) carries the name too (`taskTitle`), cut to 80 characters:
  REQ-SESSION-115 states its lines as "task display titles", and the name is the task's display title;
- **the entry agent's todo lines across a compression** (`Run.plannerTodoLines`, `todoLinesFromStored`), which
  REQ-MONITOR-084 (4) carries "one for one" and states no display title for, carry the name and then the content
  (`taskLine`), as an agent task's line carries its name and then its description — a built reading, not the
  requirement's words;
- **the iteration that takes the task up** is still sent its content, as OQ-117's built reading states; whether the task
  part should also state the name stays with OQ-117, to which a dated note says what was built.

A stored todo without names reads as before; a stored name that is not a string is not a planner document. Pinned by
`packages/engine/src/run/todo.test.ts` ("a task named beside its content"), `packages/engine/src/todo-view.test.ts` ("a named
planner task"), `packages/engine/src/session-resume.test.ts` (the handoff's line is the display title) and `packages/engine/src/control.test.ts`
(the consumed prompt's task carries the name), each failing on the old code; and in the built app by
`apps/desktop/scripts/part-j-proof.mjs`'s queue scenario, which reads the stored task's name and content. Repaired
2026-10-01 under R-067.

*Corrected 2026-10-01 at verification:* the outcome first had the handoff's todo lines carry the name and then the
content (`taskLine`), which is not REQ-SESSION-115's "task display titles"; `buildContinuationPayload` now writes
`taskTitle`, and the session-resume test expects `- [pending] Queued Prompt: 0123abcd`.
