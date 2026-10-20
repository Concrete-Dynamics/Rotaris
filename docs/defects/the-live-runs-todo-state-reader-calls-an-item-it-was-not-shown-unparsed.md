## The live run's Todo state reader calls an item it was not shown unparsed

Recorded 2026-10-20 by loc1 (bundle `loc1-todo-reader`) from fin47's reviewers' optional finding on bundle `fin47-accept1-2`,
which left it unrecorded.

`heldItemReading` (`apps/desktop/scripts/lib/coordinator-todo.mjs`) reports `unread` each held item, and each item a closing
`replace` sent, for which `todoStates` gave no state in the Todo state its call carried, and the live run fails a check on it
("every todo item a running child held, or a closing replace sent, was read in its coordinator's Todo state", finding A7). The
check can go red where the reader read correctly, and its detail (`<scenario> #<ordinal> on <item>`) then reads as a gap of the
reader's:

- **An id the pattern cannot take.** `todoStates` reads an id as `TASK_ID`, a parenthesised token with no space or parenthesis
  (`[^()\s]+`). An item whose id holds one is stored, rendered and served as given, and never matched. Since fin47's finding A6
  (`docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md`) no path of the product stores a model-chosen
  id: `replace` resolves every id (`resolveIds`), `add_phase` and `add_task` mint one, and a delegation's `todo_item` is admitted
  only when the caller's plan holds it (`admitTodoItem` (a), `packages/engine/src/children/todo-item.ts`). What is left is a plan
  stored before A6, which `TodoList` restores as stored (`apps/desktop/src/run-host/tools.ts`, `new TodoList(ctx.readTodo?.())`) —
  a session continued from such a store, or a pack recorded before it read again.
- **An item the plan no longer holds.** `remove_task` (`packages/agent-tools/src/tools/todo.ts`) protects no held item: a
  coordinator may remove an item a running child holds, and the Todo state then does not show it. That is the plan's state, not
  the reader's gap, and the detail says the same thing for both.

A second, harmless point beside it: on a line of more than one reading (a description ending in a no-space parenthesised token,
`Docs (0000000c) — update (README)`), each reading no single-reading line claims is added as an id, so `README` becomes a key.
Nothing looks such a key up, but `states.size` is then not the number of tasks shown, and no comment says so.

## Specs

None in the product: the harness's check claims a reading of REQ-TOOLS-144 and REQ-TOOLS-147 (finding A7) and, when it fails,
says less than it read. Whether `remove_task` should refuse a held item is not raised here: REQ-TOOLS-146's protection is stated
for `replace`.

## Relevant files

- `apps/desktop/scripts/lib/coordinator-todo.mjs` — `todoStates`, `TASK_ID`, and `heldItemReading`'s `missed`.
- `apps/desktop/scripts/live-run.mjs` — `checkCoordinatorTodo`'s `unread` check and its detail.
- `apps/desktop/scripts/lib/coordinator-todo.test.ts` — no case reads an id holding a space, or tells a removed item from an
  unparsed one.
- `packages/agent-tools/src/tools/todo.ts` — `remove_task`.
