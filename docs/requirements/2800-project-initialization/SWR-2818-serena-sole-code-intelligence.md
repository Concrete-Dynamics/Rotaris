---
req-id: SWR-2818
status: approved
trace: required
test: required
title: "Serena is the only semantic code-intelligence server in the defaults"
epic: SWR-2800
date: 2026-08-11
---

# SWR-2818 — Serena is the only semantic code-intelligence server in the defaults

Rotaris MUST ship exactly one semantic code-intelligence MCP server in its
built-in defaults, and that server is Serena. No default persona may list `lsp`,
and `lsp` MUST NOT be a default MCP server entry.

Until SWR-2801 landed, `lsp` (`@theupsider/lsp-mcp`) was how a persona reached
definitions, references and diagnostics. Serena now answers every one of those
questions, and answers them bound to the directory the run actually executes in
(SWR-2905). Keeping both meant nine of the twelve default personas started two
language-server subprocesses per run, carried two tool vocabularies into every
system prompt, and had two ways for the same lookup to fail:

| Capability | `lsp` tool | Serena tool |
| --- | --- | --- |
| Workspace binding | `lsp_init(root=…)` at runtime; a failure discards the client | `--project <workspace_root>` at launch (SWR-2905) |
| Definitions | `lsp_definition` → `go_to_definition` | `find_declaration`, `find_symbol` |
| References | `lsp_references` → `find_references` | `find_referencing_symbols` |
| Diagnostics | `lsp_diagnostics` → `problems` | `get_diagnostics_for_file` |
| Hover, completion, signature help, health | already withheld via `disabled_tools` | — |
| Symbol overview, pattern search, symbolic edits, project memories | not offered | offered |

The removal is a subtraction, not a substitution: every persona that had `lsp`
keeps `serena`, which it already had.

## Acceptance criteria

- No entry in `DEFAULT_PERSONAS` names `lsp` in its `mcp_servers`.
- `DEFAULT_MCP_SERVERS` has no `lsp` key, so the server is neither launched nor
  listed as available in the MCP management surfaces.
- Every persona that reads or changes repository code still names `serena`
  (the SWR-2801 roster is unchanged by this requirement).
- The textual tools — `grep`, `glob`, `read_file`, `haet_read` — remain on the
  personas that had them. They are the deliberate fallback for strings, config
  keys, comments and non-indexed files, and they are not optional: Serena's
  `ide` context excludes its own `read_file`, `find_file`, `list_dir` and
  `execute_shell_command` precisely because it expects the host to provide them.
- Persona prompts name Serena's tools where they previously named LSP's, so the
  prose an agent reads matches the tools it is offered.
- `lsp` remains *configurable*: a user who wants it can declare the server and
  reference it from a persona in `agents.yaml`, and the shared MCP provider
  still calls `lsp_init` for a server named `lsp` (SWR-1731). What changes is
  that Rotaris no longer ships it. A workspace `agents.yaml` that lists `lsp` on
  a persona must therefore also declare the `lsp:` server block — as
  `examples/agents.yaml` still shows — or config validation reports
  `references unknown MCP server`.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user starts Rotaris with no custom config: no persona asks for `lsp`, `lsp` is not a default server, every code-touching persona still has `serena`, and the default config still validates | `config/defaults.py` → `validate_config` | `tests/unit/test_config_defaults.py::test_no_default_persona_requests_the_lsp_server`, `::test_lsp_is_not_a_default_mcp_server`, `::test_code_personas_keep_serena_and_their_textual_fallback` |
| Integration | The MCP config a developer persona is actually built with carries Serena and no LSP server, including when the run executes in a worktree | Config load → persona factory → agent MCP config | `tests/integration/test_serena_mcp_discovery.py::test_developer_persona_gets_serena_and_no_lsp_server` |
| User-flow E2E | A user opens and initializes a fresh code workspace; the toolset that reaches the run exposes Serena's symbolic tools and no LSP server anywhere | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_an_initialized_workspace_offers_serena_and_no_lsp_server` |

Derived requirements: [SWR-2819 — Serena runs at a pinned release](SWR-2819-serena-pinned-release.md)

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
