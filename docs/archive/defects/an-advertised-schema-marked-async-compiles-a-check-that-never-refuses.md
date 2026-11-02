## An advertised schema marked `$async` compiles a check that never refuses, and leaves its rejection unhandled

`advertisedSchemaCheck` (`packages/agent-tools/src/advertised-schema.ts`) compiles an MCP server's `inputSchema` with ajv 8.
`$async: true` is ajv's own keyword, not JSON Schema's: given it at the root, ajv compiles an **asynchronous** validator,
whose call returns a Promise rather than a boolean. The refinement reads `if (validate(value)) return;`, and a Promise is
truthy, so every call passes the check, however invalid. When the arguments are invalid the Promise then rejects with ajv's
`ValidationError`, and nothing awaits it: the rejection is unhandled. A Node probe of 2026-10-06 against `37f7a98`
(`advertisedSchemaCheck({ $async: true, type: 'object', required: ['needle'], … })`, then `safeParse({ other: 1 })`) printed
`compiled true`, `success = true`, and an `unhandledRejection` of `ValidationError: validation failed`. Without a handler
of its own a Node process ends on an unhandled rejection; the run host installs no `unhandledRejection` handler.

Found by the fin18 verifier's probes of the advertised-schema check and recorded nowhere until now.

## Specs

- `REQ-TOOLS-032`: a payload still schema-invalid after repair is returned to the model as a recoverable error and not
  executed. A server schema carrying `$async` has every invalid call sent to the server instead (the defect G3 repaired,
  [`an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md`](an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md),
  back for these schemas), and the run is put at risk by the stray rejection, where REQ-TOOLS-032 says the run is never
  ended by a schema-invalid call.

## Relevant files

- `packages/agent-tools/src/advertised-schema.ts:147` — `engineFor(readable).compile(readable)`, which honours `$async`.
- `packages/agent-tools/src/advertised-schema.ts:154` — `if (validate(value)) return;`, true for a Promise.
- `packages/agent-tools/src/gate.test.ts` — the advertised-schema cases, none with `$async`.

## Repaired — 2026-10-06 (fin21)

`withoutUnreadPatterns`, the walk that already reads the schema by keyword position before compiling, drops `$async`
wherever it stands as a keyword, so ajv compiles the synchronous validator JSON Schema describes; a property *named*
`$async` is a property and still binds. The refinement now reads `validate`'s answer as a boolean only: anything else is
no refusal, and a Promise it might still be handed is given a handler, so no rejection can be left unheard. The header of
`advertised-schema.ts` says so.

Pinned by "an `$async` schema is read as JSON Schema reads it: checked synchronously, an invalid call refused, no
rejection left unhandled" in `packages/agent-tools/src/gate.test.ts`: a root and a nested `$async`, an invalid call
refused at each level, a valid one sent as written, and no `unhandledRejection` seen. Against the code before the repair
it fails with vitest's "Unhandled Rejection — Error: validation failed" from `advertised-schema.ts:154`.
