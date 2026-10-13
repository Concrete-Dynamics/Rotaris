## The "names no todo item" refusal names `add_task` only when the plan holds no open item

`openItemsSentence` (`packages/engine/src/children/todo-item.ts`) ends PD-TOOLS-006 revision 6's refusals of a delegation's
todo item. When the caller's plan holds no open item it says "add one with the todo tool (add_task) and name its id"; when it
holds some, it lists them and stops, though none of them may be the work the delegation is for. The refusal then offers only
the listed items as the way forward, and invites a model to name an item the work does not serve. Live-run finding Q3 of the
final default pack at `552d346` (2026-10-13, requirements `142ecafe`): `#39` (a docs-writer delegation, no `todo_item`) was
refused listing only the verification item `a3`; the model added an item (`#40`, `add_task` → `98abbfc9`) and delegated again
(`#41`). Cost: about 11.9 s and a 906-token brief typed twice, one `tool_error` issue.

## Specs

- PD-TOOLS-006 revision 6: each refusal gives "its reason naming the item, the holder where there is one, and the way forward".
  When no listed item fits the work, adding one is the way forward, and the refusal does not say so. No requirement's text is
  contradicted.

## Relevant files

- `packages/engine/src/children/todo-item.ts` — `openItemsSentence`, used by the unknown-id, terminal-item and no-item refusals.
- `packages/engine/src/children/todo-item.test.ts`, `packages/engine/src/children/children.test.ts` — the refusal texts.
