---
req-id: [SWR-1700, SWR-1701, SWR-1702, SWR-1703, SWR-1704, SWR-1706, SWR-1707, SWR-1708, SWR-1709, SWR-1710, SWR-1711, SWR-1712, SWR-1713, SWR-1714, SWR-1715, SWR-1716, SWR-1717, SWR-1718, SWR-1719, SWR-1720, SWR-1721, SWR-1722, SWR-1723, SWR-1724, SWR-1725, SWR-1726, SWR-1727, SWR-1728, SWR-1729, SWR-1730]
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

Derived requirements: [SWR-1731 — Session-scoped MCP client and tool-provider runtime](1700-config-mcp/SWR-1731-session-scoped-mcp-runtime.md), [SWR-1733 — MCP server config normalization must not mutate the input config](1700-config-mcp/SWR-1733-mcp-server-config-normalization-is-non-mutating.md), [SWR-3009 — MCP tool grants are enforced at tool creation](1700-config-mcp/SWR-3009-mcp-tool-grant-enforcement.md)

## SWR-1701 — Shared Top-Level Merge Logic
legacy-id: REQ-20260414-155438-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-155438.md

Config merge behavior must be centralized so all top-level sections are merged consistently across loader and CLI override paths.

## SWR-1702 — Researcher Override Wiring
trace: optional
legacy-id: REQ-20260414-155438-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-155438.md

The top-level `researcher` config block must be loaded from scope config files and honored by CLI override config files.

## SWR-1703 — Researcher Validation
trace: optional
legacy-id: REQ-20260414-155438-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-155438.md

Validation must fail fast if `researcher.model` references an unknown model.

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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Config Wiring Hardening (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-155438.md` — document status: Complete

#### Description

Audit the configuration loading and application paths to prevent schema fields from being silently ignored at runtime. The work hardens top-level config merging across base config loading and CLI override files, and ensures model execution settings defined in config are actually passed through to the OpenHands SDK.

#### Implementation Notes

**Requirements Document:**

**Notes:**

- Fixed a stale test expectation for `backend-dev` prompt file naming to match the shipped default `prompts/backend_dev.md`.

- Verified against OpenHands SDK v1.17.0 local install and current upstream SDK documentation/examples.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Rotaris - External MCP Server Config Discovery (mcp.json) (2026-05-03)

Original: `docs/requirement-log/done/requirements-20260503-000000.md` — document status: Complete

#### Description

Rotaris currently requires all MCP servers to be declared in its own layered YAML config (`agents.yaml` under `mcp_servers:`). This feature adds automatic discovery and loading of MCP servers from standard `mcp.json` files found at conventional locations on the filesystem and in the repository. The goal is interoperability with other MCP clients (Claude Desktop, Cursor, VS Code, Cline, Claude Code) so that users can share a single MCP server configuration across tools without duplicating it in `agents.yaml`. Many MCP servers are distributed as npm packages (e.g. `@modelcontextprotocol/server-filesystem`) or Python packages via `uvx` (e.g. `computer-control-mcp`). The current YAML config requires verbose `command: "npx"` + `args: ["-y", "@scope/package"]` boilerplate. This feature adds auto-resolution of npm and uvx package names into their correct invocations. Additionally, users need a way to enable/disable discovered MCP servers without editing config files. This feature adds a TUI MCP management screen (accessible via `/mcp` slash command or command palette) with toggle switches and persistent state.

**Current behaviour:**

- MCP servers are declared exclusively in `agents.yaml` under the `mcp_servers:` key.

- The schema (`MCPServerConfig`) supports only stdio servers: `command`, `args`, `env`.

- Servers are loaded via the YAML config loader (`config/loader.py`) with field-wise overlay merge across global and workspace scopes.

- At runtime, `_resolve_mcp_config()` in `agents/factory.py` filters servers by `persona.mcp_servers`, checks PATH availability, and passes the config dict to the OpenHands SDK.

- There is **no** `mcp.json` file handling.

**What needs to change:**

1. Add a discovery mechanism that searches standard locations for `mcp.json` (or `mcpServers.json`) files.

2. Parse the standard MCP JSON format: top-level `mcpServers` or `servers` key, with `stdio` (command/args/env/cwd/envFile) and `http`/`sse` (url/headers) transport types.

3. Merge discovered servers into the existing `config.mcp_servers` dict with a defined precedence (YAML config takes priority over discovered servers).

4. Extend `MCPServerConfig` to support HTTP/SSE transports (`url`, `type`, `headers`) in addition to stdio fields.

5. Update `_resolve_mcp_config()` to pass HTTP/SSE server configs to the OpenHands SDK (the SDK already supports `url`/`auth` for HTTP/SSE - no PATH check needed for those).

6. Add validation for server names matching `^[a-zA-Z][a-zA-Z0-9_-]*$`.

7. Auto-resolve npm/uvx package names in `command` fields to their correct invocations (`npx -y <pkg>`, `uvx <pkg>`).

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `MCPServerConfig` schema extension (REQ-20260503-004) must be done before merge logic (REQ-20260503-003)

- Blocks: TUI display update (REQ-20260503-009)

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution None | - | No conflicts found. The existing MCP system is YAML-only; this feature adds a parallel discovery path.

**Notes:**

- **No dedicated Python package** exists for parsing MCP JSON configs. The approach will be custom parsing with `json.load()` + Pydantic validation - consistent with how other MCP clients handle this.

- The de facto `mcp.json` format is not yet an official spec (GitHub MCP Discussion #681), but the format is remarkably consistent across Claude Desktop, Cursor, VS Code, Cline, and Claude Code.

- Standard locations to search:

- Project-level: `<workspace_root>/.mcp.json`

- User-level: `~/.config/mcp.json` (Linux), `~/Library/Application Support/mcp.json` (macOS), `%APPDATA%/mcp.json` (Windows)

- The OpenHands SDK (v1.16+) uses **FastMCP** under the hood and already supports both stdio and HTTP/SSE transports. The SDK accepts a `{"mcpServers": {...}}` dict - it does **not** parse mcp.json files itself. We handle file discovery and format conversion; the SDK only receives the normalized dict.

- The SDK has a known subprocess leak bug (MCPToolExecutor does not implement `close()`) - less critical for Rotaris since it is single-process and the OS cleans up on exit.

- `envFile` resolution should use a lightweight approach (e.g., `python-dotenv` if already a dependency, or a simple line-by-line parser).

- 2026-05-03: T3 added `config.mcp_resolution.resolve_command()` plus focused unit coverage for npm/uvx shorthand expansion, warning logs, path/executable passthrough, and arg immutability. Status remains **Partial** until T5 wires the resolver into `agents.factory._normalize_mcp_server_config()`.

**npm MCP server auto-resolution:**

Many MCP servers are distributed as npm packages and invoked via `npx`. Common patterns in `mcp.json`:

```json
{
"mcpServers": {
"filesystem": {
"command": "npx",
"args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
},
"github": {
"command": "npx",
"args": ["-y", "@modelcontextprotocol/server-github"]
}
```

The auto-resolution logic should:

1. Detect when `command` is an npm package name (starts with `@` or matches `^[a-z][a-z0-9-]*$` and is not a known system executable)

2. Auto-resolve to `npx -y <package>` with any additional `args` appended

3. Check that `npx` is available on PATH before resolving; log a warning if not

4. Support scoped packages (`@scope/package`) and unscoped packages

5. Support `npm:` prefix in `command` (e.g., `npm:@scope/package`) as an alias for auto-resolution

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] A `.mcp.json` file in the project root with stdio and HTTP servers is discovered and loaded automatically on config initialization

- [ ] A `mcp.json` file in `~/.config/mcp.json` (or OS-equivalent) is discovered and loaded

- [ ] When the same server name exists in both `.mcp.json` and `agents.yaml`, the `agents.yaml` definition wins

- [ ] HTTP/SSE servers from `mcp.json` are passed to the SDK with their `url` and `headers` intact

- [ ] Stdio servers with `envFile` have their environment variables resolved before being passed to the SDK

- [ ] `${workspaceFolder}` placeholders in `cwd` fields are resolved to the actual workspace root

- [ ] `${env:VAR}` placeholders in `env` values are resolved from the process environment

- [ ] Invalid server names in `mcp.json` produce a warning log and are skipped

- [ ] Missing `mcp.json` files at standard locations are silently ignored (no error)

- [ ] Existing YAML-only MCP configuration continues to work unchanged (no regression)

- [ ] An npm package name (e.g. `@modelcontextprotocol/server-filesystem`) in the `command` field is auto-resolved to `npx -y @modelcontextprotocol/server-filesystem`

- [ ] A `uvx`-invocable Python package name (e.g. `computer-control-mcp`) in the `command` field is auto-resolved to `uvx computer-control-mcp`

- [ ] Auto-resolution only applies when `command` is not already a known executable (`npx`, `uvx`, `node`, `python`, etc.) and not an absolute/relative path

- [ ] Typing `/mcp` in the InputComposer opens an MCP management screen listing all available servers with on/off toggles

- [ ] The MCP management screen is also accessible via the command palette (search "MCP" or "mcp")

- [ ] Toggling a server on/off in the management screen immediately updates the toggle state

- [ ] Toggle state is persisted to `~/.config/rotaris/mcp_toggles.json` and restored on app restart

- [ ] Disabled servers are excluded from the `mcpServers` dict passed to the OpenHands SDK

- [ ] The management screen shows each server's source (`.mcp.json` / `agents.yaml` / missing command / HTTP-SSE)

- [ ] The management screen shows connection status for stdio servers (available on PATH / not found)

- [ ] Toggling servers during an active run does not crash the app; changes apply on next run iteration

### Rotaris - MCP Secrets Management (CLI + TUI) (2026-05-26)

Original: `docs/requirement-log/done/requirements-20260526-secrets-management.md` — document status: Done

#### Description

Provide users with first-class ways to supply sensitive secret values (e.g. Tavily API key) and arbitrary key-value environment variables to MCP servers, accessible through both the CLI (`rotaris-cli config …`) and the TUI settings/edit screen. This eliminates the current reliance on manual shell environment variables (`${TAVILY_API_KEY}`) or hand-edited YAML config files for per-server secrets.

**Problem being solved:**

MCP servers often require API keys or credentials as environment variables. Today users must:

1. Set the env var in their shell before launching Rotaris (fragile, session-dependent).

2. Manually edit `agents.yaml` with `${VAR_NAME}` placeholders (error-prone, no validation).

3. Hardcode secrets into config files (security risk, especially for git-committed configs).

There is no guided interface for entering or rotating MCP server secrets.

**Current behaviour:**

- `MCPServerConfig.env` is a `dict[str, str]` in the schema - the plumbing for env vars already exists.

- Default persona configs reference MCP servers like `tavily-search` with `"TAVILY_API_KEY": "${TAVILY_API_KEY}"` in env.

- The login command handles OAuth credential flows for LLM providers (Copilot device flow, Codex PKCE) but not for MCP server secrets.

- Config files (`agents.yaml`) support the `env` map under each MCP server definition.

- The TUI has no dedicated settings/configuration management screen.

**What needs to change:**

1. **CLI command** to set, list, and clear MCP server environment variables persistently in a dedicated secrets file (not the YAML config).

2. **CLI command** to quickly set a well-known secret like Tavily API key with validation feedback.

3. **TUI menu entry / screen** that mirrors the CLI capabilities: browse MCP servers, enter/set/clear env vars, persisted the same way.

4. On startup / child spawn, the env var resolver merges shell env → user-set secrets (secrets override shell).

**Status:** Done

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `MCPServerConfig.env` schema (already exists in `schema.py`)

- Depends on: Env var merging logic during child MCP server spawn (currently shell env only - extends existing mechanism)

- Blocks: Any future MCP server requiring API keys or tokens

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution REQ-20260413-… (config layering) | Secrets file location must respect global < workspace overlay like `agents.yaml` | Secrets file goes to same dirs (`~/.config/rotaris/secrets.yaml` / `.rotaris/secrets.yaml`), workspace wins REQ-20260413-… (login command exists) | Login handles LLM auth; secrets handles MCP env - overlap? | Separation by concern: login = OAuth identity; secrets = static env vars for tools. No overlap

**Notes:**

Assumptions made:

1. The secrets file format is `secrets.yaml` (simple flat or per-server nesting), located alongside `agents.yaml` in the same config hierarchy. This avoids re-using `agents.yaml` where secrets would mix with structural config.

2. Encryption-at-rest is deferred to a future requirement (Low priority). The file is stored unencrypted but `.gitignore`-excluded by convention - users can manually encrypt later. This keeps MVP scope focused.

3. Well-known secret names (Tavily → `TAVILY_API_KEY`) use predefined mappings rather than requiring the user to know the env var name. Future extensibility could add more convenience commands for other MCP servers.

4. Shell env var values take effect when no secrets file entry exists for the same key - this maintains backward compatibility with existing `${VAR_NAME}` setups.

5. In the TUI, env var editing occurs inline within the existing grid/list structure of a settings screen - not as a modal dialog (minimises interaction steps).

Out of scope:

- OAuth/token refresh flows for MCP servers that support it (those belong in the auth subsystem, not secrets).

- Secret rotation reminders or expiration policies.

- Cross-platform keyring / OS vault integration.

- Passing secrets through to child _persona_ processes (only MCP server env at present).

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] Running `rotaris-cli secrets set <server-name> <KEY> <VALUE>` stores the pair in the secrets file and confirms success with a Rich/CLI message

- [ ] Running `rotaris-cli secrets unset <server-name> <KEY>` removes the pair and confirms

- [ ] Running `rotaris-cli secrets list` shows all stored pairs masked (e.g. `TAVILY_API_KEY: tv····LY`)

- [ ] Running `rotaris-cli secrets unset-all <server-name>` clears all secrets for a given server

- [ ] Running `rotaris-cli config set-tavily-key` prompts for the key (if not passed as arg), saves it, and echoes back masked confirmation

- [ ] Starting a TUI session reveals a **Settings** entry in the TopBar or Command Palette

- [ ] Inside the TUI Settings screen, selecting an MCP server shows its current env vars (masked) with an "Add" / "Edit" / "Delete" button per row

- [ ] Saving in the TUI Settings screen writes to the same secrets file the CLI uses

- [ ] A spawned child MCP server receives the merged env (shell + secrets) when it starts

- [ ] Masked values in all UI/CLI output reveal only first 2 and last 2 characters of the value

- [ ] The secrets file path follows the layered config convention: workspace-level takes precedence over global-level

- [ ] No raw secret values appear in log output, TUI notifications, or CLI stdout

### MCP Silent-Drop Warnings & Global MCP Merge (2026-06-29)

Original: `docs/requirement-log/done/requirements-20260629-mcp-warnings.md` — document status: Complete

#### Description

Two problems discovered during session analysis:

1. **MCP initialization failures are silently dropped.** When an MCP server is referenced by a persona but not configured, or its command is not on PATH, or tool discovery fails — no visible warning reaches the user. The agent works without essential tools and nobody notices.

2. **Global MCP servers were suspected of not surviving the workspace config merge.** Need to verify and fix if broken.

#### Implementation Notes

**Files changed:**

- `src/rotaris_core/agents/factory.py`:
  - `_resolve_mcp_config()` now returns `tuple[dict, list[str]]` — the second element is a list of warning messages.
  - Added detection: servers in `persona.mcp_servers` but not in `config.mcp_servers` → warning.
  - Added detection: servers that fail the PATH check (`shutil.which` returns None) → warning.
  - `ResolvedPersonaRuntime` gained `mcp_config_warnings: list[str]` field to carry all warnings.
  - `resolve_persona_runtime()` collects all three categories: missing-from-config, PATH-not-found, and discovery-failed.
  - `create_agent_for_persona()` fires both the existing `mcp_failure_callback` (TUI notification) and a new `mcp_issue_callback` (session issue) for ALL warnings.
- `src/rotaris_core/tui/ralph_loop.py`:
  - Updated `_mcp_failure_callback` to accept full warning messages (not just server names).
  - Added `_mcp_issue_callback` wired to `self.scheduler.diagnostics.issue()`.
- `tests/unit/test_agent_factory.py`:
  - Updated 6 existing tests to unpack the new tuple return from `_resolve_mcp_config`.
  - Added 3 new tests: `test_resolve_mcp_config_warns_when_server_not_in_config`, `test_resolve_mcp_config_warns_when_command_not_on_path`, `test_resolve_mcp_config_no_warnings_when_everything_works`.
- `tests/unit/test_persona_runtime_resolution.py`:
  - Fixed pre-existing test `test_resolved_runtime_prompt_matches_coordinator_only_tools` which had outdated assertions about the `coordinator_tools` set (now includes `read_file`).

**Design decision:** Pattern (C) from Architecture Steward review — factory collects warnings on `ResolvedPersonaRuntime`, callbacks bridge to TUI and session diagnostics. No `SchedulerDiagnosticsProxy` import in factory.py (avoids circular imports).


**Files changed:**

- `tests/integration/test_config_e2e.py`:
  - Added `test_global_mcp_servers_survive_workspace_without_mcp` — verifies that global MCP servers appear in the merged config when the workspace has no `mcp_servers` key. Confirmed: merge already works correctly; the test provides regression protection.

#### Acceptance Criteria

- [x] Missing-from-config MCP server → TUI warning toast + session issue
- [x] Command-not-on-PATH MCP server → TUI warning toast + session issue (pre-existing log.warning now also surfaces to user)
- [x] Discovery-failed MCP server → TUI warning toast + session issue (pre-existing mcp_failure_callback now also emits issue)
- [x] Global MCP servers survive workspace without `mcp_servers` key (proved via integration test)
- [x] All existing `_resolve_mcp_config` tests updated and pass
- [x] New unit tests for warning behavior pass
- [x] Lint passes (4 pre-existing issues only)
- [x] Version bumped to 0.59.46
