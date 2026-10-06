## An MCP tool call that fails its advertised input schema reaches the server

The model is handed an MCP tool's parameters as the server's own `inputSchema` (ADR-0034, `toolSpec`), but the gate
validates every call against the executor's zod `schema`, and an MCP executor's `schema` is
`z.record(z.string(), z.unknown())`: any object passes. So REQ-TOOLS-032's refusal of a schema-invalid payload can never
fire for an MCP tool. A call missing a required property, carrying a property of the wrong type, or a value outside an
`enum` is executed: it is sent to the server, which answers with its own validation error (or, for a server that does not
validate, acts on the arguments). The call is recorded `failed` with `failure_kind: tool_error`, `outcome_kind: mcp`
instead of the gate's `invalid_request`, and the model reads the server's raw error text rather than the gate's
"do not match its schema … Re-issue the call with corrected arguments".

Live-run finding: G3 of the final default live run at `27a5127`.

Recorded 2026-10-06 from the autopsy of that run.

## Specs

- `REQ-TOOLS-032`: "A payload still schema-invalid after repair is returned to the model as a recoverable tool-result
  error … naming the tool and the schema violation and asking for a corrected re-issue. The call is not executed". The
  schema the model was given is the server's `inputSchema`; a call that fails it is executed.
- `REQ-SESSION-136`: such a refusal is a failure filed as `tool_error` referencing the tool-call record, which the gate's
  `refuseInvalid` already does for a built-in tool; an MCP call never reaches it.

## Evidence

Default pack `.live-run/runs/2026-10-06T01-30-08-282Z/` (the `live` worktree; git-ignored), scenario `requirements`,
session `41677019`:

- `requirements/model-traffic.jsonl`, line 28 (0-based; the verifier's request) offers `edit_memory` with
  `required: ["memory_name", "needle", "repl", "mode"]`.
- The store's tool row #45 (`workspace.db`, `tool_calls.ordinal` 45) is that call with `{content, memory_name}` only:
  `failed`, `failure_kind tool_error`, `outcome_kind mcp`, and issue 1 (`tool_error`) references it. The server answered
  "Error executing tool edit_memory: 3 validation errors for applyArguments / needle Field required … repl … mode …".
- `requirements/transcript.md`, rows 84 and 85: "edit_memory content memory_name [failed]", then "I used the wrong tool —
  I should use write_memory"; the memory the verifier meant to keep was never written.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts:331-332` — `executorsFor`: `schema: z.record(z.string(), z.unknown())` beside
  `parameters: { ...tool.inputSchema }`.
- `packages/agent-tools/src/gate.ts:307-312` — the gate's schema check, `executor.schema.safeParse(repaired)`, and its
  `invalid_request` refusal.
- `apps/desktop/src/run-host/tools.ts:236` — `toolSpec`: the model is handed `parameters` where an executor has them.

## Repaired — 2026-10-06 (fin18)

An MCP executor's `schema` is now `advertisedSchemaCheck(tool.inputSchema)`
(`packages/agent-tools/src/advertised-schema.ts`, used by `McpHost.executorsFor` in `apps/desktop/src/run-host/mcp.ts`,
compiled once per discovered schema): the object record refined by zod's `z.fromJSONSchema` reading of the schema the model
was handed. A call that fails it takes the gate's existing path for a built-in tool's schema failure: "The arguments for
'<tool>' do not match its schema (<path>: <violation>; …). Re-issue the call with corrected arguments.", `failed`,
`invalid_request`, one `tool_error` issue referencing the record, and the call is never sent. The refinement's output is
the call's own arguments, so a valid call reaches the server exactly as written: no `default` filled in, no unnamed
property stripped.

- **Validator.** zod's own reader: zod is already the workspace's one runtime validation library (declared by
  `apps/desktop`, pinned at 4.5.4 in the lockfile). The lockfile's only JSON Schema validators, `ajv` 6 and 8, come with
  eslint and electron-builder, which never reach the packaged app; using one would have added a runtime dependency.
- **`format` is read as an annotation**, as JSON Schema 2020-12 has it: zod would assert it, and a call the server's own
  schema accepts must not be refused for a format the server does not check.
- **A schema the reader cannot compile** (`if`/`then`/`else`, `dependentRequired`, an external `$ref`, a pattern the
  host's regular expressions reject) leaves the tool callable under the object check alone, said once per process at
  info ("mcp: the input schema of '<tool>' on MCP server '<server>' could not be compiled (…)"). The MCP requirements drop a
  discovered tool for an empty or non-string name only (REQ-MCP-052), and the callable set is every granted tool that
  survives `disabled_tools` (REQ-MCP-055, REQ-MCP-059); none drops a tool for its schema.
- The scripted dialect's fixed MCP arguments now give a renamed or prefixed fixture tool (`beta_echo`, `gamma_slow`) its
  original's arguments: `{}` for an `echo` is now, correctly, refused.

Pinned by tests that fail without the repair:

- `apps/desktop/src/run-host/mcp.test.ts`, "an MCP call checked against the input schema the model was given": the run's own
  `edit_memory` schema and call (`{content, memory_name}`), under the test's own name `amend_note` (REQ-MCP-116 keeps the
  runtime's tool names in its manifest alone; `code-intelligence.test.ts` fails a quoted one written elsewhere), refused at
  a real gate as `invalid_request` with a `tool_error` issue and never sent (red before: the call reached the connection);
  an enum and a type violation refused; a valid call with an unnamed property sent unchanged; an uncompilable schema
  callable under the object check and said once at info.
- `packages/agent-tools/src/gate.test.ts`, "REQ-TOOLS-032 for a tool advertised by JSON Schema": the exact refusal text, the
  record and the issue; a valid call executed with its own arguments; `format` not asserted while a property named
  `format` still binds; uncompilable schemas; local `$ref`, `anyOf` and `additionalProperties: false` bound.
- `pnpm mcp-proof`, new launch 2b (`schema`): `echo` without `text` refused (`invalid_request`, the text, the issue) with
  nothing reaching the fixture's `--call-file`; `beta_echo` with an extra property received by the fixture exactly as
  written. Green on 2026-10-06 (load average 2.5 to 2.9 on 4 CPUs).
- `pnpm code-intel-proof` against the bundled runtime: PASSED on 2026-10-06 (load average 2.5 to 4.0 on 4 CPUs). Every one
  of the runtime's 22 advertised schemas compiled (no "could not be compiled" line in any launch's log), and the scripted
  `list_memories` and `get_symbols_overview {relative_path}` calls passed the check and succeeded.
