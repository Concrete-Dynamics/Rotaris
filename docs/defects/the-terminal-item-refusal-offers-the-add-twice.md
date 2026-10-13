## The terminal-item refusal offers the add twice

A delegation to a persona that writes workspace files, naming a todo item that is COMPLETED or ABANDONED, is refused with
"… Reopen it with todo update, or name or add an open item. Its open items: Document it (0000000c). If none of them is this
work, add one with the todo tool (add_task) and name its id." — the add is offered twice, once in the refusal's own sentence and
once in `openItemsSentence`, which fin38 made name the add whatever the plan holds. With no open item it reads "… or name or
add an open item. It holds no open item: add one …", offering to name an item that does not exist. Harmless but noisy in a
reply a model acts on. Found by fin38's review (optional finding), recorded by fin39 on `origin/main` `e6a04a3`.

## Specs

- No requirement's text is contradicted: REQ-ORCH-028 and `PD-TOOLS-006` revision 6 fix the refusal and its way forward, not
  its wording.

## Relevant files

- `packages/engine/src/children/todo-item.ts`: `admitTodoItem`'s (b) refusal and `openItemsSentence`.
- `packages/engine/src/children/children.test.ts`: the "(b) a COMPLETED or ABANDONED item is refused" case, which pins the text.
