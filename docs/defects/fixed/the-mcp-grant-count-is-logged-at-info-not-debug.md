## The MCP grant count is logged at info, which REQ-MCP-059 calls a debug line

When a persona's `mcp_tools` narrows a server's tools, the run host writes "persona <p>: N of M tools granted on server
'<s>' (REQ-MCP-059)" to the application log at `info`. REQ-MCP-059 says that line is a debug log. PD-MONITOR-002's
default threshold is `info`, so a packaged build keeps the line on every persona's first spawn. At `debug` it would
be dropped unless `ROTARIS_APP_LOG_LEVEL=debug` is set. The persona MCP diagnostics can only be `info`, `warning` or
`error`. `Diagnostic`'s severity has no `debug`, and `McpHost.deliver` maps everything that is not `info` to `warn`.

Noticed while repairing live-run finding D7 (the same line written twice on a first spawn). That repair made the line
appear once. It did not change the line's level.

## Outcome

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067), as acceptance finding A41. Confirmed first on the
branch: both cases below were red on the unrepaired code, the diagnostic at `info` and the log line at `info`.

- `DiagnosticSeverity` gains `debug`, with a log-only `debug(…)` builder beside `info(…)`
  (`packages/config/src/mcp/diagnostics.ts`).
- `resolvePersonaMcp` builds the grant count with `debug(…)` (`packages/config/src/mcp/persona.ts`).
- `McpHost.deliver` writes a `debug` diagnostic at `debug`, where it had folded everything but `info` into `warn`
  (`apps/desktop/src/run-host/mcp.ts`). No other diagnostic changes level.

Pinned by "REQ-MCP-059 (A41): …" in `packages/config/src/mcp/mcp.test.ts` and "REQ-MCP-059, PD-MONITOR-002 (A41): …" in
`apps/desktop/src/run-host/mcp.test.ts`; reverting the sink's mapping alone turns the second red with `warn`. Shown in
the built app by `pnpm live-run --only=ask` against `katalyst`, twice: at the default threshold the orchestrator's
`code_intelligence` surface (12 of its 22 tools) was written and the grant count was not; with `--app-log-level=debug`
the same line was written as `debug   run host: mcp: persona orchestrator: 12 of 22 tools granted on server
'code_intelligence' (REQ-MCP-059)`. ADR-0034 is reported back in place, with a row in
[`first-executions.md`](../../architecture/first-executions.md).

## Specs

- `REQ-MCP-059`: "When narrowing occurs, a debug log states how many of the server's tools were granted."
- `PD-MONITOR-002`: the application log's levels and its default `info` threshold, which is why the level matters.

## Relevant files

- `packages/config/src/mcp/persona.ts` — `resolvePersonaMcp`, which builds the grant-count diagnostic with `info(…)`.
- `packages/config/src/mcp/diagnostics.ts` — `DiagnosticSeverity` has no `debug`.
- `apps/desktop/src/run-host/mcp.ts` — `McpHost.deliver`, which writes a diagnostic at `info` or `warn` only.
