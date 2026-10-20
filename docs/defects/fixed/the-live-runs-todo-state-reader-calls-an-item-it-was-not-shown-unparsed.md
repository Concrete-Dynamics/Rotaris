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

## Outcome

Repaired 2026-10-20 by loc1 (bundle `loc1-todo-reader`); harness only, no product code.

- `todoItemState(text, id)` (`coordinator-todo.mjs`) looks an item up where `todoStates` gave it no state: the first task line
  on which the exact rendered suffix ` (<id>)` closes the name, at the line's end or before its ` — `, gives its state, so an id
  holding a space or a parenthesis is read. Where no task line carries it, it says why: `not shown` (no line of the block
  carries the suffix: the plan no longer holds the item, or never did) or `not parsed` (a line other than a phase's carries it
  in a shape the reader does not take, such as a name holding a line break: a gap of the reader's).
- `heldItemReading` takes that lookup for every held item and every item a closing `replace` sent (so `closes`' `stored` reads
  the suffix's state too), and each `unread` entry carries `why`. The live run's check keeps its title and target of 0; its
  detail now lists the `not shown` items and the `not parsed` ones apart, each with what it means.
- `todoStates`' comment says its keys are readings, not tasks: a line of several readings adds each that no single-reading line
  claims, a key nothing looks up, so `states.size` is not the number of tasks shown.
- On (a): no path of the product has stored a model-chosen id since A6 (`resolveIds`; `add_phase` and `add_task` mint; a
  delegation's `todo_item` is admitted only when the plan holds it). A plan stored before A6, restored as stored, is the one
  source left, and the lookup reads it.
- Pinned by `coordinator-todo.test.ts`'s "an item the reader gave no state for is looked up by its rendered suffix, and an
  unread one says why": the ids `impl 1` and `tests (unit)` read in a held reading and a closing `replace` (red before: four
  `unread`, `heldReads` 0); a held item removed reads `not shown`, an id on a line of no task shape `not parsed` (red before:
  entries with no `why`); and the `README` reading counted as a key, pinned beside the comment. The A7 case's `unread` entries
  now carry `why: 'not shown'`. The next default live run is the live measure.
