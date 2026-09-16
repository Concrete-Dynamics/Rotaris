## `add_phase` refuses the batch its own schema advertises, and names no remedy

The `todo` tool's schema is flat: `operation`, and beside it every field any operation reads — `phases`
among them. A call of `{"operation":"add_phase","phases":[…]}` is therefore **well formed against the
advertised schema**, and `add_phase` answers it with six words: `add_phase requires a name.` The refusal
names no remedy, never says the `phases` it was sent were discarded, and never names `replace`, the one
operation that reads them.

Observed live 2026-09-16, run `a26918e8-45be-45b9-8762-24f94059183c`: call #23 sent five phases that way,
read the six words back, and retried with `name` **and** `phases` together — which adds one empty phase
and silently drops the other four. Two calls and about a minute of a 21.7-minute run, spent on a refusal
that knew the answer and did not give it.

This is the fourth member of a family `docs/defects/fixed/` already holds three of
(`glob-compiles-a-brace-group-into-an-invalid-regex`, `a-misspelled-tool-reads-as-withheld-at-the-plan-gate`,
`a-path-under-a-file-is-reported-as-a-path-that-has-no-parent`): a requirement's silence filled in by an
unhelpful string, where the tool has in hand everything the caller needed to be told.

`add_task` had the weaker form of the same fault — its missing-name refusal carried no hint at all, where
every one of its sibling refusals in the same operation carries `hint()`'s enumeration.

## Specs

No requirement is contradicted outright. `REQ-TOOLS-147` mandates a hint for a missing **phase or task id**
and is silent on a missing **name**; `REQ-TOOLS-013` is the refusal-shape requirement the sibling notes
invoke. `REQ-TOOLS-144` fixes the five operations and the words `Unsupported operation: <op>`, which the
repair had to keep reachable once the operation became an enum — refusing at the schema would otherwise have
moved that answer into the gate's generic "do not match its schema" message.

## Relevant files

- `packages/agent-tools/src/tools/todo.ts` — the `add_phase` and `add_task` refusals, the `hint()` closure
  already in scope beside them, the `operation` field, and the tool description that is the model's only
  per-operation guidance.
- `packages/agent-tools/src/gate.ts` — where a schema refusal is answered, and where `validationError` is
  consulted before the generic message is written.
- `packages/agent-tools/src/tools/tools.test.ts` — the `todo` block, which drove `add_phase` on the happy
  path only.

## Repaired — 2026-09-16

The refusals name what to do instead: `add_phase` and `add_task` say that they add one thing, that `phases`
was not read, how many phases were dropped, and that `replace` takes the whole array; both carry `hint()`.
`operation` is now `REQ-TOOLS-144`'s five as an enum, so the set reaches the model in the advertised schema
for the first time, and a `validationError` implementation keeps `Unsupported operation: <op>` as the answer
to a wrong one. The description states the fields each operation reads. Regression tests in
`packages/agent-tools/src/tools/tools.test.ts`.
