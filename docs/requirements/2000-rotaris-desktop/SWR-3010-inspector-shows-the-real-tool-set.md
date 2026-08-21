---
req-id: SWR-3010
status: approved
trace: required
test: required
title: "The agent inspector lists the tools the agent actually has"
epic: SWR-2000
date: 2026-08-13
---

# SWR-3010 — The agent inspector lists the tools the agent actually has

The inspector's **Tools** field prints the persona's declared `tools:` list. That is not what
the agent got. It is wrong in both directions at once: it shows tools the persona declares but
the runtime removed — `orchestrator` is listed with `write_file`, `terminal` and `git_commit`,
which `coordinator_only` strips before the agent is built — and it shows none of the MCP tools,
so the ~20 Serena tools an agent can actually call are invisible. A panel whose job is to say
what this agent can do must not be read as a persona template.

The inspector MUST list the tool set of the agent it is displaying:

- **Native tools** as the run resolved them — after `coordinator_only`, `read_only`, intent
  policy and per-tool availability have been applied — not the persona's declaration.
- **MCP tools**, grouped under a heading per server, listing the tools that server actually
  granted this agent (SWR-3008).
- Each tool keeps its existing `active` / `used` / `not used` state, which is derived from the
  agent's tool-call history and works the same for MCP tool names.
- The pop-out agent window shows the same set as the inspector panel.
- An agent from a session snapshot written before this requirement, or a persona with no live
  agent, falls back to the persona's declared tools rather than showing nothing.

The panel reads what the run recorded; it does not re-derive the tool set, which would mean
re-running MCP discovery on the UI thread.

## Acceptance criteria

- The inspector for a running `orchestrator` does not list `write_file`, `terminal` or
  `git_commit`.
- The inspector for an agent carrying `serena` shows a `serena` heading followed by that
  agent's granted Serena tools, and shows no Serena tool it was not granted.
- A tool the agent has called reads `used`; one it is calling right now reads `active`.
- Popping the agent out shows the same tools as the panel.
- An agent whose record carries no recorded tool set still lists the persona's declared tools.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | An agent record carrying a recorded native and per-server MCP tool set projects into an `AgentNode` that carries both; a record without them falls back to the persona's declared tools. | Session snapshot → `AgentNode` projection | `apps/rotaris/tests/test_services.py::test_agent_node_uses_the_recorded_tool_set`, `::test_agent_node_falls_back_to_persona_tools` |
| Integration | Selecting an agent in the inspector renders its native chips and one chip group per MCP server, each chip carrying the right used/active state; the pop-out lists the same set. | Store state ↔ inspector widgets | `apps/rotaris/tests/test_views.py::test_inspector_lists_native_and_mcp_tools`, `::test_inspector_shows_no_mcp_heading_for_an_agent_without_mcp_tools`, `::test_popped_out_agent_lists_the_same_mcp_tools_as_the_panel` |
| User-flow E2E | A desktop user watches a session, and the inspector for the running agent reads the tools that agent actually holds — its resolved native set plus its granted Serena tools — rather than the persona's declaration. | Real PySide6 MainWindow flow over a real persisted session, with a fake external agent event source | `apps/rotaris/tests/test_inspector_live_focus_e2e.py::test_inspector_shows_the_running_agents_real_tool_set` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
