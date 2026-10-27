# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest — Open question carried

Part 4 of 10 of [ADR-0035](../0035-the-bundled-code-intelligence-runtime.md), which indexes every part.

## Open question carried

`REQ-MCP-033` describes the sentinel branch **only** as an MCP server on standard streams, while
`REQ-MCP-036` derives a command line from the same entry and `REQ-MCP-099` runs it with the runtime's
three setup subcommands. **Recommended reading: the sentinel branch is a general pass-through, and
`REQ-MCP-033` describes what happens when the remaining arguments select the server.** Confirm, because
it changes what the packaged binary's early-argv branch must do. If it is answered the other way, one
of the two requirements must change. See OQ-23.
