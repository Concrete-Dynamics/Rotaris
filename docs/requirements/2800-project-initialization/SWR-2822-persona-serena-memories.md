---
req-id: SWR-2822
status: approved
trace: required
test: required
title: "Personas read and write Serena memories"
epic: SWR-2800
date: 2026-08-15
---

# SWR-2822 — Personas read and write Serena memories

Serena's memory store is the only place Rotaris can keep what an agent *found out* about a
repository — as opposed to what a human wrote down in `AGENTS.md`. Until now it was
effectively dead in both directions.

Reading: every persona carrying `serena` has held `list_memories` and `read_memory` since
[SWR-3008](SWR-3008-persona-serena-tool-grants.md), and **no persona prompt has ever
mentioned them**. A granted tool no prompt names is a tool the model does not know it has.

Writing: [SWR-3008](SWR-3008-persona-serena-tool-grants.md) gave the memory-writing tools to
`project-initializer` alone, on the reasoning that writing memories was that persona's whole
job. With the initializer no longer running by default
([SWR-2820](SWR-2820-deterministic-serena-setup.md)), that leaves a store with no writer at
all — and even before, it meant the one agent allowed to record a finding was the one agent
that had not done any of the work.

## Required behaviour

- Every persona that carries `serena` receives Serena's **memory reading** tools
  (`list_memories`, `read_memory`) and its **memory writing** tools (`write_memory`,
  `edit_memory`). The agent that discovers a memory is wrong is the one holding the
  correction; a store only one persona may write is a store nobody maintains.
- This holds for `read_only` and `coordinator_only` personas too. Those declarations are
  about the **working tree**, which memories are not part of — the same distinction SWR-3008
  already drew for `project-initializer`.
- `delete_memory` and `rename_memory` are granted to **no persona**. Removing or moving a
  memory is a decision about the store as a whole, not something to reach for mid-task.
- `onboarding` stays granted to `project-initializer` alone. It is not a memory-writing tool
  — it writes nothing and returns instructions — so it is declared separately from them.
- `librarian` and `intent-classifier` continue to carry no Serena at all (SWR-2801).
- Every persona granted the memory tools receives, in its rendered prompt, a protocol
  stating: read the memories before exploring; record a durable, non-obvious finding;
  `AGENTS.md` is authoritative and must not be copied into a memory; do not record
  run-specific state. It is authored **once**, next to the MCP section it renders into, not
  copied into each persona's prompt file.
- A persona whose workspace grant withholds the memory tools is not given the protocol.

## Acceptance criteria

- Every default persona carrying `serena` grants both memory reading and memory writing.
- No default persona grants `delete_memory` or `rename_memory`.
- Only `project-initializer` grants `onboarding`.
- The rendered system prompt of a persona holding the memory tools names them and states the
  protocol; the rendered prompt of a persona without them does not.
- The protocol text exists in exactly one place in the tree.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Every Serena persona grants memory read and write; no persona grants a destructive memory tool; only the initializer grants `onboarding`; the protocol renders for a persona holding the tools and not for one without | Config defaults table; prompt renderer | `tests/unit/test_config_defaults.py::test_every_serena_persona_reads_and_writes_memories`, `::test_no_persona_may_delete_or_rename_a_memory`, `::test_only_the_project_initializer_holds_serena_onboarding`, `tests/unit/test_prompt_render.py::test_memory_protocol_renders_for_a_persona_holding_the_tools`, `::test_memory_protocol_is_absent_without_the_tools` |
| Integration | A persona's resolved runtime lists the memory tools alongside its role's other Serena tools | MCP discovery → grant resolution → persona runtime | `tests/integration/test_serena_mcp_discovery.py::test_persona_grants_narrow_the_pinned_serena_surface` |
| User-flow E2E | An agent in a live run can list, read and write project memories without an approval failure | Public product boundary → the tool list the agent is handed | `tests/integration/test_persona_mcp_tool_grants_e2e.py::test_a_working_persona_may_record_a_project_memory` |

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
