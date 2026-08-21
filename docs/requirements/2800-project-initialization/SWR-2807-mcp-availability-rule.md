---
req-id: SWR-2807
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2802
title: "Single MCP server availability rule"
epic: SWR-2800
date: 2026-08-06
---

# SWR-2807 — Single MCP server availability rule

SWR-2802 says the initialization prompt "only appears when at least one
initialization task has its prerequisites met", and for Serena that prerequisite
is "Serena is configured as an MCP server". SWR-1714 already says a persona
silently loses an MCP server whose command cannot be launched. Those are the
same question — *can this machine start this MCP server?* — asked by two
different layers, and during the SWR-2800 build they were answered by two
different pieces of code that disagreed.

The disagreement was real, not stylistic. `rotaris_core.agents.factory` resolved the
command through `resolve_command()` first, so `uvx:serena` counted as available;
the desktop projection checked `shutil.which(server.command)` on the literal
field, so the same workspace counted as *not* offering Serena. The prompt would
then be withheld from a workspace whose personas were about to launch Serena
successfully.

This technical requirement covers the seam that removes the second opinion.

## Acceptance criteria

- `rotaris_core.config.mcp_resolution.mcp_server_is_available(name, cfg, *,
  workspace_root=None)` is the one definition of MCP server availability:
  `http`/`sse` servers are available by definition, and a `stdio` server is
  available when its command — after npm/uvx shorthand resolution — is on PATH.
- It lives beside the resolution it depends on and imports nothing from the
  agent layer, so a caller that only needs to ask the question does not pay for
  the OpenHands SDK that `rotaris_core.agents.factory` pulls in. The
  initialization prompt runs this check on every workspace open, which is why
  the import weight matters.
- Passing `workspace_root` resolves the command the way a real stdio launch
  would (including the workspace-argument fill-in). Only the command is
  inspected, so this never changes the answer — it keeps the prediction on the
  same code path as the launch.
- `rotaris_core.agents.factory._mcp_server_is_available` delegates to it and keeps
  its persona-facing behaviour unchanged: one warning per unavailable server per
  process, naming the persona that loses it.
- `rotaris_core.init.registry` asks the public helper, and the Rotaris
  `ConfigService` derives its applicable-task list from
  `rotaris_core.init.registry.applicable_tasks` instead of re-deriving the
  prerequisite. The registry decides; Rotaris renders.
- The meaning of "available" is unchanged by this requirement. Only its home is.

## Test coverage

Unit coverage in `tests/unit/test_mcp_resolution.py`: an `http` server with no
command is available; a `stdio` server whose command is on PATH is available; an
unknown command is not; a `uvx:`/npm shorthand is resolved before the PATH check
so it agrees with what the factory would launch; and the factory's private
wrapper returns the same answer as the public helper for each of those cases.

Rotaris coverage in `apps/rotaris/tests/test_project_init_wiring.py` exercises
the delegation from the desktop side: a workspace whose `serena` entry uses a
`uvx:` shorthand offers the initialization task, which is exactly the case the
duplicated rule got wrong.

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
