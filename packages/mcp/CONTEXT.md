# Tool Servers

External MCP servers integrated as tool providers for the product's personas. A missing or broken
server never fails a run: it is skipped, a warning reaches the user, and the run proceeds.

Terms are derived from `docs/spec/16-mcp-integration.md`. How a server is *granted* to an agent
belongs to [Tooling](../agent-tools/CONTEXT.md); how an entry is merged belongs to
[Configuration](../config/CONTEXT.md).

## Language

**Tool server**:
An external MCP server the product connects to and takes tools from. — `REQ-MCP` overview
_Avoid_: MCP server in prose where "tool server" reads better; the two are the same thing and the
settings category is spelled `mcp`

**Server entry**:
One declaration of a tool server — its name, its transport and that transport's fields. Server names
match `^[a-zA-Z][a-zA-Z0-9_-]*$`. — `REQ-MCP-001`

**Transport**:
How a connection is made: exactly `stdio`, `http` (streamable HTTP) or `sse`. — `REQ-MCP-001`,
`REQ-MCP-043`

**Origin**:
Where an entry came from — `yaml`, `discovered-project`, `discovered-user`, or `default` — recorded
in a machine-maintained map that is never user-settable. — `REQ-MCP` YAML configuration,
`REQ-CONFIG-222`
_Avoid_: source (reserved for a requirement source in the [Requirements](../workspace/src/traceability/CONTEXT.md)
context), provenance

**Discovery file**:
An `mcp.json` picked up automatically from a well-known location. These files are read and **never
rewritten**. — `REQ-MCP-017`, `REQ-MCP-027`

**Default entry**:
One of the three shipped servers — a remote web-search server, a headless browser-automation server,
and the bundled code-intelligence server. — `REQ-MCP` overview

**Code-intelligence runtime**:
Whatever runtime the build pins behind the server configured under the name `code_intelligence`. The
product names no package, vendor or product of its own for it, and the language servers it obtains
at first use of a language are declared like any other tool provisioned after installation. —
`REQ-MCP-010`, `REQ-MCP-116`, `REQ-MCP-118`

**Session connection**:
The single shared connection a session holds to a server, opened on first demand and closed exactly
once when the session ends. — `REQ-MCP` overview
_Avoid_: client, pool

**Grant**:
The subset of servers a persona carries. Whatever a persona's prompt lists is precisely what that
persona may invoke — no more, no less. — `REQ-MCP` overview, `REQ-TOOLS-166`

**Allow-list**:
A per-server narrowing of which of that server's tools a persona may call, keyed by the tool's
original name. — `REQ-MCP` YAML configuration

**Health**:
A server's probed condition: `unknown`, `checking`, `healthy`, `unreachable`. — `REQ-CONFIG-353`

**Session enable toggle**:
The desktop control that turns a server off for the current session only. It is never written to
disk and is discarded at exit; the durable control is the entry's `enabled` field. — `REQ-MCP-094`,
`REQ-MCP-115`, `REQ-CONFIG-465`

**Secret**:
A value held in `secrets.yaml` for a server, masked wherever it is rendered, unconditionally. —
`REQ-MCP-081`, `REQ-TOOLS-171`

**Binding manifest**:
The one place in the build where the pinned code-intelligence runtime's own identifiers are written — its distribution and
version, its transport arguments, and its tool names keyed by capability. Since `PD-MCP-004` it also records the **warm-up**. —
`REQ-MCP-116`
_Avoid_: tool map, pin file

**Binding probe**:
The run host's own call of the runtime's project-memory listing tool, once per connection to the code-intelligence server and
before that server's tools are offered, allowed 15 s; a failure warns and withholds nothing. — `REQ-MCP-071`

**Warm-up**:
A request the product makes on its own before forwarding a model's call, recorded in the binding manifest by capability: the
referencing-symbol search sent, with the same symbol and file, before every symbol rename forwarded to the code-intelligence
server, its answer discarded. It is no tool call — no record, total or notice — and shares the rename's one allowance. The code's
`warmUps` (the manifest's field) and `codeIntelligenceWarmUp` (the lookup) carry the term. — `PD-MCP-004`, extending
`REQ-MCP-116` and `REQ-MCP-015`
_Avoid_: pre-flight, priming
