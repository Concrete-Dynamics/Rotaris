---
req-id: SWR-1733
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1700
title: "MCP server config normalization must not mutate the input config"
epic: SWR-1700
date: 2026-07-23
---

# SWR-1733 — MCP server config normalization must not mutate the input config

`SWR-1700` covers MCP configuration wiring generally, but does not say anything
about the object-identity contract of the normalization step.
`_normalize_mcp_server_config()` (`src/rotaris_core/agents/factory.py`) converts a
`MCPServerConfig` into the stdio/http/sse dict consumed by the SDK's MCP
client. Because a `PersonaConfig`'s `MCPServerConfig` instances can be shared
across personas and across repeated `create_agent_for_persona()` calls within
the same process, normalization must copy any mutable fields (e.g. `args`)
rather than handing back a reference into the original config — otherwise one
persona's agent construction could silently corrupt another persona's server
definition.

## Acceptance criteria

- `_normalize_mcp_server_config()` never mutates the `MCPServerConfig` passed
  to it; the caller's `args` list is unchanged after normalization.

Derived from: [SWR-1700 — Configuration & MCP](../1700-config-mcp.md)

Epic: [Configuration & MCP](../1700-config-mcp.md)
