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
  [`fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md`](fixed/an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md),
  back for these schemas), and the run is put at risk by the stray rejection, where REQ-TOOLS-032 says the run is never
  ended by a schema-invalid call.

## Relevant files

- `packages/agent-tools/src/advertised-schema.ts:147` — `engineFor(readable).compile(readable)`, which honours `$async`.
- `packages/agent-tools/src/advertised-schema.ts:154` — `if (validate(value)) return;`, true for a Promise.
- `packages/agent-tools/src/gate.test.ts` — the advertised-schema cases, none with `$async`.
