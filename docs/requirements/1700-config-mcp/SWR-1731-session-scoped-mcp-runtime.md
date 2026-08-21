---
req-id: SWR-1731
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1700
title: "Session-scoped MCP client and tool-provider runtime"
epic: SWR-1700
date: 2026-07-20
---

# SWR-1731 — Session-scoped MCP client and tool-provider runtime

For discovered/configured MCP servers (SWR-1700, SWR-1706–SWR-1713) to actually
back agent tools at runtime, Rotaris MUST manage MCP client connections for
the lifetime of a session and expose their tools to the OpenHands SDK without
each agent opening or tearing down its own connection. This runtime layer exists
to serve the MCP capability of SWR-1700; it carries no product behavior of its
own.

The layer comprises:

- **`SessionMCPManager`** — owns MCP client connections for a session, creating
  them lazily and closing them once at session teardown (thread-safe, since
  child agents run off-thread).
- **`SharedMCPClient`** — a no-op-close wrapper around the real `MCPClient` so a
  connection shared across agents is not closed when a single agent finishes;
  only the manager performs the real force-close.
- **`SharedMCPToolProvider`** — the SDK integration point that aggregates the
  session's MCP clients and provides their tools to agents. Its
  ``create_tools()`` method accepts an optional ``on_tools_changed`` callback
  that is forwarded to the SDK so callers receive runtime tool-list change
  notifications.

## Acceptance criteria

- A failed workspace LSP initialization removes and closes that failed transport, withholds its tools from the affected child, and allows a later child to create a fresh connection.
- Concurrent calls to a shared MCP connection serialize without blocking the MCP executor event loop.

- A session's MCP connection is created once and reused across agents; a single
  agent finishing does not close the shared connection.
- `SharedMCPClient.close()` is a no-op while the manager's force-close tears down
  the real client.
- The tool provider exposes the session's MCP tools to the SDK.
- When ``create_tools()`` receives an ``on_tools_changed`` callback, the
  callback is forwarded to the SDK's MCP client factory and invoked on
  runtime tool-list changes.

Derived from: [SWR-1700 — Configuration & MCP](../1700-config-mcp.md)

Epic: [Configuration & MCP](../1700-config-mcp.md)
