---
req-id: [SWR-1700, SWR-1701, SWR-1704, SWR-1706, SWR-1707, SWR-1708, SWR-1709, SWR-1710, SWR-1711, SWR-1712, SWR-1713, SWR-1714, SWR-1715, SWR-1716, SWR-1717, SWR-1718, SWR-1719, SWR-1720, SWR-1721, SWR-1722, SWR-1723, SWR-1724, SWR-1725, SWR-1726, SWR-1727, SWR-1728, SWR-1729, SWR-1730]
status: approved
trace: required
test: required
title: "Configuration & MCP"
---

# 1700-config-mcp spec

## SWR-1700 — Configuration & MCP
trace: optional
test: optional

Layered configuration wiring, external MCP server discovery (mcp.json), MCP secrets management, and MCP merge warnings.

Derived requirements: [SWR-1731 — Session-scoped MCP client and tool-provider runtime](1700-config-mcp/SWR-1731-session-scoped-mcp-runtime.md), [SWR-1733 — MCP server config normalization must not mutate the input config](1700-config-mcp/SWR-1733-mcp-server-config-normalization-is-non-mutating.md), [SWR-3009 — MCP tool grants are enforced at tool creation](1700-config-mcp/SWR-3009-mcp-tool-grant-enforcement.md), [SWR-1734 — Project-settings snapshot is a versioned, atomic, secret-free store](1700-config-mcp/SWR-1734-project-settings-snapshot-store.md), [SWR-1735 — Snapshot models reach the config without overruling what the user set](1700-config-mcp/SWR-1735-snapshot-to-config-bridge.md)

## SWR-1701 — Shared Top-Level Merge Logic
legacy-id: REQ-20260414-155438-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-155438.md

Config merge behavior must be centralized so all top-level sections are merged consistently across loader and CLI override paths.

## SWR-1704 — LLM Runtime Wiring
legacy-id: REQ-20260414-155438-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-155438.md

`load_llm_for_model()` must pass configured model token limits and runtime model timeout into the OpenHands SDK `LLM`.

## SWR-1706 — Discover `mcp.json` files at standard locations (project-level `.mcp.json`, user-level `~/.config/mcp.json` or OS-equivalent) and parse them
legacy-id: REQ-20260503-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1707 — Parse the standard MCP JSON format: support `mcpServers` and `servers` top-level keys, `stdio` transport (`command`, `args`, `env`, `cwd`, `envFile`), and `http`/`sse` transport (`url`, `headers`)
legacy-id: REQ-20260503-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1708 — Merge discovered servers into `config.mcp_servers` with YAML config taking priority over discovered servers on name collision
legacy-id: REQ-20260503-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1709 — Extend `MCPServerConfig` schema to support HTTP/SSE transports (`type`, `url`, `headers`) alongside existing stdio fields
legacy-id: REQ-20260503-004
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1710 — Validate discovered server names against `^[a-zA-Z][a-zA-Z0-9_-]*$`; log warnings for invalid entries
legacy-id: REQ-20260503-005
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Medium



## SWR-1711 — Resolve `${workspaceFolder}` and `${env:VAR}` placeholders in `cwd` and `env` fields of discovered stdio servers
legacy-id: REQ-20260503-006
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Medium



## SWR-1712 — Load environment variables from `envFile` paths referenced in discovered stdio server configs
legacy-id: REQ-20260503-007
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Medium



## SWR-1713 — Update `_resolve_mcp_config()` to pass HTTP/SSE server configs to the OpenHands SDK without PATH checks
trace: optional
legacy-id: REQ-20260503-008
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Medium



## SWR-1714 — TUI info pane displays discovered vs. YAML-configured MCP servers with a visual indicator
trace: optional
legacy-id: REQ-20260503-009
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Low



## SWR-1715 — Support npm-based MCP servers: when a stdio server's `command` is an unprefixed npm package name (e.g. `@modelcontextprotocol/server-filesystem`), auto-resolve to `npx -y <package>` invocation
legacy-id: REQ-20260503-010
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1716 — Support `uvx`-based MCP servers: when a stdio server's `command` matches a Python package name invocable via `uvx`, auto-resolve to `uvx <package>` invocation
legacy-id: REQ-20260503-011
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Medium



## SWR-1717 — TUI: `/mcp` slash command opens an MCP management screen listing all discovered/available servers with on/off toggles
legacy-id: REQ-20260503-012
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1718 — TUI: MCP management screen also accessible via command palette entry (\"MCP Servers\")
legacy-id: REQ-20260503-013
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Medium



## SWR-1719 — MCP toggle state persists across app restarts in a JSON file in `~/.config/rotaris/mcp_toggles.json` (following `stash.py` pattern)
legacy-id: REQ-20260503-014
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1720 — Disabled MCP servers are excluded from the config dict passed to the OpenHands SDK (filtered in `_resolve_mcp_config()`)
legacy-id: REQ-20260503-015
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: High



## SWR-1721 — MCP management screen shows server source (discovered from `.mcp.json` / `agents.yaml` / missing command / HTTP-SSE), connection status, and server name
legacy-id: REQ-20260503-016
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-000000.md
priority: Medium



## SWR-1722 — CLI `rotaris-cli secrets` subcommand group supporting `set`, `list`, `unset`, and `edit` operations for MCP server environment variables
legacy-id: REQ-20260526-001
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-secrets-management.md
priority: High



## SWR-1723 — CLI `rotaris-cli config set-tavily-key` convenience command to set `TAVILY_API_KEY` for the Tavily MCP server
trace: optional
legacy-id: REQ-20260526-002
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-secrets-management.md
priority: High



## SWR-1724 — Persist MCP server env vars in a dedicated secrets file (`secrets.yaml` under workspace/global config dir), kept out of version control
legacy-id: REQ-20260526-003
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-secrets-management.md
priority: Medium



## SWR-1725 — TUI Settings screen/menu entry that allows browsing MCP servers and adding/editing/deleting env vars with a save button
legacy-id: REQ-20260526-004
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-secrets-management.md
priority: High



## SWR-1726 — Env var resolver merges shell environment and user-set secrets; user-set secrets take precedence at child-spawn time
legacy-id: REQ-20260526-005
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-secrets-management.md
priority: High



## SWR-1727 — CLI `list` operation displays env vars grouped by MCP server with masked values (shows only first/last 2 characters)
legacy-id: REQ-20260526-006
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-secrets-management.md
priority: Medium



## SWR-1728 — Secrets file excludes itself from `.gitignore` auto-generation and is never committed to version control
legacy-id: REQ-20260526-007
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-secrets-management.md
priority: Low



## SWR-1729 — MCP silent-drop warnings
legacy-id: REQ-20260629-001
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-mcp-warnings.md

When an MCP server referenced by a persona is not configured, not on PATH, or has tool discovery failures, a warning toast appears in the TUI and an issue is recorded in the session diagnostics (issues.json).

## SWR-1730 — Global MCP config merge verification
legacy-id: REQ-20260629-002
date: 2026-06-29
source: docs/requirement-log/done/requirements-20260629-mcp-warnings.md

Global MCP server definitions in `~/.config/rotaris/agents.yaml` survive the merge with a workspace that does not define `mcp_servers`. Verified via integration test.

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
