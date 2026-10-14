## The live run's held-item check holds a followed-up child across the gap between its runs

`heldItemReading` (`apps/desktop/scripts/lib/coordinator-todo.mjs`) decides whether a child held its todo item when a root
`todo` or `delegate` call ended from the child's row alone: from `children.spawned_at` to `children.completed_at`, or to no end
while `completed_at` is null. A child that a `session_id` follow-up resumed (PD-TOOLS-006, PD-ORCH-005 clause 22) has
`completed_at` cleared, and one the quit then paused keeps it null. So the check reads it as holding its item across its whole
life, including the gap between its first `child_end` and the follow-up's `child_resumed`. In that gap the child is terminal
and holds nothing, and PD-TOOLS-006 revision 7 lets the coordinator close the item. A follow-up keeps a COMPLETED item as it
is.

Seen in the terminal live run at `3c3f447` (pack `2026-10-14T15-58-45-917Z`, session `7fce100f`, acceptance round 1 of fin46,
finding L2). Child `bg_32e82bf2` (tester, item `0423eeed`) has `completed_at` null and state `paused`. Its timeline holds
`child_start` at ordinal 2, `child_end` at 9 (16:17:34.521Z), `child_resumed` (follow-up) at 12 (16:17:52.370Z), and
`child_paused` (quit) at 23. The root's `todo` call #15 marked the item COMPLETED at 16:17:42, inside the gap. The run FAILed
"no coordinator marked a todo item COMPLETED while an implementation child still held it" on #15, although the product did
what revision 7 says.

## Specs

None contradicted by the product. The check misreads PD-TOOLS-006 revision 7 and PD-TOOLS-008 revision 2 (OQ-249): an item is
held while its child is non-terminal, not over the span from its first spawn to its last completion. REQ-ORCH-029's todo
clause is what the check guards.

## Relevant files

- `apps/desktop/scripts/lib/coordinator-todo.mjs` — `heldItemReading`, whose holding window is `spawned_at` to `completed_at`
  (and whose revision 3 `closes` reading asks the same question of the same columns).
- `apps/desktop/scripts/live-run.mjs` — `checkCoordinatorTodo`, which reads the `children` rows and hands them to the reader,
  and reads no timeline.
- `packages/engine/src/session-writer.ts` — writes the `child_start`, `child_end` and `child_resumed` timeline entries
  that bound each run of a child.
