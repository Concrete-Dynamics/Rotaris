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

## Outcome (fin38, 2026-10-13) — repaired

`openItemsSentence` now follows the listed open items with "If none of them is this work, add one with the todo tool
(add_task) and name its id.", so each refusal that lists items (an unknown id, a COMPLETED or ABANDONED item, an implementation
delegation naming none) names both ways forward; the sentence for a plan with no open item is unchanged. Pinned by
`todo-item.test.ts` ("a plan with open items lists them and says to add one when none of them is the work"), red without the
change, and the refusal texts in `todo-item.test.ts` and `children.test.ts`; `mission-proof` item 1e now reads the sentence in
gamma's refusal. **What a live run should show**: a no-item refusal in the `requirements` scenario (if the model meets one)
ending with that sentence, followed by an `add_task` and a delegation naming the new item.

## Reported back 2026-10-13 (fin41): the default live run at `0bc3eee`

**Not reached.** No delegation was refused for its todo item in any session of the pack: the 8 implementation delegations
after a plan each named an open item, and the verifier owed none. The repaired sentence has not yet met a live model. Read from a
copy of the pack: [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md). The row is in
[`first-executions.md`](../../architecture/first-executions.md).
