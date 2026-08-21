---
req-id: SWR-1732
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2097
title: "MCP server health probe"
epic: SWR-1700
date: 2026-07-22
---

# SWR-1732 — MCP server health probe

For the Rotaris Settings → MCP Servers tab to show a live running/healthy
indicator per configured MCP server (SWR-2097), Rotaris MUST expose a
side-effect-free way to check whether a single configured server is currently
reachable, distinct from `list_mcp_server_tools()` — which caches indefinitely
and is meant for building the persona prompt's tool catalogue, not for repeated
live probing.
This probe exists to serve SWR-2097's UI; it carries no product behavior of its
own.

`probe_mcp_server_health()` in `config/mcp_tool_discovery.py` connects to the
server (stdio/http/sse, reusing `_run_tool_discovery`), does not read or write
`_TOOL_CACHE` / `_logged_discovery_failures`, and returns an `MCPHealthResult`
(`healthy: bool`, `tool_count: int | None`, `error: str | None`) instead of
raising or logging.

## Acceptance criteria

- Calling the probe twice in a row against a live server always re-connects;
  it never returns a stale cached result.
- A failed probe returns `healthy=False` with a human-readable `error`, and
  never raises out of the function.
- A successful probe returns `healthy=True` and the discovered tool count.
- The probe does not mutate `list_mcp_server_tools()`'s cache or failure-log
  state.

Derived from: [SWR-2097 — MCP server live status indicator](../2000-rotaris-desktop.md)

Epic: [Configuration & MCP](../1700-config-mcp.md)
