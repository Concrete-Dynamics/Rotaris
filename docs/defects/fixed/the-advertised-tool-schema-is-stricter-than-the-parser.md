## The advertised tool schema is stricter than the parser that reads the call

Every built-in tool's parameters are advertised to the model by converting its zod schema to JSON Schema.
The conversion was called with no options, and its default is `io: 'output'` — the shape of a **parsed
result**, not of a call about to be made. Under that reading a field carrying a `.default()` is emitted as
**required**, because after parsing it always has a value.

So `todo`'s `phases` items were advertised as `required: ["name","tasks"]` while the parser accepts `tasks`
omitted and fills it with `[]`. The product advertised a contract it does not enforce, in the one built-in
tool that takes a batch — the same tool a run was found fighting with on 2026-09-16 (see
`add_phase-refuses-the-batch-its-own-schema-advertises.md`). The same default also emitted
`additionalProperties: false` for every object, which the parser does not enforce either: zod strips unknown
keys rather than refusing them.

The fault is one argument at one call site and reaches every built-in tool at once. An MCP tool is
unaffected: ADR-0034 hands the model the server's own input schema rather than a converted one.

## Specs

No requirement is contradicted. `REQ-TOOLS-013` is the nearest: what the model is told about a tool is what
it is answered against. Recorded because an advertised contract that the product does not enforce is a
defect of the advertisement whether or not a requirement names it.

## Relevant files

- `apps/desktop/src/run-host/tools.ts` — the conversion, now `toolSpec`, exported so the advertised shape
  can be asserted from a test; it was a closure inside `createToolPort` and could not be.
- `packages/agent-tools/src/tools/todo.ts` — `phaseInput`'s `tasks: z.array(taskInput).default([])`, the
  field the mismatch showed up on.
- `apps/desktop/src/run-host/tools.test.ts` — the assertions on what the model is handed.

## Repaired — 2026-09-16

The conversion passes `{ io: 'input' }`. `tasks` is advertised as optional, which is what the parser does,
and `REQ-TOOLS-144`'s five operations now reach the model as an enum rather than as a bare string.
