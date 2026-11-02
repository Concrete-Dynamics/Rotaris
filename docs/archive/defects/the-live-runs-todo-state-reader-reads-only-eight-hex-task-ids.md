## The live run's Todo state reader reads only eight-hex task ids

`todoStates` (`apps/desktop/scripts/lib/coordinator-todo.mjs`) reads the task states out of a rendered `Todo state:` block
(REQ-TOOLS-147's `  [STATE] name (id)` lines) for `heldItemReading`, and matched a task's id with `([0-9a-f]{8})` alone. A
`replace` stores a new task under the id its model sent
([`a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md`](a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md),
the product half, open when this note was written and repaired the same day by fin47's finding A6), so in a session whose model chose its ids every task was invisible to the reader, and the three
checks built on it, `heldPending`, `closedWhileHeld` and `restoredOverClose`, passed having read nothing of that session.

Split out 2026-10-15 by fin47 (`fin47-accept1-2`, acceptance finding A7, harness-defect) from the note above, which recorded
it as its harness half while building OQ-333. Over the default pack at `3c03287` (`2026-10-15T03-10-08-908Z`) the gap was not
the swarm session's alone: four of the eight coordinating sessions held items under ids of their models' choosing (requirements
`i1` and `v1`, crlf `four-edits`, delegation `a1` and `a2`, delegation-swarm `impl101`, `test101`, `doc101`), and the
OQ-255 check's PASS read "delegation #16 a1 null, delegation #28 a1 null, delegation #28 a2 null": three closes whose stored
state it never found.

## Specs

- None in the product: the fault is the harness's, whose checks claimed a reading of PD-TOOLS-008 revisions 2 and 3 and
  PD-TOOLS-006 revision 7 (OQ-249, OQ-255) they did not take. REQ-TOOLS-144's ids are the product half's question.

## Relevant files

- `apps/desktop/scripts/lib/coordinator-todo.mjs` — `todoStates`, and `heldItemReading`, which skipped an item the reader did
  not find without saying so.
- `apps/desktop/scripts/live-run.mjs` — `checkCoordinatorTodo`'s held-item checks.
- `apps/desktop/scripts/lib/coordinator-todo.test.ts` — the reader's tests, each written with eight-hex ids.

## Outcome

Repaired 2026-10-15 by fin47 (`fin47-accept1-2`).

- `todoStates` reads any id the rendering carries: a parenthesised token with no space, followed by the line's end or the
  description's ` — `. A name or description holding such a token too leaves its line several readings; lines of one reading
  are taken first, then each reading of the others no line has given yet.
- `heldItemReading` counts the held-item states it read (`heldReads`) and reports each held item, and each item a closing
  `replace` sent, that the Todo state its call carried does not show (`unread`). The live run fails a new check on `unread`
  ("every todo item a running child held, or a closing replace sent, was read in its coordinator's Todo state", REQ-TOOLS-144,
  REQ-TOOLS-147, finding A7), and the `heldPending` check's PASS names how many states it read, so none of the three checks
  passes on nothing again.
- Pinned by `coordinator-todo.test.ts`'s "a task stored under a model-chosen id is read like any other": three cases (the
  reader over non-hex ids and parenthesised names, the three findings in the swarm session's ids, and `unread`), each red on
  the code before (`todoStates` read `[['0000000c', 'COMPLETED']]` of three lines; `heldPending` read `[]`; `unread` was
  undefined).
- Shown over the recorded pack: `checkCoordinatorTodo`'s reading replayed on a copy of the `3c03287` pack's `workspace.db`. With
  the eight-hex pattern in the repaired reader, 9 of the 18 held-item states were read and `unread` named 12 (requirements `#11`
  `i1`, `#31` `v1`; crlf `#5` `four-edits`; delegation `#16` `a1`, `#28` `a1` and `a2`; delegation-swarm `#7` to `#9`, six
  readings of `impl101`, `test101` and `doc101`); as repaired, all 18 were read, `unread` was empty, the delegation closes read
  `COMPLETED` rather than `null`, and the three checks still found nothing to report. The next default live run is the live
  measure.
