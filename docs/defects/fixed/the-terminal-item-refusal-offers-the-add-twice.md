## The terminal-item refusal offers the add twice

A delegation to a persona that writes workspace files, naming a todo item that is COMPLETED or ABANDONED, is refused with
"… Reopen it with todo update, or name or add an open item. Its open items: Document it (0000000c). If none of them is this
work, add one with the todo tool (add_task) and name its id." — the add is offered twice, once in the refusal's own sentence and
once in `openItemsSentence`, which fin38 made name the add whatever the plan holds. With no open item it reads "… or name or
add an open item. It holds no open item: add one …", offering to name an item that does not exist. Harmless but noisy in a
reply a model acts on. Found by fin38's review (optional finding), recorded by fin39 on `origin/main` `e6a04a3`.

**Repaired 2026-10-13 (fin39, `fin39-insert-noop-optionals`).** The refusal's own sentence no longer offers the add, which is
`openItemsSentence`'s: "Reopen it with todo update, or name an open item." when the plan holds one, and "Reopen it with todo
update." when it holds none (`admitTodoItem`, `packages/engine/src/children/todo-item.ts`). Pinned by the "(b) the refusal offers
the add once" case in `packages/engine/src/children/todo-item.test.ts`, red on the code before, and by the updated "(b)" case in
`children.test.ts`.

## Specs

- No requirement's text is contradicted: REQ-ORCH-028 and `PD-TOOLS-006` revision 6 fix the refusal and its way forward, not
  its wording.

## Relevant files

- `packages/engine/src/children/todo-item.ts`: `admitTodoItem`'s (b) refusal and `openItemsSentence`.
- `packages/engine/src/children/children.test.ts`: the "(b) a COMPLETED or ABANDONED item is refused" case, which pins the text.
