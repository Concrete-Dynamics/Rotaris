# MCP Server Integration — `mcp.json` discovery files

Part 5 of 6 of [domain 16](../16-mcp-integration.md), which indexes every part.

## Data & Formats

### `mcp.json` discovery files

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "some-package"],
      "env": {"KEY": "${env:KEY}"},
      "envFile": ".env",
      "cwd": "${workspaceFolder}/sub"
    },
    "remote": {"url": "https://example.test/mcp", "headers": {"X-Auth": "..."}}
  }
}
```

Top-level key `mcpServers` or `servers` (that order). Server names match `^[a-zA-Z][a-zA-Z0-9_-]*$`. Explicit `type` wins; else `url` implies `http`; else `stdio`. Files are read but never rewritten (REQ-MCP-027).

### YAML configuration (server + persona surface)

Under `mcp_servers:` (a named map) in global or workspace `agents.yaml` — fields per REQ-MCP-001. Personas carry `mcp_servers: [name, ...]` and optionally `mcp_tools: {server: [original tool name, ...]}` as an allow-list. The machine-maintained origin map `mcp_server_sources` records `"yaml" | "discovered-project" | "discovered-user" | "default"` per server and is never user-settable.

### Normalized runtime server description

Exactly these keys, no others (REQ-MCP-043):
- stdio: `{transport, command, args, env, cwd, [timeout]}` (`cwd` defaults to the workspace root)
- streamable HTTP / SSE: `{transport, url, [headers], [timeout]}`

`transport` takes exactly `stdio`, `http` (streamable HTTP) or `sse` — the same vocabulary as `type` in REQ-MCP-001. `timeout` is `request_timeout` as a number (seconds).

### Per-server enablement

No separate enablement file exists. The durable control is the entry's `enabled` field in the layered YAML configuration, default `true` (REQ-CONFIG-465); the desktop toggle is a session override that is never written to disk and is discarded at exit (REQ-MCP-094, REQ-MCP-115).

### Secrets — `secrets.yaml`

Per scope, next to `agents.yaml` (global config dir; workspace `.rotaris/`):

```yaml
my-server:
  API_KEY: "value"
```

How the file is written — atomicity, directory creation, and the owner-only protection every write leaves in place — is REQ-CONFIG-216's and this appendix holds no copy of it. Malformed content loads as empty; workspace beats global per key. An empty key or an empty value is skipped at load and refused at write, so masking's shortest input is one character. Every rendering of a stored secret value is masked by REQ-MCP-081, which this line does not restate. That requirement takes the mask itself from REQ-TOOLS-171, the product's single definition of it, and adds only that a value read out of this store is masked unconditionally; there is one mask across the product, not one for stored secrets and another for command lines and argument summaries.

### Ordering

One rule for every ordered presentation in this domain (REQ-MCP-117): ascending code-point order on the raw string, case-sensitive, locale-independent.

### Health probe outcome

Healthy or unreachable; the number of tools the server reported when healthy; human-readable error text when unreachable. Each probe opens its own connection and reports only that connection's outcome (REQ-MCP-054).

### Session diagnostics and run state

- Session issues file: one record per delivered MCP warning — kind `mcp_config`, severity `warning`, actor `orchestrator`, plus the warning text.
- Child-run state snapshot: `granted_tools` (native) and `granted_mcp_tools: {server: [tool, ...]}`.

### Project setup step status

`succeeded` | `failed` | `skipped-no-code` | `not-attempted` (REQ-MCP-099).

### Setup warm steps

Ids `warm:<family>:<package>` (families: uvx, npx), labels `Warm <package>`, capability tag `"<server> MCP server"`. Warm commands: `uvx --from <spec> <executable> --help`; `npx -y <pkg> --help`.

### Timing and pinning constants

Each value below is fixed by the requirement named beside it and is gathered here only so the whole
set can be read at once; where this table and a defining requirement differ, the requirement governs.

| Constant | Value | Defined by |
|---|---|---|
| Tool discovery timeout | 30 s | REQ-MCP-046 |
| Health probe timeout | 8 s | REQ-MCP-054 |
| Discovery bound beyond the discovery timeout | +5 s | REQ-MCP-053 |
| Post-connect hook budget (`lsp` init / binding probe) | 15 s | REQ-MCP-070 (`lsp` init), REQ-MCP-071 (binding probe) |
| Session connect-and-list budget (default) | 30 s | REQ-MCP-069 |
| Web-search per-tool-call timeout | 600 s | REQ-MCP-010 |
| Per-tool-call default when `request_timeout` is unset | 300 s | REQ-MCP-003 |
| Construction-warning acknowledgement on screen | the acknowledgement lifetime of REQ-NOTIFY-011; this document states no figure of its own (*amended 2026-09-06 under ESC-33; was 8 s*) | REQ-MCP-044 |
| Project setup step budgets (create / index / memories) | 300 / 1800 / 120 s | REQ-MCP-099 |
| Setup poll interval | 0.25 s | REQ-MCP-099 |
| Setup terminate grace | 5 s | REQ-MCP-099 |
| `browser` package pin | exact `MAJOR.MINOR.PATCH`; the string itself is the implementation's, recorded once and cross-checked against the setup manifest | REQ-MCP-010, REQ-MCP-095 |
| `code_intelligence` runtime pin | exact `MAJOR.MINOR.PATCH`; recorded in the binding manifest | REQ-MCP-011, REQ-MCP-116 |
