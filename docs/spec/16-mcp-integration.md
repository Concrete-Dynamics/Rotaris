---
reference: ROTARIS-CRW-001
domain: mcp-integration
date: 2026-08-29
status: draft
---

# MCP Server Integration

## Overview

The product integrates external MCP (Model Context Protocol) servers as tool providers for its agent personas. Server entries come from three merged sources: layered YAML configuration, files named `mcp.json` picked up automatically from well-known locations, and three shipped default entries (a remote web-search server, a headless browser-automation server, and a bundled code-intelligence server). Each persona carries a subset of servers and, optionally, a per-server tool allow-list; whatever a persona's prompt lists is precisely what that persona may invoke — no more, no less. A missing or broken server never fails a run: it is skipped, a warning reaches the user, and the run proceeds. Within one session each server has exactly one shared connection, opened on first demand and closed a single time when the session ends. Users manage servers through a terminal-UI toggle screen, a desktop settings tab with health probing, and a secrets store whose values are always masked in output.

## Requirements

### Server Configuration Model

- **REQ-MCP-001** — A server entry SHALL support exactly these fields with these defaults: `type` (one of `"stdio"`, `"http"`, `"sse"`; default `"stdio"`), `command` (string, optional), `args` (list of strings, default empty), `env` (string-to-string map, default empty), `cwd` (string, optional), `url` (string, optional), `headers` (string-to-string map, optional), `request_timeout` (integer seconds, optional), `disabled_tools` (list of strings, default empty), `tool_name_map` (string-to-string map, default empty), and `tools` — an optional static tool-metadata list, default empty, whose entries carry a required `name` and a `description` defaulting to `""`.

- **REQ-MCP-002** — A server entry that comes from a YAML scope SHALL be rejected at configuration load, with an error naming the offending server, its transport type and the field that is missing, when a `stdio` entry omits `command` or when an `http`/`sse` entry omits `url`. The same defect in an entry read from an `mcp.json` discovery file SHALL NOT fail loading; that entry alone is dropped with a warning (REQ-MCP-018, REQ-MCP-023). A `command` that is present but set to the empty string is not caught by this check; whether such an entry is legal at all is disputed with REQ-MCP-029, REQ-MCP-037 and REQ-MCP-079 (Open Question 12).

- **REQ-MCP-003** — `request_timeout` is a whole number of seconds. When it is set on a server entry, every individual tool call to that server SHALL be allowed that many seconds, measured from the dispatch of the call to the receipt of its result, and the same allowance SHALL apply to every tool that server exposes. The allowance is per call: each call starts with the full budget regardless of time consumed by earlier calls. `request_timeout` SHALL NOT govern tool discovery (REQ-MCP-046) or health probing (REQ-MCP-054), each of which carries its own budget. When `request_timeout` is unset the allowance is the executing agent runtime's documented default of 300 seconds. What the caller observes once the allowance is exhausted belongs to that external runtime and is not fixed here (Open Question 3); whether a zero or negative `request_timeout` is accepted, rejected or treated as unset is likewise not fixed here (Open Question 24).

- **REQ-MCP-004** — A tool SHALL be denied when any candidate spelling of REQ-MCP-057, derived from the name the server itself reports, matches an entry of `disabled_tools`. A denied tool SHALL appear neither in the persona prompt nor among the tools the persona can call, and SHALL stay denied even when a persona grant names it: denial outranks every grant (REQ-MCP-056).

- **REQ-MCP-005** — `tool_name_map` SHALL map names the server reports (keys) to replacement names (values). A rename SHALL be applied only to tools that survive `disabled_tools` filtering (REQ-MCP-049) and SHALL leave the tool's description unchanged. Matching in `disabled_tools` and in persona grants SHALL be performed against the candidate spellings of REQ-MCP-057 derived from the server-reported name only, so an entry written against a replacement name SHALL match nothing. Whether a replacement name also becomes the name the model calls, or only the name printed in the prompt, is disputed between this requirement and REQ-MCP-062 / REQ-MCP-101 (Open Question 13).

- **REQ-MCP-006** — The runtime tool surface of a server SHALL always come from live discovery (REQ-MCP-046); the static `tools` list on a server entry SHALL have no effect on which tools are advertised or callable.

- **REQ-MCP-007** — A persona SHALL support: `mcp_servers` (list of server names it carries) and `mcp_tools`, an optional per-server tool grant map (server name drawn from `mcp_servers` → list of original tool names). Given a carried server with no grant entry (or the whole map unset), the persona receives every tool that server exposes; given a grant entry that is an empty list, the persona receives none of that server's tools. Server-level `disabled_tools` applies on top of any grant.

- **REQ-MCP-008** — The top-level configuration SHALL carry a named map of server entries under `mcp_servers` and a machine-maintained per-server origin map under `mcp_server_sources` (values per REQ-MCP-026). The origin map SHALL never be user-settable; hand-written values are overwritten during loading.

- **REQ-MCP-009** — Resolving a persona's server set SHALL be side-effect free on configuration: given the same configuration shared across personas and repeated resolutions, when any persona is resolved, then no configured entry (including its `args` list) is observably changed and every resolution yields identical results.

### Shipped Default Servers

- **REQ-MCP-010** — The built-in defaults SHALL contain exactly three server entries and no others:
  - a **web-search** entry: remote transport over HTTP, whose `url` embeds a `${VAR}` placeholder naming the environment variable that carries its API key (substituted per REQ-MCP-088), with `request_timeout` 600;
  - a **browser-automation** entry: `stdio` transport whose `command` is `npx` and whose `args` carry the non-interactive install flag `-y`, name the package at the exact version `0.0.75` (never a range and never a floating tag), and select headless operation;
  - a **code-intelligence** entry: `stdio` transport whose `command` is the reserved bundled-runtime token of REQ-MCP-033 and whose `args` select stdio transport and the host-integration mode in which the server does not advertise its own file-read, directory-listing or shell tools while continuing to advertise its pattern-search tool, and which carries no project path — the path is supplied per run by REQ-MCP-034.

  On these three entries, no field beyond those named above SHALL be set; every other field takes the default given in REQ-MCP-001. In particular, only the web-search entry carries a `request_timeout`, so tool calls to the browser-automation and code-intelligence defaults are bounded by the 300-second fallback of REQ-MCP-003, and none of the three carries `disabled_tools`, `tool_name_map` or a static `tools` list.

  The literal configuration key of each of the three entries, the web-search URL template and the name of its API-key environment variable, and the browser-automation package identifier and headless argument are not fixed by this document (Open Question 14).

- **REQ-MCP-011** — The default code-intelligence entry SHALL pin the bundled runtime to the exact release `1.7.0`, written as a complete `MAJOR.MINOR.PATCH` version string. That entry SHALL NOT name a branch, a repository revision, a floating tag such as `latest`, or a version range; the pin SHALL be verifiable by inspecting the shipped default entry alone. Two installations of the same product build SHALL consequently start runtime version `1.7.0`. The distribution identifier to which the pin applies is not fixed by this document (Open Question 14).

- **REQ-MCP-012** — No default server named `lsp` SHALL ship, and no default persona SHALL reference one. The name remains user-configurable; a persona referencing `lsp` (or any name) without a matching server entry SHALL fail validation per REQ-MCP-103.

- **REQ-MCP-013** — No git-inspection MCP server SHALL ship in the defaults or be referenced by any default persona. Read-only git inspection SHALL remain achievable as a user configuration pattern by combining a user-added server with a per-server tool allow-list (e.g. granting only a status tool) and/or `disabled_tools`.

- **REQ-MCP-014** — Each built-in persona named in the table below SHALL carry exactly the servers listed in its row and no others, and its `mcp_tools` grant for the code-intelligence server SHALL be exactly the set union of the tiers named in its row (tiers defined in REQ-MCP-015). A row naming no server means an empty `mcp_servers` list for that persona. Whether these fifteen rows are the complete set of built-in personas is not fixed by this document (Open Question 26).

  | Persona | Servers carried | Code-intelligence grant tiers |
  |---|---|---|
  | orchestrator | web-search, code-intelligence | READ + MEMORY-WRITE |
  | intent-classifier | (none) | — |
  | architect | web-search, code-intelligence | READ + MEMORY-WRITE |
  | coding-agent | code-intelligence | READ + EDIT + MEMORY-WRITE |
  | tester | browser-automation, code-intelligence | READ + EDIT + MEMORY-WRITE |
  | docs-writer | web-search, code-intelligence | READ + MEMORY-WRITE |
  | refactorer | code-intelligence | READ + EDIT + MEMORY-WRITE |
  | planner | web-search, code-intelligence | READ + MEMORY-WRITE |
  | requirements-engineer | code-intelligence | READ + MEMORY-WRITE |
  | librarian | web-search | — (no code-intelligence server) |
  | codebase-analyst | code-intelligence | READ + MEMORY-WRITE |
  | verifier | code-intelligence | READ + MEMORY-WRITE |
  | ui-verifier | browser-automation, code-intelligence | READ + MEMORY-WRITE |
  | gatekeeper | (none) | — |
  | project-initializer | code-intelligence | READ + MEMORY-WRITE + ONBOARDING |

  Where a persona carries the browser-automation or the web-search server it SHALL have no `mcp_tools` entry for that server, and SHALL therefore receive that server's whole discovered surface (REQ-MCP-007).

- **REQ-MCP-015** — The four code-intelligence grant tiers SHALL be composed from the tool names the pinned runtime of REQ-MCP-011 reports, with exactly these cardinalities and coverage:
  - **READ** — ten tools: symbol lookup, per-file symbol overview, referencing-symbol search, implementation search, declaration search, pattern search, per-file diagnostics, project-memory listing, project-memory reading, and usage-instruction retrieval.
  - **EDIT** — seven tools: symbol-body replacement, insertion before a symbol, insertion after a symbol, symbol rename, safe symbol deletion, single-file content replacement, and cross-file content replacement. Carried only by coding-agent, tester and refactorer.
  - **MEMORY-WRITE** — two tools: project-memory writing and project-memory editing. Carried by every persona that carries the code-intelligence server.
  - **ONBOARDING** — one tool: project onboarding. Carried only by project-initializer.

  The four tiers are pairwise disjoint sets of tool names, so a persona's code-intelligence grant holds a countable number of names: 12 for READ + MEMORY-WRITE, 19 for READ + EDIT + MEMORY-WRITE, and 13 for READ + MEMORY-WRITE + ONBOARDING. No built-in grant SHALL name the runtime's memory-deletion, memory-rename or dashboard-opening tools, and every name appearing in a built-in grant SHALL be a name the pinned runtime returns from `tools/list`. The literal name strings for each tier are not fixed by this document (Open Question 17).

- **REQ-MCP-016** — Every persona that carries the code-intelligence server per REQ-MCP-014 SHALL list all three of the product's own tool names `grep` (content search), `glob` (path matching) and `read_file` among its non-MCP tools, and SHALL be able to call all three. This is verifiable by inspecting each such persona's non-MCP tool list for those three literal names; it holds regardless of the code-intelligence server withholding its own file-read and directory-listing tools in the mode of REQ-MCP-010.

### Configuration Auto-Discovery (`mcp.json`)

- **REQ-MCP-017** — Discovery SHALL read at most two files: the project-level `<workspace_root>/.mcp.json` (origin tag `discovered-project`) and one user-level file (origin tag `discovered-user`) located per platform: macOS `~/Library/Application Support/mcp.json`; Windows `%APPDATA%/mcp.json` (when `APPDATA` is unset, user-level discovery is skipped entirely); other systems `~/.config/mcp.json`.

- **REQ-MCP-018** — A discovery file's servers SHALL be read from the top-level key `mcpServers`, or failing that `servers` (checked in that order); if neither holds an object, the file contributes nothing. A missing file SHALL be silently ignored; unreadable or invalid JSON SHALL log a warning naming the file and contribute nothing; a JSON root that is not an object SHALL log a warning and contribute nothing. None of these conditions may fail configuration loading.

- **REQ-MCP-019** — Discovered server names SHALL match `^[a-zA-Z][a-zA-Z0-9_-]*$`; a non-matching name SHALL be skipped with a warning naming the offending name and file. A server entry whose value is not an object SHALL likewise be skipped with a warning.

- **REQ-MCP-020** — Per-entry transport determination SHALL be: an explicit `type` wins; otherwise `http` when a `url` is present, else `stdio`. Stdio entries SHALL accept `command`, `args` (default empty), `env`, `cwd`, and `envFile`; remote entries SHALL accept `url` and `headers` while retaining `env` and `cwd`.

- **REQ-MCP-021** — An `envFile` path SHALL resolve relative to the declaring file's directory and be parsed line-by-line as `KEY=VALUE`, skipping blank lines and `#` comments and stripping single or double quotes around values. An unreadable `envFile` SHALL log a warning and yield an empty map without aborting discovery. Explicit `env` entries SHALL override `envFile` entries on key collision.

- **REQ-MCP-022** — In discovered `env` values and `cwd`, the placeholder `${workspaceFolder}` SHALL resolve to the workspace root and `${env:VAR}` SHALL resolve to the process environment (empty string when unset); `cwd` SHALL additionally be path-normalized. Any other `${...}` placeholder SHALL stay literal with a warning.

- **REQ-MCP-023** — Any failure while parsing one server entry (for example, a stdio entry without a command) SHALL skip only that entry with a warning naming the server and its source; discovery of the remaining entries continues.

- **REQ-MCP-024** — On a name collision between the user-level and project-level discovery files, the project-level entry SHALL win.

- **REQ-MCP-025** — Whole-configuration merge order for servers SHALL be: built-in defaults → discovered `mcp.json` servers → global `agents.yaml` (per-user configuration directory) → workspace `agents.yaml` (`<workspace>/.rotaris/agents.yaml`). Same-named entries from later scopes merge field-wise into earlier ones. Consequences that SHALL hold: discovered servers override same-named defaults; YAML in either scope overrides discovered entries; global YAML servers survive a workspace configuration that has no server section at all.

- **REQ-MCP-026** — After merging, the origin map SHALL record, per final server name: `"yaml"` when any YAML scope named it, else the discovery tag (`"discovered-project"` / `"discovered-user"`), else `"default"`.

- **REQ-MCP-027** — A discovery file SHALL be consumed read-only: after any number of configuration loads, every `mcp.json` the product has read SHALL be byte-for-byte identical to its content before those loads — nothing rewritten, reformatted, reordered, or added. A file that uses only the keys named in REQ-MCP-018, REQ-MCP-020 and REQ-MCP-021 SHALL load without the user editing it first. What the agent runtime receives SHALL be the normalized description of REQ-MCP-043, never the discovery file's own shape. Whether a key outside that set is ignored or causes its entry to be skipped is not determined by this document (Open Question 18).

### Command Resolution

- **REQ-MCP-028** — Path-like commands SHALL never be rewritten by shorthand resolution: commands starting with `/`, `./`, `../`, or `~`, containing a backslash, or in drive-letter form (`X:...`) pass through unchanged.

- **REQ-MCP-029** — A fixed known-executable set SHALL pass through unchanged: `npx`, `npm`, `node`, `uvx`, `uv`, `pipx`, `pip`, `python`, `python3`, `deno`, `bun`, `docker`, `podman`, `bash`, `sh`, `zsh`, `fish`, `cmd`, `powershell`, `pwsh`, `go`, `cargo`, `java`. An empty command likewise passes through unchanged.

- **REQ-MCP-030** — The shorthand `uvx:<pkg>` SHALL resolve to command `uvx` with `<pkg>` prepended to the arguments; bare `uvx:` passes through unchanged. When `uvx` is not on PATH, a warning SHALL be logged naming the original command, but resolution still occurs (availability is judged separately, REQ-MCP-037).

- **REQ-MCP-031** — The shorthand `npm:<pkg>`, or any command starting with `@` (a scoped package), SHALL resolve to command `npx` with arguments `-y <pkg>` prepended; bare `npm:` passes through unchanged; a missing `npx` logs the analogous warning.

- **REQ-MCP-032** — Any other bare command name SHALL pass through unchanged — no implicit package-manager guessing for unscoped names.

- **REQ-MCP-033** — A reserved command token SHALL be accepted in place of a real executable for the bundled code-intelligence runtime. A `stdio` entry whose `command` equals that token SHALL resolve to a launch of the bundled code-intelligence server: in an interpreted installation, through the application's own language runtime; in a frozen single-binary installation, through the application's own executable with a reserved sentinel as its first argument. A process started with that sentinel SHALL answer the MCP protocol as the code-intelligence server, SHALL present no user interface of any kind, and SHALL terminate with the exit status the server produced — whatever that status is, the parent process observes the server's own code and no substitute. The literal spelling of the token and of the sentinel is not fixed by this document (Open Question 15).

- **REQ-MCP-034** — When a `stdio` entry's resolved arguments contain the code-intelligence runtime's server-launch subcommand and contain no project-selection argument (neither the explicit project-path option nor the option that takes the project from the working directory), the command line resolved for a run SHALL be the configured one with exactly two further arguments appended at the end of the argument list: the project-path option, followed by that run's workspace root as a separate argument. The match SHALL be made on the presence of the launch subcommand alone, independently of the entry's configured name, so any entry that launches that runtime is bound and no other `stdio` entry is altered. A project-selection argument already present SHALL be left exactly as configured. For a run against an isolated working tree, the appended path SHALL be that tree's root. A server launched with a project path SHALL NOT advertise its project-switching or configuration-introspection tools in `tools/list`. The literal spellings of the subcommand and of the two project-selection options are not fixed by this document (Open Question 16).

- **REQ-MCP-035** — Filesystem-server path fill-in: given a stdio server one of whose resolved arguments is exactly one of the recognized filesystem-server package identifiers — `@modelcontextprotocol/server-filesystem` or `filesystem-mcp` — then, taking the arguments that follow that one as the path arguments: with no path arguments, the workspace root SHALL be appended; with exactly one path argument that does not exist on disk and a server whose configured name is literally `filesystem`, everything after the package identifier SHALL be replaced by the workspace root, accompanied by a warning naming the server, the missing path, and the substituted workspace root; in every other case the arguments SHALL be left untouched.

- **REQ-MCP-036** — A command-line invocation of the code-intelligence runtime SHALL be derivable from the configured server entry, so that the project setup of REQ-MCP-099 drives the same build the server itself runs. The derived invocation is a command plus an argument list: the command is the entry's resolved `command` (shorthands of REQ-MCP-030 to REQ-MCP-033 expanded), and the argument list is exactly the prefix of the entry's resolved arguments that precedes the first occurrence of the server-launch subcommand, that subcommand and everything after it excluded. Transport, mode and project-selection arguments SHALL therefore never appear in the derived invocation. No invocation SHALL be derived for a remote entry, for an entry whose `command` is empty, or for an entry whose arguments contain no launch subcommand; in each of those cases the dependent setup task SHALL be reported as unavailable with the non-retryable failure of REQ-MCP-099, and no substitute command SHALL be used. The literal spelling of the launch subcommand is not fixed by this document (Open Question 16).

### Availability and Drop-Not-Fail Semantics

- **REQ-MCP-037** — A single availability rule SHALL be used by every surface (agent construction, terminal UI, desktop UI, initialization-task gating): `http`/`sse` servers count as available unconditionally (nothing probes reachability at configuration time); a `stdio` server is available if and only if its command — after shorthand resolution (and, when a workspace is supplied, the full stdio resolution path) — is found on PATH. Supplying a workspace root SHALL never change the answer. No two surfaces may disagree on availability for the same configuration. The treatment of an entry whose `command` is the empty string is disputed with REQ-MCP-079 (Open Question 12).

- **REQ-MCP-038** — Given a persona referencing a server name absent from configuration, when the persona is resolved, then a warning SHALL be produced naming both the server and the persona, and the run proceeds without that server.

- **REQ-MCP-039** — Given a persona whose generic tool list names a configured MCP server, when the persona is resolved, then the name SHALL be treated as an MCP server with a logged warning advising the user to move it to the server list (see also REQ-MCP-105).

- **REQ-MCP-040** — Servers disabled by the user toggle store (REQ-MCP-076) SHALL be skipped at persona resolution with an informational log naming the server.

- **REQ-MCP-041** — Given an unavailable stdio server carried by a persona, when the agent is constructed, then the server SHALL be dropped with a per-persona warning stating the command was not found on PATH and tools will not be available; additionally, a detailed log line including both the raw and resolved command SHALL be emitted at most once per server per process. The run SHALL never fail for this reason, and the UI SHALL show the server as unavailable.

- **REQ-MCP-042** — Given a server whose most recent tool-discovery attempt failed (REQ-MCP-048), when a persona carrying it is resolved, then a warning SHALL be produced stating the server failed tool discovery and its tools may be unavailable.

- **REQ-MCP-043** — The per-server description handed to the agent runtime SHALL be normalized to exactly the following keys and no others: a transport discriminator distinguishing stdio, streamable HTTP and SSE; for stdio — `command` (resolved per REQ-MCP-028 to REQ-MCP-035), `args` (the resolved argument list), `env` (the resolved environment of REQ-MCP-087), and `cwd` (the entry's configured value, or the workspace root when unset); for remote transports — `url` and, when configured, `headers`; and, when `request_timeout` is set, a numeric `timeout` in seconds. A key not in that list SHALL be absent, and `timeout` SHALL be absent when `request_timeout` is unset, so a consumer can compare the description's key set against this list exactly. Tool disabling, renaming and grants SHALL be applied by the product before this description is produced (REQ-MCP-049, REQ-MCP-059) and SHALL NOT be expressed as additional keys. A remote entry SHALL NOT be subjected to a PATH check while this description is produced. The literal values the transport discriminator takes for stdio, streamable HTTP and SSE are not fixed by this document (Open Question 25).

- **REQ-MCP-044** — Every warning accumulated during agent construction SHALL be delivered through two channels: a UI toast of severity "warning" with an 8-second auto-dismiss, and a persisted session issue record with kind `mcp_config`, severity `warning`, and actor `orchestrator`, visible in the session's issues file after the run.

- **REQ-MCP-045** — The project-initialization task registry SHALL use the availability rule of REQ-MCP-037 to decide whether the code-intelligence setup task applies to a workspace: the server must be configured and its command must resolve.

### Tool Discovery, Caching, and Health Probing

- **REQ-MCP-046** — Tool discovery SHALL connect to a server over its configured transport, perform the MCP `initialize` handshake followed by `tools/list`, and return the server's tool metadata (name, description). The default discovery timeout SHALL be 30 seconds.

- **REQ-MCP-047** — Discovery SHALL be stable and SHALL not re-interrogate an unchanged server. Within the lifetime of one process, repeated discovery requests for a server whose name, `type`, `command`, `args`, `env`, `cwd`, `url`, `headers` and workspace root are all unchanged SHALL yield the same tool list every time, and the server SHALL observe at most one `initialize`/`tools/list` exchange arising from them. A difference in any one of those nine values SHALL make the next request interrogate the server afresh. Reloading the configuration SHALL likewise make the next request for every server interrogate it afresh, so a server that failed discovery before the reload but answers after it SHALL produce no further REQ-MCP-042 warning.

- **REQ-MCP-048** — Discovery failure SHALL never raise to the caller: on any connection, protocol, or timeout error the request SHALL return an empty tool list, a warning SHALL be logged at most once per identity noting that the persona prompt will list this server with no tool details attached, and the failure SHALL be remembered for that identity so REQ-MCP-042 warnings can fire later.

- **REQ-MCP-049** — Post-discovery filtering SHALL apply in this order: (1) drop names listed in `disabled_tools` (original names); (2) apply `tool_name_map` renames, preserving descriptions.

- **REQ-MCP-050** — Discovery SHALL use the same resolved command and arguments as launch (so workspace binding per REQ-MCP-034 applies to discovery too), the configured `env`, and `cwd` defaulting to the workspace root.

- **REQ-MCP-051** — Given a stdio discovery in which the tool list was already received before a transport-teardown error occurs, when the connection is torn down, then the received tools SHALL be returned and the teardown error ignored (logged at debug level); an error occurring before the list was received SHALL count as a discovery failure per REQ-MCP-048.

- **REQ-MCP-052** — Discovered tool entries with an empty or non-string name SHALL be dropped; a missing description SHALL become `""`.

- **REQ-MCP-053** — Every tool-discovery request SHALL return a result — the server's tool list, or the empty list of REQ-MCP-048 — no later than the configured discovery timeout plus 5 seconds, measured from the moment the request is issued; with the 30-second default of REQ-MCP-046 that upper bound is 35 seconds. The bound SHALL hold for every caller and every surface that can trigger discovery. No discovery request SHALL fail to return, and an outstanding discovery request SHALL never delay process exit past that bound.

- **REQ-MCP-054** — Any configured server SHALL be probeable on demand, and a probe SHALL return within a default budget of 8 seconds. Each probe SHALL report the state of the server at the moment it runs: probing the same server n times SHALL cause the server to be contacted n times, and no probe SHALL report an outcome carried over from an earlier probe or from tool discovery. A probe reports one of two outcomes — `healthy`, together with the number of tools the server listed on that contact, or `unreachable`, together with human-readable text describing the failure instead of a count. A probe SHALL never raise an error to its caller, SHALL leave the result and the warnings of any later discovery request unchanged, and SHALL still run for a server whose earlier discovery failed.

### Per-Persona Tool Grants

- **REQ-MCP-055** — Grant resolution for a persona SHALL be defined per carried server, by these five cases: (a) a carried name absent from the configuration's server map contributes no tools and produces the warning of REQ-MCP-038; (b) a carried server with no `mcp_tools` entry is unrestricted and contributes every one of its discovered tools that survives REQ-MCP-004; (c) a carried server whose `mcp_tools` entry is an empty list contributes none of its tools; (d) a carried server whose `mcp_tools` entry names tools contributes exactly those of its discovered tools that the decision of REQ-MCP-056 allows, entries matching no discovered tool being inert per REQ-MCP-058; and (e) an `mcp_tools` entry naming a server the persona does not carry is a validation error (REQ-MCP-104). Cases (b) and (c) SHALL be distinguishable in the resulting surface: (b) yields that server's whole surviving surface, (c) yields nothing at all from that server.

- **REQ-MCP-056** — The grant decision for (server, tool) SHALL be: if any candidate spelling of the tool name (REQ-MCP-057) matches `disabled_tools`, the tool is denied regardless of grants; otherwise an unrestricted grant allows it; otherwise it is allowed if and only if a candidate spelling intersects the grant set.

- **REQ-MCP-057** — Candidate spellings for a tool name SHALL be the literal name plus, when the name begins with `<server>_`, `mcp-<server>-`, or `mcp__<server>__`, the unprefixed remainder — added, never substituted — so that a name carrying a client-side server prefix and a grant or disable entry written against the server-reported name still match each other in either direction.

- **REQ-MCP-058** — A grant entry that names a tool the server never reports SHALL be inert: configuration validation, agent construction and the run SHALL all succeed unaffected, and every other tool the same persona grants and the server does report SHALL still be granted. Each unmatched (server, tool) pair SHALL be reported once per process at informational level, stating that the entry matched no tool on that server; the same pair SHALL NOT be reported a second time in that process.

- **REQ-MCP-059** — Grants SHALL be enforced before the model ever sees a tool: filtering happens per server (so server attribution is preserved), a tool that was denied or never granted is absent from the tool list the model receives, and one server's unrestricted grant never leaks another server's withheld tool. When narrowing occurs, a debug log states how many of the server's tools were granted.

- **REQ-MCP-060** — When a connected server publishes a changed tool list after the initial handshake, the persona's callable tool set SHALL be recomputed by the same decision used at connect time (REQ-MCP-056, REQ-MCP-057), and the recomputed set SHALL govern every tool call that persona issues from the moment the update is received onward; no tool the persona was not granted SHALL become callable through such an update. When no tool in an update survives that decision, the persona's callable tool set SHALL remain exactly what it was immediately before the update arrived (Open Question 6).

- **REQ-MCP-061** — A persona's callable tool set SHALL be a function of configuration alone. Where no carried server has an `mcp_tools` entry and no carried server has a non-empty `disabled_tools`, that set SHALL be exactly every tool discovered for the persona's carried servers, with nothing withheld. Where either does apply, the identical filtered set SHALL be observed whether the persona runs in an interactive session or in a headless background run. No configuration and no way of starting a run SHALL hand a persona a tool its grants exclude.

- **REQ-MCP-062** — For every persona and every server that persona carries, the set of tool names printed under that server in the prompt's MCP section (REQ-MCP-101) SHALL be set-equal to the set of tool names the persona can call on that server: a printed name SHALL be callable, and a name the persona can call SHALL be printed. Calling a name that the prompt does not print SHALL be refused. The names compared are those remaining after denial (REQ-MCP-004), grant filtering (REQ-MCP-056) and renaming (REQ-MCP-005, subject to Open Question 13).

- **REQ-MCP-063** — When two personas of one session carry the same server under different grants, each SHALL see and be able to call only the tools its own grant allows, both at the same time; widening or narrowing one persona's grant SHALL leave the tool set the other persona sees and can call unchanged. How many personas use a server SHALL NOT change how many server processes or connections the session creates — that count stays at one per server for the whole session (REQ-MCP-066).

- **REQ-MCP-064** — Post-connect probes (REQ-MCP-070, REQ-MCP-071) SHALL read the server's unfiltered tool list, so no grant or disable configuration can disarm them.

- **REQ-MCP-065** — Each child run's persisted state SHALL record both its granted native tools and its granted MCP tools as a per-server map of tool-name lists. The desktop agent inspector SHALL render MCP tools grouped per server under a heading whose accessible name is "MCP server <name>", and SHALL match called-tool indicators prefix-tolerantly (a call logged under a name that carries a client-side server prefix still marks the corresponding granted original name as used).

### Session-Scoped Shared Runtime

- **REQ-MCP-066** — Within one session there SHALL be exactly one shared connection per server, opened on first demand, reused by every agent in the run, and closed exactly once when the session ends. Teardown SHALL occur on session-lock release and at application exit; headless background runs SHALL use the same shared-connection behavior as interactive runs.

- **REQ-MCP-067** — Session connection handling SHALL provide these observable guarantees under concurrent use: two agents that request the same server at the same time SHALL both use the same connection, and when both requests have been served exactly one connection — and for `stdio`, exactly one server process — SHALL exist for that server; while one server is still starting, tool calls to servers that are already connected SHALL complete without waiting for that startup to finish; a connection request issued after session shutdown SHALL fail with an error naming the server and SHALL leave no connection open; a request to release a connection that has since been superseded SHALL leave the current connection open and usable; and shutdown SHALL be callable any number of times without error, with no server process and no connection left open once the first call has returned.

- **REQ-MCP-068** — The end of one child conversation SHALL leave the session's shared server connections open: after a child finishes, every server it used SHALL still be connected and immediately usable by the next child of the same session, and every `stdio` server process SHALL still be running. Connections and server processes SHALL close only at the session-end teardown of REQ-MCP-066. Tool calls requested concurrently over one connection SHALL all complete, and each SHALL receive the response belonging to its own request and to no other. The session SHALL keep emitting its progress and status events while a tool call is outstanding, so no surface stalls for the duration of a call; which events those are is not fixed by this document (Open Question 31).

- **REQ-MCP-069** — Given a failure creating the connection for one server, when the session tool source is built, then that server is logged and skipped (its tools absent) and the run continues. Tools from all connected servers SHALL be merged into one aggregate surface, with each tool call routed to the connection of its owning server. Opening a connection and listing its tools SHALL run under a caller-supplied budget whose default is 30 seconds.

- **REQ-MCP-070** — A connected server whose configured name is `lsp` SHALL be initialized before any of its tools are offered to the agent: when a workspace root is known and the server reports a tool named `lsp_init`, that tool SHALL be called once with the arguments `{"root": "<workspace_root>"}` and SHALL be given 15 seconds to answer. Should that call fail or exhaust its budget, the server SHALL contribute no tools to the agent that triggered the connection and the run SHALL continue; a later agent of the same session that needs the server SHALL make the connection and the initialization call over again rather than inherit the earlier outcome. A server named `lsp` that reports no `lsp_init` tool SHALL be offered as it is; with no known workspace root the call SHALL be skipped; and a server configured under any other name SHALL never receive this call.

- **REQ-MCP-071** — A connected server carrying the built-in code-intelligence name SHALL be probed once per connection established in the session, before that server's tools are offered to the agent, by calling the runtime's project-memory listing tool with empty arguments and allowing it 15 seconds to answer; the tool SHALL be found by matching the trailing segment of its reported name, so a client-side server prefix (REQ-MCP-057) still matches. Should that call fail or exhaust its budget, a warning SHALL be delivered through REQ-MCP-044 telling the user that the server's symbol-level tools remain usable but may not be pointed at this project; the connection SHALL stay open, the server's tools SHALL still be offered to the agent exactly as the persona's grants allow, and no corrective action SHALL be attempted. A server reporting no memory-listing tool SHALL NOT be probed and SHALL produce no such warning. The literal name of the memory-listing tool is not fixed by this document (Open Question 17).

- **REQ-MCP-072** — On Windows, a `stdio` server launched while the terminal UI is hosting the run SHALL start and its tools SHALL become available to the persona carrying it. No such launch SHALL be reported to the user as failed, and launching the same server repeatedly under the terminal UI SHALL give the same result every time. The host conditions under which a Windows launch would otherwise fail are not established here (Open Question 7).

### User Toggles and Terminal-UI Management

- **REQ-MCP-073** — The terminal UI SHALL offer these entry points: a `/mcp` slash command described as "Open MCP server management"; a command-palette entry "MCP Servers" with help text "Manage MCP server toggles", present in the palette's discovery listing; and a palette cheatsheet listing both "MCP Servers — Manage MCP server toggles" and "MCP Secrets — Manage MCP server environment secrets".

- **REQ-MCP-074** — The server-management screen SHALL be modal with title line "MCP Servers — space/enter to toggle, esc to close" and empty state "No MCP servers configured."; it lists one row per configured server in a table with columns Name, Source, Type, Status, Enabled; the Enabled cell renders `[x]`/`[ ]` from the toggle store; pressing space or selecting a row toggles; escape closes. A toggle SHALL persist immediately through the toggle store and update only the affected cell.

- **REQ-MCP-075** — Each row of the server-management table SHALL display in its Status cell the status string supplied for that row, and, when no status string is supplied for it, the literal string `active`. Whether that column is meant to carry live availability rather than this fallback is unresolved (Open Question 5); whichever way that is answered, the pre-run terminal info pane (REQ-MCP-079) and the desktop tab (REQ-MCP-091) SHALL show availability computed by REQ-MCP-037.

- **REQ-MCP-076** — Per-server enabled state SHALL persist in one file named `mcp_toggles.json` in the per-user application configuration directory: `%APPDATA%/rotaris/` on Windows, `~/Library/Application Support/rotaris/` on macOS, and `~/.config/rotaris/` on Linux and other systems. The file SHALL be a single flat JSON object mapping server name to a boolean, written with its keys in ascending sorted order (Open Question 30) and replaced atomically (temporary file, then rename over the target). The store SHALL be global: it SHALL NOT vary by workspace, and the desktop toggles of REQ-MCP-094 SHALL NOT write to it. Whether a server disabled here is still listed by the pre-run info pane of REQ-MCP-079 is unresolved (Open Question 19), as is whether the desktop of REQ-MCP-091 and REQ-MCP-094 reads this file for its initial toggle state (Open Question 27).

- **REQ-MCP-077** — Toggle-store resilience: any server name absent from the file SHALL default to enabled; corrupt JSON, a non-object root, or a non-string-to-boolean mapping SHALL log a warning and behave as an empty store (everything enabled); an explicit reload SHALL pick up out-of-band edits; access SHALL be thread-safe; concurrent writers SHALL never corrupt the file; a failed save SHALL log the error and remove its temp file.

- **REQ-MCP-078** — Toggle effect timing: the toggle state SHALL be consulted afresh at every persona resolution, so a disabled server is excluded from the next constructed agent. Toggling during an active run SHALL never crash the run and SHALL take effect on the next run iteration.

- **REQ-MCP-079** — The terminal info pane SHALL show an "MCP Servers" section. Before a run it lists all configured servers with computed status: remote (`http`/`sse`) → active; stdio → active if and only if the resolved command is on PATH, else unavailable; an entry whose `command` is empty → active. That last case conflicts with REQ-MCP-037 and REQ-MCP-002 and is unresolved (Open Question 12); whether servers disabled in the toggle store appear here at all is likewise unresolved (Open Question 19). During and after a run it lists only the focused persona's servers, all active (unavailable ones were already dropped by REQ-MCP-041). Visual encoding SHALL be: origin glyphs `●` yaml (normal foreground), `◆` discovered-project (cyan), `◇` discovered-user (cyan), `○` default (dim); active servers in green, inactive dimmed; remote servers suffixed ` [http]` or ` [sse]`.

- **REQ-MCP-080** — The secrets management screen SHALL be modal, titled "MCP Server Secrets", containing: a selector of the configured server names in ascending sorted order (prompt "Select MCP server"; the definition of that order is Open Question 30); a "Save to:" scope selector offering `Workspace` (default) and `Global`; a table with columns Key, Value and Scope holding the merged secrets of the chosen server per REQ-MCP-083 — workspace entries first, then the global entries no workspace entry overrides — with every value masked per REQ-MCP-081; an "Expected keys: …" hint listing the keys of the server's configured `env` block in the same ascending order; a key input and a value input whose typed characters are not echoed in clear text; a hint line "Ctrl+S save  |  a add  |  e edit  |  d delete  |  esc close"; and bindings ctrl+s (save), a (add: clear the form and focus the key input), e (edit: populate the form from the selected row and focus the value input), d (delete the selected row), escape (close). Validation notices of severity warning SHALL read "No MCP server selected." / "Key is required." / "Value is required.". A save SHALL write into the scope selected in "Save to:" and notify "Set {server}.{KEY} = {masked} in {scope}"; a delete SHALL remove from that same scope and notify "Removed {server}.{KEY} from {scope}"; `{masked}` is the value masked per REQ-MCP-081 and `{scope}` is the selector's own label, `Workspace` or `Global`. With no servers configured the screen SHALL show "No MCP servers configured.". These per-edit notifications are the only feedback specified (Open Question 11).

- **REQ-MCP-081** — One masking rule SHALL be used wherever a stored secret value is rendered, in the CLI and in every UI: a value of 4 characters or fewer SHALL render as one `·` (U+00B7) per character of the value; a longer value SHALL render as its first 2 characters, then one `·` per remaining middle character (length − 4 of them), then its last 2 characters. The rendered string SHALL therefore always have exactly as many characters as the value it masks. A raw stored secret value SHALL never appear in a log line, a notification, a rendered table, or standard output. What this rule renders for a stored value of zero length, and whether such a value can be stored at all, is unresolved between this requirement and REQ-MCP-085 (Open Question 23).

### Secrets Storage and Environment Resolution

- **REQ-MCP-082** — Secrets SHALL be stored in a `secrets.yaml` per scope, next to the scope's `agents.yaml`: global in the per-user configuration directory and workspace in `<workspace>/.rotaris/`. The format is a YAML mapping of server name → map of environment key → value. Writes SHALL be atomic (temp file then rename) with parent directories auto-created; an unreadable file, invalid YAML, or a non-mapping root SHALL load as empty; non-mapping server values are skipped; keys and values are coerced to strings.

- **REQ-MCP-083** — The merged secrets view SHALL combine global then workspace per key, with workspace winning on collision.

- **REQ-MCP-084** — Secret mutation semantics: setting SHALL create the server entry as needed; unsetting a missing key SHALL report not-found without error and SHALL remove a server entry that becomes empty; clear-all SHALL report the number of removed keys and perform no write when nothing was removed; a failed atomic write SHALL remove its temp file and propagate the error.

- **REQ-MCP-085** — A `secrets` command group SHALL provide exactly these subcommands. `set`, `unset` and `unset-all` SHALL each accept the scope selectors `--workspace`/`-w PATH` and `--global`/`-g`, defaulting to the workspace scope rooted at `<workspace-or-current-directory>/.rotaris`; `list` SHALL accept `--workspace PATH` and SHALL NOT accept `--global`/`-g`, since it always reports the merged view of REQ-MCP-083 and so selects no single scope. Whether `list` also accepts the short form `-w`, and what happens when `set` is given an explicitly empty VALUE, are not fixed by this document (Open Question 23).
  - `set <server> <KEY> [VALUE]`: with VALUE omitted, the value SHALL be read from a prompt reading "Enter value for {KEY}" whose input is not echoed; an empty response SHALL print "Aborted: no value provided." and exit with code 1; a successful write SHALL print a confirmation naming the server and the key with the value masked per REQ-MCP-081 and exit with code 0.
  - `unset <server> <KEY>`: SHALL print a confirmation of the removal, or "Not found: {server}.{KEY}" when the key is absent; per REQ-MCP-084 the absent case is not an error, so both outcomes exit with code 0.
  - `unset-all <server>`: SHALL print "Cleared {n} secret(s)" with the number of keys actually removed, or "No secrets found for: {server}" when the server has none; both outcomes exit with code 0.
  - `list [--workspace PATH]`: SHALL render a table titled "MCP Server Secrets" with columns Server, Key and Value, holding the merged global-plus-workspace view of REQ-MCP-083 in ascending order by server name and, within a server, by key (Open Question 30), every value masked per REQ-MCP-081, and the empty state "No secrets stored." when the merged view holds no entry at all.

- **REQ-MCP-086** — A `config` command group SHALL offer a subcommand that stores the built-in web-search server's API key without the user having to name either the server or the environment variable. It SHALL take the key as an optional positional argument and accept the same scope selectors as REQ-MCP-085 (`--workspace`/`-w PATH`, `--global`/`-g`, default scope `<workspace-or-current-directory>/.rotaris`). With the argument omitted it SHALL read the key from a prompt whose input is not echoed; an empty response SHALL print a message stating that no value was supplied and that nothing was written, and SHALL exit with code 1 leaving the secrets store unchanged. On success it SHALL write the value through the secrets store of REQ-MCP-082 under the web-search server's entry, keyed by that server's fixed API-key environment-variable name, print a confirmation naming that variable with the value masked per REQ-MCP-081, and exit with code 0; the stored value SHALL thereafter satisfy the URL placeholder of REQ-MCP-088 with no further configuration. The subcommand's literal name and the environment-variable name are not fixed by this document (Open Question 14), nor is the literal wording of its prompt, abort and confirmation lines (Open Question 32).

- **REQ-MCP-087** — Environment resolution at configuration load SHALL apply, per server `env` entry: (1) a value that is exactly `${VAR}` (full-value match) is replaced by the process environment's value; when the variable is unset, the key is omitted entirely — the literal placeholder is never passed to a server; (2) any other value is kept as-is; (3) stored secrets for that server are overlaid last and always override shell-derived values. Resolution SHALL happen during loading so every downstream consumer (agent construction, discovery, health probes) sees the resolved environment.

- **REQ-MCP-088** — For remote servers, every `${VAR}` occurrence inside the URL (substring, not full-match) SHALL be replaced using this precedence: (1) a stored secret for that server, (2) the process environment. An unresolvable placeholder SHALL stay literal with a warning stating it could not be resolved. This is how the default web-search URL receives its API key.

- **REQ-MCP-089** — During configuration load, the workspace `.gitignore` SHALL be best-effort amended to exclude `.rotaris/`: idempotent, tolerant of an existing entry with or without a trailing slash, written atomically, and reporting failure without raising.

- **REQ-MCP-090** — The effective environment reaching a spawned server SHALL follow this precedence chain: explicit `env` over `envFile` (discovery merge) → full-value `${VAR}` expansion from the shell → secrets overlay, where workspace secrets beat global secrets beat shell values.

### Desktop Application Surfaces

- **REQ-MCP-091** — The desktop settings SHALL include a tab labelled "MCP Servers" holding a card headed "Configured servers" with one row per configured server. Each row SHALL show: a status indicator whose state is one of the four of REQ-MCP-092, accompanied by that state as text; the label `{name} · {type}`; a muted secondary line giving the entry's `url` for a remote server and otherwise its configured `command` followed by its configured `args`, joined by single spaces; the server's origin drawn from the vocabulary of REQ-MCP-026; and a toggle switch. The switch SHALL read as on if and only if the server is both enabled in the desktop toggle state of REQ-MCP-094 and available per REQ-MCP-037; where that state comes from when the application starts is unresolved (Open Question 27). For an unavailable server the switch SHALL be non-interactive and SHALL carry the tooltip "Command not found on PATH". With no servers configured the card SHALL show "No MCP servers" and "Configure a server in agents.yaml.".

- **REQ-MCP-092** — Per-server health SHALL expose four states: `unknown` (initial on every launch; health is never persisted), `checking` (pulsing indicator), `healthy` (with discovered tool count), and `unreachable` (error text in tooltip). Health SHALL always be written out textually, never encoded only in color; colors map through the active theme. A "Check status" header button (accessible description "Probe every configured MCP server") SHALL probe all configured servers sequentially on a background thread without ever blocking the UI thread; unavailable servers SHALL short-circuit to `unreachable` with detail "Command not found on PATH" without connecting; the button SHALL disable while a probe runs and re-enable when finished.

- **REQ-MCP-093** — Desktop availability SHALL delegate to the shared rule of REQ-MCP-037.

- **REQ-MCP-094** — Given a server toggled off in the desktop app, when the next run's configuration is projected, then that server SHALL be removed from both the server map and every persona's carried-server list, leaving only enabled-and-available servers. These desktop toggles are session-scoped and are not written to the global toggle file of REQ-MCP-076; whether they are intended to persist across restarts is unresolved (Open Question 2).

- **REQ-MCP-095** — First-run machine setup SHALL state, before it begins any check, that it is about to check the developer tooling and the package caches the MCP servers depend on, and the settings surface SHALL offer an action that re-runs exactly those checks on demand. The release-pinned setup manifest SHALL carry the browser-automation version string `0.0.75`, character for character the version the default entry of REQ-MCP-010 carries; a build in which the two strings differ SHALL be treated as defective. The literal wording of the first-run message and the label of the settings action are not fixed by this document (Open Question 22).

- **REQ-MCP-096** — Package-cache warm-up steps SHALL be derived from the merged server configuration of REQ-MCP-025, considering only `stdio` entries whose resolved command's file name is `uvx`, `uvx.cmd`, `npx` or `npx.cmd`. For a `uvx` entry the package specification SHALL be the value following a `--from` argument, or failing that the first argument containing `==`, and the warm command SHALL be `uvx --from <spec> <executable> --help`. For an `npx` entry the package SHALL be the first argument that does not begin with `-`, with no version pin required, and the warm command SHALL be `npx -y <pkg> --help` with `npx` resolved to an absolute path; the step SHALL be omitted entirely when `npx` is not found on PATH. An entry from which no package specification can be taken SHALL yield no step. Which argument supplies `<executable>` in the `uvx` warm command, and whether the four file-name matches are case-sensitive, are not fixed by this document (Open Question 28). Steps SHALL be identified as `warm:<family>:<package>` with `<family>` being `uvx` or `npx`, labelled `Warm <package>`, and tagged with the capability `"<server> MCP server"`; two entries that produce the same identifier SHALL yield exactly one step. On resume, a step already recorded as completed SHALL be skipped unless the run was started as a manual re-run, in which case it SHALL run again.

- **REQ-MCP-097** — A CLI setup command SHALL inspect the machine's developer tooling, install what is missing, warm package caches, and repair broken installations: it accepts `--workspace`/`-w` (default `.`, the workspace whose merged MCP configuration is warmed), streams progress/completion/failure/cancellation events with details to stderr, echoes the final outcome value to stdout, and exits with code 1 when the outcome is degraded or cancelled, else 0.

- **REQ-MCP-098** — The desktop SHALL derive its applicable project-initialization task list from the core task registry (which applies REQ-MCP-045) rather than re-deriving prerequisites.

- **REQ-MCP-099** — Deterministic code-intelligence project setup SHALL invoke the CLI derived by REQ-MCP-036 and run three steps in order — project creation, project indexing, and memory-store initialization — bounded at 300, 1800 and 120 seconds respectively. Project creation SHALL be skipped when the runtime's per-project marker file is already present, and SHALL never overwrite an existing project. Child processes SHALL be run with UTF-8 input and output encoding; their completion SHALL be polled every 0.25 seconds; on cancellation or timeout the child SHALL be asked to terminate, given 5 seconds to exit and then force-killed — on Windows the whole process tree — and a step whose child exceeded its budget SHALL be reported as failed. The output reported for a failing step SHALL be truncated to its last 400 characters, keeping the end of the output and discarding the beginning. In a workspace that contains no code, the indexing and memory steps SHALL be skipped and reported with status `skipped-no-code` while creation still runs. A configured code-intelligence entry that is remote, or whose arguments contain no server-launch subcommand, SHALL produce a non-retryable failure whose message states that the entry is not a local launch; no substitute command SHALL be attempted. The marker file's name is not fixed by this document (Open Question 16), nor is the test that decides a workspace contains no code (Open Question 21), nor whether a failed step stops the steps that would otherwise follow it (Open Question 33).

- **REQ-MCP-100** — The auxiliary per-agent pop-out window SHALL list the agent's granted MCP tools compactly: one muted line per server in the form "{server}: tool, tool, …", sourced from the run's recorded grant evidence (REQ-MCP-065).

### Prompt Rendering of the MCP Surface

- **REQ-MCP-101** — The persona system prompt SHALL contain one designated MCP section. An *active* server, for this requirement, is a server the persona carries that survived every drop rule — it is present in configuration (REQ-MCP-038), not disabled by the toggle store (REQ-MCP-040) and not dropped as unavailable (REQ-MCP-041). When the persona has no active server, that section's body SHALL be exactly the literal line `_No MCP servers configured._` and nothing else. Otherwise the body SHALL be a Markdown bullet list with one top-level bullet per active server: a server for which no tool is known (discovery returned nothing, or failed per REQ-MCP-048) SHALL render as its name in code formatting, `` `name` ``; a server with known tools SHALL render as its name in bold code formatting, ``**`name`**``, followed by one indented child bullet per tool, each child bullet being `- `, then the tool name in code formatting, then — only when that tool's description is a non-empty string — ` — ` followed by the description text. The names rendered SHALL be exactly the names of REQ-MCP-062: after grant filtering, after `disabled_tools` removal, and after `tool_name_map` renaming (subject to Open Question 13). The section's heading text and the ordering of servers and of tools within a server are not fixed by this document (Open Question 20).

- **REQ-MCP-102** — A persona's prompt SHALL carry a fixed project-memories protocol block, placed under the code-intelligence server's entry in the MCP section (REQ-MCP-101), if and only if that persona's granted tools for that server include both the project-memory listing tool and the project-memory reading tool. The block SHALL tell the agent: to read the memories that already exist before it starts exploring the codebase; to write durable findings that are not obvious from the code back through the memory-writing tools it holds; to keep agent-instruction files out of memory; and to keep anything true only of the current run out of memory. Every prompt that carries the block SHALL carry the same characters in the same order. A persona missing either gating grant SHALL receive no such block. The block's literal wording is not fixed by this document (Open Question 20).

### Validation and Launch Error Semantics

- **REQ-MCP-103** — Configuration validation SHALL report, per persona, an error of the form "Persona '<p>' references unknown MCP server '<s>'" for any carried server name absent from the configuration's server map.

- **REQ-MCP-104** — Configuration validation SHALL report an error when a persona grants MCP tools for a server it does not carry, naming both the persona and the server.

- **REQ-MCP-105** — Persona generic tool names SHALL validate against the public native tool set plus configured MCP server names; any other name is an error naming the persona and the unknown tool. An MCP server name in the generic tool list is legal but warned per REQ-MCP-039.

- **REQ-MCP-106** — Agent construction SHALL fail with an error listing the offending names when an advertised non-MCP tool is not actually registered; MCP server names SHALL be exempt from this prompt/tool mismatch guard.

- **REQ-MCP-107** — When a child agent fails to launch and an MCP connection error appears anywhere in the failure's cause chain, exactly one diagnostic SHALL be produced and delivered through both channels of REQ-MCP-044 — never zero, never two. The diagnostic SHALL be chosen from the root cause by the first matching case of three: (1) an operating-system spawn error reported as a bad file descriptor yields a message saying the Node.js package runner is probably not installed or not on PATH, and offering both remedies — install it, or reconfigure that server for HTTP transport; (2) a file-not-found error yields a message saying the configured command is not installed; (3) any other MCP connection error yields the literal message "MCP connection failed". Every variant SHALL name the persona whose launch failed and SHALL reproduce the root cause's own text. A launch failure whose cause chain holds no MCP connection error SHALL yield no MCP diagnostic and no `mcp_config` issue record. Which further spawn errors count as case (1), and whether the case (1) and case (2) texts are fixed strings, are not determined here (Open Question 29).

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

`timeout` is `request_timeout` as a number (seconds).

### Toggle store — `mcp_toggles.json`

Per-user application configuration directory (`%APPDATA%/rotaris/` on Windows, `~/Library/Application Support/rotaris/` on macOS, `~/.config/rotaris/` elsewhere). A single flat JSON object `{ "<server>": true|false }`, sorted keys, atomic write. Absent name = enabled; malformed file = all enabled.

### Secrets — `secrets.yaml`

Per scope, next to `agents.yaml` (global config dir; workspace `.rotaris/`):

```yaml
my-server:
  API_KEY: "value"
```

Atomic writes; malformed content loads as empty; workspace beats global per key. Masking everywhere: length ≤ 4 → one `·` per character; else `first2 + ·×(len−4) + last2`.

### Health probe outcome

Healthy or unreachable; the number of tools the server reported when healthy; human-readable error text when unreachable. Each probe opens its own connection and reports only that connection's outcome (REQ-MCP-054).

### Session diagnostics and run state

- Session issues file: one record per delivered MCP warning — kind `mcp_config`, severity `warning`, actor `orchestrator`, plus the warning text.
- Child-run state snapshot: `granted_tools` (native) and `granted_mcp_tools: {server: [tool, ...]}`.

### Terminal-UI encodings

Origin glyphs: `●` yaml, `◆` discovered-project (cyan), `◇` discovered-user (cyan), `○` default (dim). Active = green, inactive = dimmed; remote suffixes ` [http]` / ` [sse]`. Enabled cells `[x]` / `[ ]`.

### Setup warm steps

Ids `warm:<family>:<package>` (families: uvx, npx), labels `Warm <package>`, capability tag `"<server> MCP server"`. Warm commands: `uvx --from <spec> <executable> --help`; `npx -y <pkg> --help`.

### Timing and pinning constants

| Constant | Value |
|---|---|
| Tool discovery timeout | 30 s |
| Health probe timeout | 8 s |
| Discovery bound beyond the discovery timeout | +5 s |
| Post-connect hook budget (`lsp` init / binding probe) | 15 s |
| Session connect-and-list budget (default) | 30 s |
| Web-search per-tool-call timeout | 600 s |
| Per-tool-call default when `request_timeout` is unset (external runtime) | 300 s |
| Warning toast auto-dismiss | 8 s |
| Project setup step budgets (create / index / memories) | 300 / 1800 / 120 s |
| Setup poll interval | 0.25 s |
| Setup terminate grace | 5 s |
| Browser-automation package pin | 0.0.75 |
| Code-intelligence runtime pin | 1.7.0 |

## Open Questions

1. The tool inventories the pinned third-party servers actually serve at runtime (code intelligence, browser automation, web search) are not enumerated here and cannot be settled without connecting to them. Built-in grant lists are written against the pinned build's names and are inert when they no longer match (REQ-MCP-058), so an upstream rename degrades a grant silently instead of failing a run. Confirmation of the pinned inventories is needed before REQ-MCP-015 can be verified.
2. Whether the desktop application's server on/off toggles are intended to persist across restarts is undetermined. As specified they are session-scoped (REQ-MCP-094) while the terminal UI persists its toggles globally (REQ-MCP-076); the intended desktop behavior needs confirmation.
3. The 300-second per-tool-call default of REQ-MCP-003 is a property of the external agent runtime, not of this product. What the caller and the user observe when a tool call exceeds its bound — error text, retry, run outcome — therefore depends on that component and is not determined here.
4. Behavior when a remote (HTTP/SSE) server is configured but becomes unreachable mid-run is only partially determined: such servers count as available unconditionally at configuration time (REQ-MCP-037), so mid-run failure handling falls to the external runtime path and is not specified in detail.
5. The management screen's Status column (REQ-MCP-075) is specified as populated but not necessarily live, while sibling surfaces compute real availability. Whether a live status is intended there is unresolved.
6. Runtime tool-list updates (REQ-MCP-060): the filtering rule is specified, but two facts need confirmation — that a persona keeps its previous callable set when nothing in an update survives filtering, and whether an update may introduce a tool that was not present, and therefore not grantable, at connect time.
7. REQ-MCP-072 fixes the required outcome — `stdio` servers launch and their tools become available on Windows under the terminal UI — but not the host conditions under which a launch would otherwise fail. Those conditions must be established on that platform before the requirement can be tested negatively, i.e. before a case can be built that would fail without the guarantee.
8. Cross-process concurrency is undetermined: two application instances sharing the global toggle file, and per-process discovery results, imply last-writer-wins and staleness effects that are not specified here.
9. Whether every supported agent backend receives external MCP server configuration is undetermined; a backend that exposes only the product's own built-in tools would make REQ-MCP-043 inapplicable on that path.
10. Product documentation elsewhere describes a default read-only git-inspection server and a memory-write capability limited to a single persona. Both conflict with the defaults specified here (REQ-MCP-013 — no git server; REQ-MCP-015 — every code-intelligence persona may write memories). Which of the two is canonical needs confirmation.
11. REQ-MCP-080 specifies per-edit notifications only. Whether an aggregate "secrets updated" notification is also required when the secrets screen closes is unconfirmed.
12. REQ-MCP-002, REQ-MCP-029, REQ-MCP-037 and REQ-MCP-079 disagree about a `stdio` entry whose `command` is the empty string: REQ-MCP-002 would have such an entry rejected at load if an empty string counts as "no command", REQ-MCP-079 shows it as `active`, and REQ-MCP-037's PATH rule would make it unavailable. Which reading is canonical — reject at load, report active, or report unavailable?
13. REQ-MCP-005 states that `tool_name_map` renames for display, while REQ-MCP-062 and REQ-MCP-101 require the advertised names to be exactly the callable names. Does a replacement name become the name the model must call, or does the model see the replacement name while the original remains the callable one?
14. The literal identifiers of the three built-in entries are missing: the configuration key (server name) of each of the web-search, browser-automation and code-intelligence entries (REQ-MCP-010, referenced by REQ-MCP-071); the web-search `url` template and the name of the environment variable its `${VAR}` placeholder carries (REQ-MCP-010, REQ-MCP-086); the browser-automation package identifier and its headless argument (REQ-MCP-010); the distribution identifier the `1.7.0` pin applies to (REQ-MCP-011); and the literal name of the `config` subcommand that stores the web-search API key (REQ-MCP-086).
15. REQ-MCP-033 needs the literal spelling of the reserved command token that stands in for the bundled code-intelligence runtime, and the literal spelling of the sentinel first argument that makes a frozen executable run as that server.
16. The code-intelligence command-line vocabulary is missing: the literal server-launch subcommand, the explicit project-path option, the project-from-working-directory option (REQ-MCP-034, REQ-MCP-036), the name of the per-project marker file whose presence skips project creation, and the literal subcommands used for the create, index and memory steps (REQ-MCP-099).
17. REQ-MCP-015 needs the literal tool-name strings that make up the READ (ten), EDIT (seven), MEMORY-WRITE (two) and ONBOARDING (one) tiers, together with the memory-deletion, memory-rename and dashboard-opening names that must never be granted. The same list supplies the memory-listing tool name used by the binding probe of REQ-MCP-071 and the memory-listing / memory-reading pair that gates REQ-MCP-102.
18. REQ-MCP-027 does not determine what happens to a key in an `mcp.json` server entry that is outside the set of REQ-MCP-020 and REQ-MCP-021: is it ignored silently, ignored with a warning, or does it cause the entry to be skipped under REQ-MCP-023?
19. REQ-MCP-079 says the pre-run info pane lists all configured servers, while REQ-MCP-076 and REQ-MCP-040 mean a server disabled in the toggle store will not be used by the coming run. Does the pane list disabled servers, and if so what status does it show for them?
20. The prompt literals are missing: the heading text of the designated MCP section, the ordering rule for servers and for tools within a server (REQ-MCP-101), and the exact wording of the project-memories protocol block (REQ-MCP-102).
21. REQ-MCP-099 skips the index and memory steps for "a workspace containing no code" but does not define that test — which file types, which paths, and whether ignored files count.
22. REQ-MCP-095 does not fix the literal wording of the first-run message about checking developer tooling and MCP package caches, nor the label of the settings action that re-runs those checks.
23. REQ-MCP-081 and REQ-MCP-085 leave the empty secret value undetermined in two ways. Does `secrets set <server> <KEY> ""` — an explicitly supplied empty VALUE, as opposed to the empty prompt response that REQ-MCP-085 aborts on — store an empty value, and if it does, what do the `set` confirmation and the `secrets list` Value column render for it, given that REQ-MCP-081's rule masks a zero-length value to a zero-length string? Separately: does `secrets list` accept the short form `-w` for `--workspace`, as `set`, `unset` and `unset-all` do?
24. REQ-MCP-003 does not say how a `request_timeout` of zero or a negative `request_timeout` is treated: accepted as written, rejected at configuration load like the defects of REQ-MCP-002, or treated as unset so the 300-second default applies?
25. REQ-MCP-043 fixes the key names of the normalized runtime server description but not the literal values its transport discriminator takes for stdio, streamable HTTP and SSE. Those three strings are part of the compatibility surface and need confirmation.
26. REQ-MCP-014 lists fifteen personas. Is that the complete set of built-in personas, so that a persona missing from the table cannot exist, or may other built-in personas exist that the table simply does not constrain?
27. REQ-MCP-091 requires the desktop toggle switch to read the "toggle state", while REQ-MCP-076 makes the persisted `mcp_toggles.json` store global and REQ-MCP-094 makes the desktop toggles session-scoped and non-writing. Does the desktop read `mcp_toggles.json` to seed its initial per-server toggle state at launch, or does every launch start with all servers toggled on? (Related to Open Question 2, which asks whether desktop toggles should persist at all.)
28. REQ-MCP-096 gives the uvx warm command as `uvx --from <spec> <executable> --help` but does not say which argument of the server entry supplies `<executable>`. It also does not say whether the resolved-file-name match against `uvx`, `uvx.cmd`, `npx` and `npx.cmd` is case-sensitive, which matters on Windows.
29. REQ-MCP-107 selects its first diagnostic variant on an operating-system spawn error reported as a bad file descriptor. Which further spawn errors, if any, must select that same variant needs enumerating before the rule is testable. It is also unconfirmed whether the two non-generic message texts are fixed strings (as "MCP connection failed" is) or only fixed in information content.
30. REQ-MCP-076, REQ-MCP-080 and REQ-MCP-085 all require sorted output (toggle-file keys; the server selector and expected-keys hint; the `secrets list` rows) without defining the order. Is it ascending code-point order on the raw name, or a locale-aware or case-insensitive collation? The three surfaces must use the same answer.
31. REQ-MCP-068 requires progress and status events to keep flowing while a tool call is outstanding but does not name those events. The event names, and which surfaces must receive them, are needed before the requirement can be tested.
32. REQ-MCP-086 does not fix the literal wording of the web-search API-key subcommand's prompt, its abort message on an empty response, or its success confirmation. REQ-MCP-085 fixes analogous strings for the `secrets` group; whether this subcommand reuses them is unconfirmed.
33. REQ-MCP-099 orders the three project-setup steps (create, index, memories) and bounds each, but does not say whether a failed step stops the steps that follow it or whether the remaining steps are attempted anyway.
