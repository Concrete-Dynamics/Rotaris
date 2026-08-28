---
req-id: [SWR-400, SWR-401, SWR-402, SWR-403, SWR-404, SWR-405, SWR-406, SWR-407, SWR-408, SWR-409, SWR-410, SWR-411, SWR-412, SWR-413, SWR-414, SWR-415, SWR-416, SWR-417, SWR-418, SWR-419, SWR-420, SWR-421, SWR-422, SWR-423, SWR-424, SWR-425, SWR-426, SWR-427, SWR-428, SWR-429, SWR-430, SWR-431, SWR-432, SWR-433, SWR-434, SWR-435, SWR-436, SWR-445, SWR-449, SWR-450, SWR-451, SWR-452, SWR-453, SWR-454, SWR-455, SWR-456, SWR-457, SWR-458, SWR-465]
status: approved
trace: required
test: required
title: "Agent Context, Skills & Instructions"
---

# 400-agent-context-skills spec

## SWR-400 — Agent Context, Skills & Instructions

trace: optional
test: optional

Injecting workspace knowledge into agents: SKILL.md protocol, AGENTS.md auto-discovery, and language-aware tool setup (/inittools).

## SWR-401 — Orchestrator: Language Detection Before Implementation

status: draft
legacy-id: REQ-20260413-205430-001
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Before the orchestrator transitions from planning to implementation, it must scan the workspace to detect which programming languages are present. Detection must use file-extension analysis at minimum; language-specific config files such as `pyproject.toml`, `package.json`, `go.mod`, `Cargo.toml`, and `*.csproj` must be used as secondary confirmation signals. The detected language list must be stored in session context.

## SWR-402 — Orchestrator: Linter/Formatter Resolution per Language

status: draft
legacy-id: REQ-20260413-205430-002
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

For each detected language, the framework must resolve the canonical linter and formatter. The mapping from language to tool must be data-driven through configuration, with sensible defaults provided out of the box. Default mappings must cover at minimum Python (`ruff` / `black`), TypeScript/JavaScript (`eslint` / `prettier`), Go (`golangci-lint` / `gofmt`), Rust (`clippy` / `rustfmt`), and C# (`dotnet-format`).

## SWR-403 — Orchestrator: Tool Installation

status: draft
legacy-id: REQ-20260413-205430-003
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

After resolving required linters and formatters, the orchestrator must check whether each tool is installed. Missing tools must be installed automatically using the appropriate package manager when possible (`pip`, `npm`, `cargo install`, `go install`, `dotnet tool install`, or equivalent). Installation must happen before any coding agent depends on the tool.

## SWR-404 — Orchestrator: Tool Registration

status: draft
legacy-id: REQ-20260413-205430-004
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

After installation or availability confirmation, each linter and formatter must be registered as a named tool in the framework tool registry. Registered tools must be available to coding agents within the current session. Registration must be idempotent.

## SWR-405 — Coding Agent Tool: `lint`

status: draft
legacy-id: REQ-20260413-205430-005
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

A `lint` tool must be registered for each language with a resolved linter. When invoked, the tool must run the language's linter against the specified file or directory, capture stdout and stderr, and return structured output including file path, line, column, message, and severity when available. The tool description must clearly identify the wrapped language and linter.

## SWR-406 — Coding Agent Tool: `format`

status: draft
legacy-id: REQ-20260413-205430-006
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

A `format` tool must be registered for each language with a resolved formatter. When invoked, the tool must apply the formatter in place to the specified file or directory and return a diff of any changes. If no changes were needed, the tool must return an explicit no-change result. The tool description must clearly identify the wrapped language and formatter.

## SWR-407 — Tool Isolation: Language Namespace

status: draft
legacy-id: REQ-20260413-205430-007
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

When multiple languages are active in one session, `lint` and `format` tools must be namespaced by language, such as `lint_python` and `format_typescript`, so coding agents can target a specific ecosystem. Generic `lint` and `format` aliases may additionally run all applicable tools.

## SWR-408 — Tool Configuration: Custom Commands

status: draft
legacy-id: REQ-20260413-205430-008
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Configuration must allow overriding default linter and formatter commands per language. Overrides must support the full command string including flags. If an override is specified for a language, the default command for that language must not be installed or registered for that role unless explicitly requested.

## SWR-409 — Slash Command: `/inittools`

status: draft
legacy-id: REQ-20260413-205430-009
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

The TUI must expose `/inittools`. When invoked, it must repeat the full language-detection, tool-resolution, installation, and registration pipeline for the current workspace. The command must report detected languages and tools registered or updated. `/inittools` must be usable at any point during a session.

## SWR-410 — Tool Setup: Idempotency

status: draft
legacy-id: REQ-20260413-205430-020
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Running `/inittools` multiple times on the same workspace must produce the same end state. Re-running must not install duplicate tools, register duplicate tool entries, or fail because tools are already present.

## SWR-411 — Tool Setup: Graceful Degradation

status: draft
legacy-id: REQ-20260413-205430-021
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

If a linter or formatter cannot be installed, for example because a package manager is unavailable or the network fails, the framework must log a warning and continue without that tool. The failure must not abort the session or block other tools from being registered. The warning must be surfaced in the right-side panel.

## SWR-412 — Language Agnosticism

status: draft
legacy-id: REQ-20260413-205430-023
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

The language-to-tool mapping and registration mechanism must be data-driven. Adding support for a new language should require only a new default mapping or user configuration entry, not changes to the orchestrator control flow.

## SWR-413 — Test: Language Detection Accuracy

status: draft
legacy-id: REQ-20260413-205430-025
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Unit tests must cover detection of each supported language from file-extension sets and config-file presence. Edge cases must include multi-language repos, repos with no recognized files, and repos where extension and config-file signals disagree.

## SWR-414 — Test: Tool Resolution Mapping

status: draft
legacy-id: REQ-20260413-205430-026
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Unit tests must verify that the default language-to-tool mapping returns the expected linter and formatter for each supported language. Tests for user-configured overrides must confirm that the override replaces the default.

## SWR-415 — Test: Tool Installation

status: draft
legacy-id: REQ-20260413-205430-027
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Integration tests must mock package-manager calls and assert that the correct install command is invoked for each language tool. Tests must cover tool already installed, install succeeds, and install fails with warning while the session continues.

## SWR-416 — Test: `lint` and `format` Tool Invocation

status: draft
legacy-id: REQ-20260413-205430-028
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Integration tests must invoke registered `lint` and `format` tools against fixture files for each supported language and assert the structured output format. The format test must assert both diff output and explicit no-change output.

## SWR-417 — Test: `/inittools` Command

status: draft
legacy-id: REQ-20260413-205430-029
date: 2026-04-13
source: docs/requirement-log/unresolved/requirements-20260413-205430.md

Tests must assert that `/inittools` triggers the full setup pipeline, reports detected languages and registered tools, and remains idempotent on repeated invocation.

## SWR-418 — Skill Discovery: Project Paths

legacy-id: REQ-20260503-SKILL-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

At session start, the framework must scan project-scope `SKILL.md` locations in priority order: `.agents/skills/<name>/SKILL.md` then `.opencode/skills/<name>/SKILL.md`. Project-scope skills take precedence over user-global skills with the same normalized skill name.

## SWR-419 — Skill Discovery: User Paths

legacy-id: REQ-20260503-SKILL-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

After project-scope discovery, the framework must scan user-global `SKILL.md` locations in priority order: `~/.config/opencode/skills/<name>/SKILL.md` then `~/.openhands/skills/installed/<name>/SKILL.md`. If `~/.openhands/skills/.installed.json` exists and marks a skill directory disabled, that skill must be skipped.

## SWR-420 — Legacy Path Exclusion

legacy-id: REQ-20260503-SKILL-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

Flat legacy paths such as `.openhands/skills/*.md` and `.openhands/microagents/*.md` are out of scope for this implementation pass and must not be treated as canonical discovery targets. If support is needed later, it belongs in a separate compatibility follow-up requirement.

## SWR-421 — Skill Identity and Conflict Resolution

legacy-id: REQ-20260503-SKILL-004
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

Each discovered skill must have a stable normalized name derived from frontmatter `name` when present, otherwise from the containing directory name. When two skills resolve to the same normalized name, the higher-priority path wins and the discarded path must be logged at debug level.

## SWR-422 — Markdown and Frontmatter Parsing

legacy-id: REQ-20260503-SKILL-005
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

A valid `SKILL.md` file must be Markdown with YAML frontmatter. The loader must parse at minimum `name` and `description` (both required for a skill to be valid). The optional `trigger` field is accepted for legacy compatibility and slash-command registration but does not drive the primary activation path — the `description` field does. Unknown frontmatter fields must be preserved in metadata when cheap to do so, or ignored without failing load.

## SWR-423 — Legacy Trigger Alias Normalization

legacy-id: REQ-20260503-SKILL-006
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

The loader must accept both the canonical trigger object (`trigger: { type: keyword, keywords: [...] }`) and the legacy draft aliases (`type: keyword` with `triggers: [...]`). Internally, both forms must normalize to one canonical trigger model. Legacy trigger data is preserved for slash-command registration but does not gate the primary model-driven activation path.

## SWR-424 — Invalid Skill Handling

legacy-id: REQ-20260503-SKILL-007
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

A `SKILL.md` file missing required frontmatter fields (`name` or `description`), containing malformed YAML, or using an unsupported trigger shape must not crash startup. The loader must skip it, log a warning with the path and reason, and continue. A skill missing `description` cannot participate in Level 1 metadata injection or Level 2 model-driven activation.

## SWR-425 — Level 1 — Metadata Catalog Injection

legacy-id: REQ-20260503-SKILL-008
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

At agent construction time (session start), every valid discovered skill's `name` and `description` must be injected into the agent's system prompt as a lightweight catalog. This is unconditional for all valid installed skills. The injection must be clearly separated from persona prompt, AGENTS.md content, tool declarations, and persona memory. The catalog format should be compact (~100 tokens per skill target) and list each skill on one line with its name and description.

## SWR-426 — Level 2 — Agent-Initiated Body Retrieval

legacy-id: REQ-20260503-SKILL-009
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

The full `SKILL.md` body must _not_ be pre-loaded into context at startup. Instead, the agent retrieves it at runtime by using available filesystem tools (e.g. `bash: read <skill_dir>/SKILL.md` or an equivalent read tool). The framework must ensure that the skill directory is accessible through the agent's filesystem tooling (i.e., mounted, within workspace bounds, or explicitly granted). The framework must not intercept, rewrite, or pre-fetch the body before the agent's tool call completes — the agent owns the retrieval decision.

## SWR-427 — Level 3 — Script and Resource Execution

trace: optional
legacy-id: REQ-20260503-SKILL-010
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

When a `SKILL.md` body references executable scripts or data files within the skill directory, the agent executes them via shell and receives only stdout/stderr. Script source code must not enter the context window unless the agent explicitly reads it. The framework must ensure referenced scripts are executable and within the skill's directory so that `bash` invocations resolve correctly.

## SWR-428 — Slash-Command Skill Registration (UX Convenience)

legacy-id: REQ-20260503-SKILL-011
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

As a user-facing convenience separate from the model-driven activation path, skills whose frontmatter includes slash-prefixed trigger keywords (e.g., `trigger: { type: keyword, keywords: ["/review"] }`) must register dynamic commands with the existing TUI slash-command registry. Invoking such a command must inject the skill body into context for the current turn without forwarding the literal slash text as a normal user prompt. This is a direct user invocation path, not the model-driven Level 1→2 flow.

## SWR-429 — Agent Context Injection Boundary

trace: optional
legacy-id: REQ-20260503-SKILL-012
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

The Level 1 metadata catalog must remain distinct from the persona system prompt, tool declarations, AGENTS.md content, and persona memory. The Level 2 skill body, once retrieved by the agent, is normal conversation context and does not need special isolation. The implementation must preserve per-skill metadata at minimum for skill name, source path, source scope, and normalized trigger data (if any).

## SWR-430 — Skill Representation — Filesystem-Native

legacy-id: REQ-20260503-SKILL-013
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

Skills must be represented as filesystem-resident assets, not opaque SDK objects pre-loaded into memory. The agent accesses skills through its normal filesystem/bash tooling (Level 2/3). The framework's role is discovery, catalog injection (Level 1), and management — not mediating every skill-body access. If an SDK-level `Skill` object or `AgentContext.skills` integration point exists, it may carry the metadata catalog, but the body must remain accessible via filesystem reads.

## SWR-431 — Skill Catalog Listing

legacy-id: REQ-20260503-SKILL-014
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

The TUI must expose `/skills`, listing all discovered skills with name, description (truncated to one line), source path, source scope (`project`, `user`, or `manual`), and slash-command trigger keywords if any. It must also indicate whether the skill body is currently in context (i.e., already retrieved by the agent at Level 2). The listing reflects the same metadata catalog injected at Level 1.

## SWR-432 — Manual Skill Loading (`/skill`)

legacy-id: REQ-20260503-SKILL-015
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

The TUI must expose `/skill <path>`, loading a `SKILL.md` file from an arbitrary path at runtime. A successfully loaded skill is immediately added to the Level 1 metadata catalog for the current session, participates in normal name-collision resolution, and is marked with source scope `manual`. This is for ad-hoc use: trying a skill before installing it, loading from a non-standard location, or attaching a one-off skill to a session. Autodiscovery handles installed skills; `/skill` handles everything else.

## SWR-433 — Manual Load Persistence Boundary

legacy-id: REQ-20260503-SKILL-016
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

Skills loaded through `/skill` are session-scoped only for this implementation pass. They must not modify workspace config, copy files into managed directories, or persist into future sessions unless a separate requirement adds that behavior later.

## SWR-434 — Discovery and Parse Resilience

legacy-id: REQ-20260503-SKILL-NF-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

Discovery across the documented search paths must not block first visible interaction and should complete within 500ms on a local filesystem with up to 200 valid skill directories. Malformed or unreadable entries must degrade by warning rather than aborting session startup.

## SWR-435 — Deterministic Ordering

legacy-id: REQ-20260503-SKILL-NF-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

Given the same filesystem state and manual-load sequence, the discovered skill set, winner selection, and activation order must be deterministic across process runs.

## SWR-436 — No External Runtime Dependency

test: optional
legacy-id: REQ-20260503-SKILL-NF-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-skill-md-protocol.md

Discovery and parsing must read local files directly. The framework must not shell out to OpenHands, Codex, Claude Code, or any other external runtime just to discover or parse `SKILL.md` files.

## SWR-445 — Override File Precedence

legacy-id: REQ-20260526-AGENTSMD-002
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

When `AGENTS.override.md` is present at a given directory level, it must be used instead of `AGENTS.md` at that level. The presence of an override file must not suppress override or regular files at other directory levels.

## SWR-449 — Top-Down Merge

legacy-id: REQ-20260526-AGENTSMD-006
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

All discovered files must be concatenated into a single string in discovery order (global tier first, root next, subdirectories in descending order, CWD last). Each file's content must be preceded by a single-line Markdown comment identifying its source path (e.g. `<!-- source: /home/user/.codex/AGENTS.md -->`). Files must be separated by a blank line.

## SWR-450 — Injection Point

trace: optional
legacy-id: REQ-20260526-AGENTSMD-007
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

The merged content must be injected into the agent as an always-on Skill in the `AgentContext` passed to the `Agent` constructor inside `create_agent_for_persona()` in `agents/factory.py`. The Skill must use `name="workspace_agents_context"`, `trigger=None`, and `content=<merged_string>`. The injection must occur before any persona-specific skills. If no files are discovered, `AgentContext` must be constructed with an empty skills list (no change from current behaviour).

## SWR-451 — Empty File Skip

legacy-id: REQ-20260526-AGENTSMD-008
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

Files that exist on the filesystem but contain only whitespace after stripping must be silently skipped. They must not contribute an empty block or source-path comment to the merged output.

## SWR-452 — Per-File Size Limit

legacy-id: REQ-20260526-AGENTSMD-009
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

A single discovered file whose content exceeds the configured per-file byte limit (default: 32,768 bytes) must be truncated to that limit on the nearest preceding line boundary. A `WARNING` log must be emitted naming the file path and its full byte size.

## SWR-453 — Total Content Cap

legacy-id: REQ-20260526-AGENTSMD-010
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

The merged content must not exceed the configured total byte limit (default: 131,072 bytes). If adding the next file would exceed the cap, that file must be truncated to the remaining budget. If no budget remains, the file is dropped. A `WARNING` log must be emitted whenever a file is dropped or truncated due to the total cap.

## SWR-454 — Session-Scoped Cache

legacy-id: REQ-20260526-AGENTSMD-011
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

Discovered content must be computed once per session. The cache key is `str(config.workspace_root)`. Subsequent calls to `create_agent_for_persona()` within the same Python process and workspace root must reuse the cached result without re-reading the filesystem. The cache must be invalidated when a new session starts (e.g. by clearing the module-level cache dict at session startup).

## SWR-455 — Opt-Out Configuration Flag

legacy-id: REQ-20260526-AGENTSMD-012
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

A per-workspace configuration field `inject_agents_md: bool` (default `true`) must allow operators to disable auto-injection without code changes. When `inject_agents_md` is `false`, the loader must not read any files and `AgentContext` must be constructed with an empty skills list.

## SWR-456 — Discovery Latency

trace: optional
test: optional
legacy-id: REQ-20260526-AGENTSMD-NF-001
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

Discovery and merge across all search paths must complete within 200ms on a local filesystem with up to 20 files totalling up to 1 MiB of raw content. Discovery must not block the first visible user interaction.

## SWR-457 — Read Resilience

legacy-id: REQ-20260526-AGENTSMD-NF-002
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

A file that exists but cannot be read (permission error, encoding error, I/O error) must not crash agent creation. The loader must skip the unreadable file, log a `WARNING` with the path and exception message, and continue with the remaining files.

## SWR-458 — Deterministic Output

legacy-id: REQ-20260526-AGENTSMD-NF-003
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md

Given the same filesystem state and `config.workspace_root`, the merged content must be identical across process runs. No random ordering, timestamps, or process-ID data may appear in the output.

## SWR-465 — ROTARIS.md Instruction File Injection

status: draft
date: 2026-08-13

A workspace that contains a `ROTARIS.md` file at its root MUST have that
file's Markdown content injected into every agent constructed for the session,
as part of the same instruction block that carries `AGENTS.md` content. In the
merged block, `ROTARIS.md` content MUST be prepended before `AGENTS.md` (or
`AGENTS.override.md`) content, each block preceded by a source-path comment as
with existing instruction files.

`ROTARIS.md` MUST follow the same semantics as `AGENTS.md`: an empty file is
skipped silently; an unreadable file is skipped with a warning; the per-file
and total size caps apply; and output is deterministic. When no `ROTARIS.md`
exists, injection MUST behave exactly as before — no empty block, no source
comment, and no change to `AGENTS.md` handling.

### Test portfolio

| Level         | Productive scenario                                                                                      | Exercised boundary                                       | Planned/covering test |
| ------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| Unit          | Workspace with `ROTARIS.md` + `AGENTS.md` injects both, `ROTARIS.md` first                               | Merge order, source comments, empty/unreadable-file skip | planned               |
| Integration   | Workspace with no `ROTARIS.md` yields the unchanged `AGENTS.md`-only block                               | No-change path                                           | planned               |
| User-flow E2E | Agent constructed in a workspace with `ROTARIS.md` carries its content in the injected instruction block | Public boundary: agent construction → injected context   | planned               |

Epic: [Agent Context, Skills & Instructions](../400-agent-context-skills.md)

## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Agentic Framework - Language-Aware Tool Setup and `/inittools` (2026-04-13)

Original: `docs/requirement-log/unresolved/requirements-20260413-205430.md` — document status: Not Started - language-aware tool auto-setup, `/inittools`, and dynamic linter/formatter registration are not implemented in the codebase.

#### Description

This requirement set covers language-aware development tool setup only. The orchestrator must detect programming languages present in the workspace before implementation, resolve the appropriate linters and formatters, install missing tools when possible, and register them as first-class tools (`lint`, `format`, or language-specific variants) available to coding agents. The `/inittools` slash command belongs here because it is the user-facing control for re-running this setup pipeline on demand.

#### Implementation Notes

**Requirements Document:**

**Last Updated:** 2026-05-03

**Separation Notes:**

This document previously mixed three concerns: language-aware tool setup, the general slash-command system, and agent skill loading. They now live separately: Concern | Owning Requirement Language detection, linter/formatter resolution, installation, registration, `/inittools` | This document General TUI slash-command interception, dispatch, and autocomplete | `requirements-20260417-slash-commands.md` `SKILL.md` discovery, parsing, activation, and `/skills` / `/loadskill` commands | `requirements-20260503-skill-md-protocol.md` The old skill-related requirements from this file (`REQ-20260413-205430-010` through `019`, `022`, `024`, and `030` through `034`) are superseded by the new `REQ-20260503-SKILL-*` IDs. The original IDs should not receive new implementation work.

**Tests:**

**Excluded / Out of Scope:**

- General slash-command parsing and autocomplete beyond the `/inittools` command contract.

- `SKILL.md` discovery, parsing, activation, manual loading, or skill-triggered slash commands.

- Authoring or generating tool configuration files from inside the framework.

#### Acceptance Criteria

**Constraints:**

**Acceptance Criteria:**

1. Starting a coding task can populate session context with the detected workspace languages.

2. The framework can resolve linter and formatter commands for supported languages through defaults or config overrides.

3. Missing tools are installed when possible and skipped with a visible warning when not possible.

4. Coding agents can call registered lint and format tools, including language-specific variants in multi-language repos.

5. `/inittools` can re-run the setup pipeline without duplicating tools or changing a stable workspace state.

### Agentic Framework - `SKILL.md` Protocol for Agents (2026-05-03)

Original: `docs/requirement-log/done/requirements-20260503-skill-md-protocol.md` — document status: Complete - SKILL.md discovery, parsing, metadata catalog injection, read-only skill body access, TUI slash commands, manual session loads, and targeted unit coverage are implemented in src/rotaris_core/.

#### Description

The framework must support portable `SKILL.md` files as agent-facing instruction assets that can be discovered from standard filesystem locations, normalized, and made available to agents through a **3-level loading model** inspired by the Anthropic skill protocol:

1. **Level 1 — Metadata Catalog (always-on, at startup):** Every discovered skill's `name` and `description` from its YAML frontmatter is injected into the agent's system prompt at session start. This is a lightweight catalog (~100 tokens per skill) that tells the agent _what skills exist_. It is unconditional — all valid installed skills participate.

2. **Level 2 — Body Retrieval (model-initiated, at runtime):** When the agent decides a skill matches the current task, it uses a filesystem tool (typically `bash: read SKILL.md` or an equivalent read tool) to bring the full skill body into context. The agent _actively retrieves_ the skill rather than being passively handed it. Only the skill body enters context — not scripts or resources referenced by the skill.

3. **Level 3 — Script/Resource Execution (model-initiated, output-only):** When a skill references executable scripts or data files, the agent runs them via the shell and receives only stdout/stderr. Script source code never enters the context window, making this level effectively token-free beyond the command invocation.

The key design insight: **the model is not "given" skills — it actively retrieves them.** The `description` field is therefore critical: it is the _only_ signal the model sees at Level 1 before deciding whether to load the full body at Level 2. A vague description means the model either never loads the skill or loads it for the wrong task.

This document owns four concerns: `SKILL.md` discovery, `SKILL.md` parsing and normalization, the 3-level activation pipeline, and the skill-management commands `/skills` and `/skill`.

### Why `/skill` alongside autodiscovery?

Autodiscovery covers skills installed in standard paths. `/skill <path>` serves a different purpose: ad-hoc runtime loading from non-standard paths — trying a skill before installing it, loading a skill shared via a gist or chat, or attaching a one-off skill to a single session without polluting the installed skill directories. It is a developer/convenience surface, not a replacement for installation.

This document does **not** own always-on workspace context files. `AGENTS.md`, `AGENTS.override.md`, root fallback files such as `CLAUDE.md` / `GEMINI.md`, and their merge logic are owned by `docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md`. Those files are always-on context, not portable `SKILL.md` assets.

This document also does **not** own the general slash-command interception or autocomplete engine. That infrastructure remains owned by `docs/requirement-log/partial/requirements-20260417-slash-commands.md`. The only slash-command scope here is the registration of `/skills` and `/skill` commands inside that existing framework.

The implementation target is consistent with the Anthropic/OpenHands skill model:

- A portable skill lives at `<skill_dir>/SKILL.md`.
- The file contains Markdown plus YAML frontmatter with at minimum `name` and `description`.
- Skills live on the filesystem and are accessed by the agent through filesystem/bash tool calls at runtime (Level 2/3), not pre-loaded into context.
- Only the metadata catalog (Level 1) is pre-injected at startup.

To reduce migration friction from earlier draft requirements, the loader may accept legacy frontmatter aliases (`type` plus `triggers`) but must normalize them to the canonical representation internally. The canonical trigger model is the `description` field — the agent matches skills to tasks based on the description text, not through framework-side keyword matching.

#### Implementation Notes

**Resolved conflicts in this revision:**

1. `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` no longer belong to this document. They are always-on context files and are already governed by the completed AGENTS.md requirement.
2. The old draft mixed two incompatible metadata schemes: top-level `type` / `triggers` and OpenHands-style `trigger`. This document now treats `trigger` as legacy metadata preserved for slash-command registration only. The primary activation path is model-driven via the `description` field in the Level 1 catalog.
3. The old draft assumed a no-frontmatter `SKILL.md` should become always-on. That conflicted with both the AGENTS.md requirement and the Anthropic skill model. In this document, every valid skill gets its metadata injected (Level 1), and the body is retrieved on demand by the agent (Level 2).
4. The old draft used framework-side keyword matching to activate skills. This is replaced by the model-driven approach: the agent sees the metadata catalog and decides which skill to load via filesystem reads. Keyword matching only survives for slash-command registration (a UX convenience, not the primary path).
5. The old draft treated flat `.openhands/skills/*.md` and `.openhands/microagents/*.md` as first-class discovery paths. Those formats are not the implementation target and are excluded from this pass.
6. Skill-specific MCP activation remains out of scope. Skills may mention MCP usage in prose, but no `SKILL.md` frontmatter field in this requirement may implicitly mutate `mcp_servers`, enable connectors, or alter persona tool registration.

**Design rationale for the 3-level model:**

- **Token efficiency:** Only metadata (~100 tokens/skill) is always in context. Full bodies (potentially thousands of tokens) are loaded only when relevant.
- **Agent agency:** The model chooses which skill to load based on the task, rather than the framework guessing via keyword matching. This handles ambiguous or multi-skill tasks better.
- **Description is critical:** Since the description is the only Level 1 signal, it must be specific and task-oriented. "Helps with code review" is bad; "Check PR diffs for security vulnerabilities, style violations, and missing tests" is good.
- **Scripts stay out of context:** Level 3 ensures script source never clutters the context window. Only results enter.

**Implementation anchors in this repo:**

- `src/rotaris_core/agents/factory.py`
  The agent-construction pipeline. Level 1 metadata catalog injection happens here — append the catalog to the system prompt at agent creation time.
- `src/rotaris_core/agents/agents_md_loader.py`
  Existing discovery/caching pattern that is analogous in shape, but not shared in scope.
- `src/rotaris_core/tui/widgets/slash_commands.py`
  Existing slash-command registry. Skill-backed slash commands (from legacy trigger keywords) and `/skills` / `/skill` register here.
- `src/rotaris_core/session/`
  Likely home for session-scoped manual-load state and the in-memory catalog used by `/skills`.

**Suggested implementation split:**

1. Add a dedicated skill loader / normalizer module under `src/rotaris_core/agents/` or `src/rotaris_core/skills/`.
2. Define a small internal metadata model (`SkillMeta`) carrying: normalized name, description, source path, source scope, legacy trigger keywords, and the on-disk path to the `SKILL.md` body (for Level 2 access).
3. Wire startup discovery into session or app initialization. Build the catalog.
4. At agent construction time, format the catalog as a compact text block and inject it into the system prompt — clearly separated from persona and AGENTS.md content.
5. Ensure the agent's filesystem/bash tooling can reach skill directories (Level 2/3). No special tool is needed — standard `bash` or read tools suffice.
6. Register slash-command-backed skills and `/skills` / `/skill` with the existing command registry.
7. Add unit coverage for discovery, parsing, catalog formatting, and slash-command registration before any TUI integration test changes.

**Out of Scope:**

- Editing, publishing, deleting, or installing skills from inside the framework.
- Auto-suggesting skills from repository analysis.
- Flat OpenHands legacy microagent compatibility.
- Skill-triggered activation of MCP servers or other tool registries.
- Persisting `/skill` additions across sessions.

#### Acceptance Criteria

1. Starting a session discovers valid `SKILL.md` directories from the documented project and user paths with deterministic precedence.
2. Every valid discovered skill has its `name` and `description` injected into the system prompt at agent construction (Level 1), clearly separated from persona and AGENTS.md content.
3. Full `SKILL.md` bodies are NOT pre-loaded at startup; they are accessible to the agent through filesystem/bash tooling for on-demand retrieval (Level 2).
4. Scripts referenced by skills produce only stdout/stderr in context; script source code is not injected unless explicitly read by the agent (Level 3).
5. Legacy trigger metadata loads correctly and normalizes, but does not drive the primary activation path — the model decides via the description catalog.
6. Slash-prefixed trigger keywords register commands that inject the skill body for the current turn without leaking raw command text into user prompts.
7. `/skills` lists the metadata catalog accurately. `/skill <path>` adds skills to the session-scoped catalog without persisting config changes.
8. Malformed or incomplete `SKILL.md` files degrade gracefully with warnings rather than blocking startup.

### Agentic Framework - `AGENTS.md` Auto-Discovery and Injection (2026-05-26)

Original: `docs/requirement-log/done/requirements-20260526-agents-md-auto-injection.md` — document status: Complete - AGENTS.md discovery, merge, session-scoped caching, and AgentContext injection are implemented in `src/rotaris_core/` with unit coverage.

#### Description

The framework must automatically discover `AGENTS.md` files across a three-tier hierarchy - user-global, project root, and current-working-directory walk - merge them in top-down order, and inject the combined content as an always-on Skill into every agent's `AgentContext` at construction time. This requirement is intentionally narrow in scope. `AGENTS.md` files contain plain, free-form Markdown workspace context with no YAML frontmatter and no activation triggers. They are unconditionally always-on and injected before the first user turn. They are **not** skills in the SKILL.md sense: they carry no `name`, `type`, or `triggers` metadata. The SKILL.md protocol document (`docs/requirement-log/done/requirements-20260503-skill-md-protocol.md`) now explicitly excludes `AGENTS.md` from its scope and treats it as a separate always-on context system owned here. This document owns the deeper specification that the earlier SKILL.md draft had left mixed together with portable skills: the full three-tier hierarchy, override semantics, subdirectory walk, merge algorithm, size limits, caching, and the exact injection point in the agent-construction pipeline. The AGENTS.md format was pioneered by OpenAI for the Codex CLI and donated to the Agentic AI Foundation (AAIF), a directed fund under the Linux Foundation, in December 2025 - the same wave as Anthropic's MCP donation. As of May 2026 it is adopted by more than 60,000 open-source projects and is read natively by: OpenAI Codex, Sourcegraph Amp, Google Jules, Cursor, Aider, RooCode, Zed, and Factory Droids. The format has no required fields. Any plain Markdown file named `AGENTS.md` is valid. This simplicity is a design choice: the file is meant to be authored and read by humans while being machine-consumable without a parser. The standard defines a three-tier discovery hierarchy:

1. **User-global scope** - personal defaults that apply to all projects on the

machine (`~/.codex/AGENTS.md`, with an optional override variant).

2. **Project-root scope** - repository-wide conventions discovered at the Git

repository root.

3. **Subdirectory scope** - component- or team-specific context in directories

between the Git root and the agent's current working directory. Files are concatenated in discovery order (global first, CWD-level last). Because language models weight recent context more heavily, content from files closer to the working directory naturally takes precedence without requiring a complex merge strategy. The canonical comparison with neighbouring files: `AGENTS.md` | None | None (always-on) | Workspace context | This requirement `SKILL.md` | YAML frontmatter | Optional keyword/slash trigger | Portable skill | `docs/requirement-log/done/requirements-20260503-skill-md-protocol.md` `CLAUDE.md` | None | None (always-on) | Claude Code compat alias | This requirement `GEMINI.md` | None | None (always-on) | Gemini CLI compat alias | This requirement

#### Implementation Notes

**Requirements Document:**

**Context Sources:**

The following files and URLs were consulted to produce this document. The agent instruction files listed here are the inputs that shaped the requirement definitions and implementation guidance.

**Agent instruction files loaded:**

Path | Role `/mnt/8tb/dev/rotaris-core/AGENTS.md` | Workspace instructions - architecture, critical rules, conventions `/mnt/8tb/dev/rotaris-core/docs/requirement-log/done/requirements-20260503-skill-md-protocol.md` | SKILL.md protocol - neighbouring portable-skill requirement and scope boundary for what is not owned here `/mnt/8tb/dev/rotaris-core/src/rotaris_core/agents/factory.py` | Implementation anchor - `create_agent_for_persona()` contains the `agent_context = AgentContext()` injection point and the full agent-construction pipeline `/mnt/8tb/dev/rotaris-core/docs/reference/OPENHANDS_SDK_ARCHITECTURE.md` | SDK reference - `AgentContext`, `Skill`, and `Agent` constructor fields

**External sources consulted:**

URL | Topic `https://agents.md` | Open AGENTS.md specification, AAIF/Linux Foundation stewardship `https://www.infoq.com/news/2025/08/agents-md` | InfoQ - ecosystem adoption, monorepo hierarchy `https://docs.factory.ai/cli/configuration/agents-md` | Factory - three-tier discovery hierarchy `https://mer.vin/2025/12/openai-codex-cli-memory-deep-dive` | Codex CLI - global, project-root, subdirectory merge algorithm `https://thepromptshelf.dev/blog/agents-md-codex-setup-guide-2026` | Codex - step-by-step merge order, 32 KiB cap `https://gist.github.com/0xdevalias/f40bc5a6f84c4c5ad862e314894b2fa6` | Aggregated notes - Codex `AGENTS.override.md`, fallback filenames, Amp compat `https://kingy.ai/blog/the-definitive-guide-to-agents-md-what-it-is-how-to-use-it-and-why-it-matters` | Comprehensive guide - AGENTS.md vs CLAUDE.md vs SKILL.md positioning `https://www.augmentcode.com/guides/how-to-build-agents-md` | Augment - practical authoring guidance, comparison with tool-specific files

**Discovery Hierarchy:**

The canonical discovery order for this framework: Priority | Path | Scope | Semantics 1 | `~/.codex/AGENTS.override.md` | User global | Replaces the regular global file at this tier 2 | `~/.codex/AGENTS.md` | User global | Baseline personal context; skipped if override present 3 | `~/.config/opencode/AGENTS.md` | User global (Amp / oh-my-openagent) | Checked when neither Codex path exists 4 | `<git_root>/AGENTS.override.md` | Project root | Replaces `<git_root>/AGENTS.md` at this tier 5 | `<git_root>/AGENTS.md` | Project root | Repo-wide conventions; skipped if root override present 6 | Intermediate directories: `AGENTS.override.md` then `AGENTS.md` | Subdirectory walk | Each directory from git root toward `config.workspace_root` 7 | `<config.workspace_root>/AGENTS.override.md` | CWD | Most specific override 8 | `<config.workspace_root>/AGENTS.md` | CWD | Most specific standard file 9 | `<git_root>/CLAUDE.md` | Project root fallback | Used when no AGENTS\*.md exists at root; Claude Code compatibility 10 | `<git_root>/GEMINI.md` | Project root fallback | Used when no AGENTS\*.md or CLAUDE.md exists at root; Gemini CLI compatibility **Override semantics:** When an `AGENTS.override.md` is present at a given directory level, it is used instead of `AGENTS.md` at that same level. The override file does not stack on top of the regular file - it replaces it. Override files from different directory levels do still concatenate with each other and with non-override files from other levels. **Fallback semantics (priorities 9-10):** Fallback filenames are only consulted at project root when no `AGENTS.md` or `AGENTS.override.md` exists at root level. They are not walked into subdirectories.

**Tests:**

**Resolution Items:**

1. **User-global path precedence:** The current priority table checks `~/.codex/AGENTS.md` before `~/.config/opencode/AGENTS.md`. Confirm whether the `opencode` path should be an additional fallback (checked only when Codex path is absent) or always included as a separate tier. The SKILL.md protocol includes the `opencode` path at priority 5 in its own table; this requirement aligns with that ordering.

2. **Walk direction:** This requirement specifies top-down (Git root → CWD). Confirm this matches expected agent behaviour for monorepos: a file at `packages/api/AGENTS.md` will appear after `AGENTS.md` at the repo root, giving the package-level file higher LLM recency weight. The alternative (CWD → root, bottom-up) would reverse that recency; it is not the Codex convention and is **not** recommended.

3. **Fallback scope for CLAUDE.md / GEMINI.md:** Currently restricted to project root only. Decide whether subdirectory-level `CLAUDE.md` should also be collected during the walk, for projects that use Claude Code conventions throughout a monorepo.

**Excluded / Out of Scope:**

- YAML frontmatter parsing on AGENTS.md files (AGENTS.md has no frontmatter by convention).

- Keyword-triggered or slash-command-triggered activation (AGENTS.md is always-on only; those patterns belong to the SKILL.md protocol).

- Dynamic reload or filesystem watch during a live session (content is a static snapshot taken at session start).

- Authoring, editing, or validating AGENTS.md content from inside the TUI.

- Auto-suggesting or generating AGENTS.md content for a new project.

- Parsing structured sections within AGENTS.md (the content is treated as opaque Markdown text).

- Tool-specific `AGENTS.override.md` semantics beyond the file-level replacement described here.

#### Acceptance Criteria

**Acceptance Criteria:**

1. Starting a session with an `AGENTS.md` at repository root injects that file's content into every agent constructed for the session, verifiable via the `agent.agent_context.skills` attribute.

2. User-global content (`~/.codex/AGENTS.md`) appears before project-root content in the merged string.

3. Subdirectory-level files appear after their parent-directory files and before the CWD-level file.

4. `AGENTS.override.md` at any level produces output that does not include `AGENTS.md` from the same level.

5. Files exceeding 32 KiB are truncated and logged; the merged total never exceeds 128 KiB.

6. Setting `inject_agents_md: false` in workspace config results in no AGENTS.md content reaching any agent.
