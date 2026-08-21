---
req-id: SWR-3009
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3008
title: "MCP tool grants are enforced at tool creation"
epic: SWR-1700
date: 2026-08-13
---

# SWR-3009 — MCP tool grants are enforced at tool creation

`MCPServerConfig.disabled_tools` looks like a way to withhold an MCP tool, but it is applied
only in `mcp_tool_discovery.list_mcp_server_tools()` — the function that builds the *prompt's*
MCP section. The tools themselves are created from the same server by the SDK, untouched. The
`git` server's 21-entry list therefore hides `git_push`, `git_reset` and `git_clean` from the
prompt while leaving them live tools that a model can still call.

Per-persona grants (SWR-3008) MUST NOT inherit that weakness. The rule is:

1. **One resolver.** A single function composes the persona's grant for a server with that
   server's `disabled_tools`; a denial wins over a grant. An absent persona grant means the
   server's whole surface. A name in a grant list that the running server does not ship is
   inert — it is logged once, never an error, because a server version is not a contract.
2. **Enforced where tools are created.** The tool list handed to the model is filtered
   through the resolver, per server, so an ungranted or disabled tool is never presented.
   This holds whether the run uses the session-scoped shared MCP provider (SWR-1731) or the
   SDK's default one.
3. **Described the same way it is enforced.** The prompt's MCP section is built from the same
   resolver, so the tools a persona's prompt advertises are exactly the tools it holds.
4. **Post-connect probes are unaffected.** The per-server initialisation the shared provider
   performs — `git_set_working_dir` (itself a disabled tool) and Serena's `list_memories`
   binding probe (SWR-2905) — reads the server's own unfiltered tool list, so making
   `disabled_tools` real does not disarm them.

## Test coverage

Unit coverage for the resolver: an absent grant yields the whole surface; `disabled_tools`
denies a name a grant allows; a name the server does not ship is inert; a server-prefixed
tool name still matches its unprefixed grant entry. Unit coverage for the provider: a scoped
provider returns only granted tools while the shared per-server client keeps its whole tool
list, so the `git_set_working_dir` and `list_memories` probes still find their tool. Unit
coverage for the factory: the prompt's MCP section lists exactly the granted names, so prompt
and runtime cannot disagree.

The originating product flow is a read-only persona that cannot reach a Serena editing tool,
covered end-to-end by SWR-3008.

Derived from: [SWR-3008 — Per-persona Serena tool grants](../2800-project-initialization/SWR-3008-persona-serena-tool-grants.md)

Epic: [Configuration & MCP](../1700-config-mcp.md)
