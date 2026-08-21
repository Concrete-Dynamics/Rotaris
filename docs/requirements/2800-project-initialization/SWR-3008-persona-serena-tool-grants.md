---
req-id: SWR-3008
status: approved
trace: required
test: required
title: "Per-persona Serena tool grants"
epic: SWR-2800
date: 2026-08-13
---

# SWR-3008 — Per-persona Serena tool grants

[SWR-2801](../2800-project-initialization.md) put Serena on every persona that reads or
changes repository code. It said nothing about *which* of Serena's tools each of them gets,
and the answer today is "all of them": naming a server in `mcp_servers` hands the persona the
server's whole surface. Serena's surface includes `replace_symbol_body`, `rename_symbol`,
`safe_delete_symbol`, `replace_in_files`, `write_memory` and `delete_memory` — so the three
personas declared `read_only` (`codebase-analyst`, `ui-verifier`, `project-initializer`) and
the `coordinator_only` `orchestrator` all hold code-editing tools that their own declaration
says they must not have. The native-tool restriction that strips `write_file` from them does
not look at MCP tools at all.

A persona MUST receive only the Serena tools its role needs, and the grant MUST be part of
the persona's declaration rather than a property of the server:

- Every persona that carries `serena` receives Serena's **reading** tools: symbol search and
  overview, references, declarations, implementations, pattern search, file diagnostics, and
  reading its project memories.
- The personas that change code — `coding-agent`, `tester`, `refactorer` — additionally
  receive Serena's **symbolic editing** tools.
- ~~`project-initializer` additionally receives the **memory-writing** tools, because
  writing durable project memories through Serena onboarding is the whole of its job
  (SWR-2803).~~ **Amended by [SWR-2822](SWR-2822-persona-serena-memories.md):** every
  persona carrying `serena` receives the memory-writing tools. A store one persona may
  write is a store nobody maintains, and with the initializer no longer running by default
  (SWR-2820) it would have had no writer at all. `project-initializer` keeps `onboarding`
  alone, which is declared separately because it writes no memory.
- No persona whose declaration says `read_only` or `coordinator_only` receives an editing
  Serena tool, or one that **destroys** a memory. Writing one is not on that list:
  those declarations are about the working tree, and the memory store is not part of it —
  the same distinction this requirement already drew for `project-initializer`.
- `librarian` and `intent-classifier` keep no Serena at all, unchanged from SWR-2801.
- A workspace may override any of this per persona in `agents.yaml`; an absent override
  keeps the server's whole surface, so a configuration written before this requirement
  behaves exactly as it did.

The grant is enforced where tools are created, not merely where they are described — an
ungranted tool is never presented to the model (SWR-3009).

## Acceptance criteria

- Each default persona carrying `serena` declares the tool grant its role needs, and the
  grant table above holds persona by persona.
- No persona with `read_only: true` or `coordinator_only: true` holds a Serena tool that
  edits code or destroys a memory.
- `project-initializer` holds Serena's `onboarding`; no other persona does.
- A read-only persona's agent, built and run, has no Serena editing tool available to call.
- A persona with no grant declared still receives the server's whole surface.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The shipped defaults give every persona the Serena grant its role needs, no read-only or coordinator-only persona holds an editing or memory-destroying tool, and a grant naming a server the persona does not carry is a config error. | Config defaults table; `validate_config` | `tests/unit/test_config_defaults.py::test_serena_grants_match_persona_roles`, `::test_read_only_and_coordinator_personas_hold_no_serena_edit_tools`, `::test_only_the_project_initializer_holds_serena_onboarding`, `::test_no_persona_is_granted_a_tool_the_pinned_serena_does_not_ship`, `tests/unit/test_config_validation.py::test_mcp_tool_grant_for_an_uncarried_server_is_rejected` |
| Integration | Fed the pinned Serena build's recorded tool surface, a read-only persona's resolved runtime lists only the read tools while an implementation persona also lists the editing ones. | MCP discovery → grant resolution → persona runtime | `tests/integration/test_serena_mcp_discovery.py::test_persona_grants_narrow_the_pinned_serena_surface` |
| User-flow E2E | A user runs a session in which a read-only persona works on the codebase; the agent it gets can call Serena's symbol lookups and has no Serena editing tool to call at all. | Public product boundary (`RalphLoop` → scheduler → conversation) → the tool list the agent is handed | `tests/integration/test_persona_mcp_tool_grants_e2e.py::test_a_read_only_persona_never_receives_a_serena_edit_tool` |

Derived requirements: [SWR-3009 — MCP tool grants are enforced at tool creation](../1700-config-mcp/SWR-3009-mcp-tool-grant-enforcement.md), [SWR-2822 — Personas read and write Serena memories](SWR-2822-persona-serena-memories.md)

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
