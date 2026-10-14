## A rename's warm-up search that loses its connection raises the server's unreachable notice

PD-MCP-004 has the run host send the bundled code-intelligence server a referencing-symbol search before every symbol rename,
and its clause 3 says that search writes no notice. The search goes through the same `SessionConnections.call`
(`packages/mcp/src/sessions.ts`) as a model's call, and that path raises REQ-MCP-069's warning ("MCP server '<name>' became
unreachable …", once per server per session) when the transport closes under it. So a server that went away during the search
raised the notice from the search, although the rename that follows re-establishes the connection (the failed entry is released)
and may well succeed: the user is warned of a failure no call the model made met, and the one warning the session allows for that
server is spent. Noted by fin43's reviewer of `fin43-rename-and-match`.

## Specs

- [`PD-MCP-004`](../product/directives.md#pd-mcp-004) clause 3 — the search writes no tool-call record, total, histogram bucket,
  child-report entry or notice.
- `REQ-MCP-069` — a failure after connect is that call's failure; one warning per server per session.

## Relevant files

- `packages/mcp/src/sessions.ts` — `SessionConnections.call`, which warns on a closed transport.
- `apps/desktop/src/run-host/mcp.ts` — the MCP executor's warm-up before the rename.
- `apps/desktop/src/run-host/mcp.test.ts`, `packages/mcp/src/mcp.test.ts` — the tests beside each.
