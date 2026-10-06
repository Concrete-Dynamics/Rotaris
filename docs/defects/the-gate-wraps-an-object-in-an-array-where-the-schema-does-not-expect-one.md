## The gate wraps an object in an array where the schema does not expect one

REQ-TOOLS-032's second repair reads a single object as a one-element array "where the schema expects an array", for the
fields `tasks`, `phases`, `files`, `items` and `test_cases`. The gate's `repairPayload` applies it to those five fields
unconditionally, before the schema is consulted: any call whose arguments carry one of those names holding an object has
it rewritten to `[object]`, whatever the tool's schema says the field is.

Before 2026-10-06 the rewrite reached every MCP tool silently, since an MCP executor's schema passed any object: a server
whose `items` is an object received an array it never asked for. Once fin18 checks an MCP call against the server's
advertised `inputSchema` (`advertisedSchemaCheck`), the same rewrite makes such a call **permanently refused**: the
wrapped value fails the advertised `type: "object"`, the model is told "items: Invalid input: expected object, received
array" about an object it sent, and every re-issue is wrapped the same way, so the tool cannot be called with that
argument at all. A built-in tool is untouched only because none of the public tools names one of the five fields as
anything but an array.

Found by the fin18 verifier (repair round 1), by a probe through `McpHost.executorsFor` and a real `Gate`:
`{"items": {"a": 1}}` against `{type: "object", properties: {items: {type: "object"}}}` settled `failed` with the text
above, and nothing was sent.

Recorded 2026-10-06.

## Specs

- `REQ-TOOLS-032`: "a single object supplied where the schema expects an array is read as a one-element array, for the
  fields `tasks`, `phases`, `files`, `items`, and `test_cases`". The repair is conditioned on the schema; the gate applies
  it where the schema expects an object, which turns a valid call into an invalid one, and REQ-TOOLS-032's recoverable
  refusal into one no re-issue can recover from.

## Relevant files

- `packages/agent-tools/src/gate.ts` — `ARRAY_FIELDS` and `repairPayload`, the unconditional wrap; `Gate.dispatch`,
  which hands the wrapped payload to the schema check, the permission request and the executor.
- `packages/agent-tools/src/advertised-schema.ts` — the advertised-schema check that now refuses the wrapped value.
- `apps/desktop/src/run-host/mcp.ts` — `McpHost.executorsFor`, the MCP executor whose `schema` is that check.
