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
