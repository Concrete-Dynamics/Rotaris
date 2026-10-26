# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline — Revisit if

Part 6 of 7 of [ADR-0034](../0034-mcp-connections-and-configuration-resolution.md), which indexes every part.

## Revisit if

A requirement appears that makes probe results reusable, or that requires automatic reconnection — both
would contradict `REQ-MCP-054` and `REQ-MCP-069` as written; or all child-process spawning must be
centralised for sandbox or audit reasons, which would make the central-service shape required and would
need its latency concerns answered.
