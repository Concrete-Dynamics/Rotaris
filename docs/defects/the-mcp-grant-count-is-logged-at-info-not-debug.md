## The MCP grant count is logged at info, which REQ-MCP-059 calls a debug line

When a persona's `mcp_tools` narrows a server's tools, the run host writes "persona <p>: N of M tools granted on server
'<s>' (REQ-MCP-059)" to the application log at `info`. REQ-MCP-059 says that line is a debug log. PD-MONITOR-002's
default threshold is `info`, so a packaged build keeps the line on every persona's first spawn. At `debug` it would
be dropped unless `ROTARIS_APP_LOG_LEVEL=debug` is set. The persona MCP diagnostics can only be `info`, `warning` or
`error`. `Diagnostic`'s severity has no `debug`, and `McpHost.deliver` maps everything that is not `info` to `warn`.

Noticed while repairing live-run finding D7 (the same line written twice on a first spawn). That repair made the line
appear once. It did not change the line's level.

## Specs

- `REQ-MCP-059`: "When narrowing occurs, a debug log states how many of the server's tools were granted."
- `PD-MONITOR-002`: the application log's levels and its default `info` threshold, which is why the level matters.

## Relevant files

- `packages/config/src/mcp/persona.ts` — `resolvePersonaMcp`, which builds the grant-count diagnostic with `info(…)`.
- `packages/config/src/mcp/diagnostics.ts` — `DiagnosticSeverity` has no `debug`.
- `apps/desktop/src/run-host/mcp.ts` — `McpHost.deliver`, which writes a diagnostic at `info` or `warn` only.
