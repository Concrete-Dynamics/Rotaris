---
req-id: SWR-2905
status: approved
trace: required
test: required
title: "Serena is launched bound to the run's workspace"
epic: SWR-2800
date: 2026-08-10
---

# SWR-2905 — Serena is launched bound to the run's workspace

Rotaris knows which directory a run works in before the run starts. Serena MUST
therefore be launched already bound to that directory, so no agent ever spends a
turn discovering, deciding, or announcing which project it is working on.

The project path is a fact the framework owns. Asking a model to establish it is
both wasted turns at the top of every run and a correctness risk: an isolated
session runs in a git worktree, and a model that activates the repository root
instead would resolve symbols against the wrong tree.

## Acceptance criteria

- Every `stdio` Serena launch carries `--project <workspace_root>`, where
  `workspace_root` is the config the run actually executes in — for an isolated
  session that is the worktree path `config_for_session_worktree` produced, not
  the repository the user opened.
- The argument is added by
  `rotaris_core.config.mcp_resolution.resolve_stdio_server_command_args`, the same
  seam that already fills in a missing workspace argument for the filesystem
  server. A user who configured `--project` or `--project-from-cwd` themselves
  keeps their value; Rotaris fills in nothing it was given.
- Because the launch is bound, Serena's own single-project mode removes
  `activate_project` and `get_current_config` from the tool set it advertises.
  Agents cannot call them because they are not offered — this requirement is a
  launch argument, not a prompt rule asking agents to refrain.
- The default Serena entry uses `--context ide`. `ide-assistant` is a deprecated
  alias Serena remaps to its `claude-code` context, which is written for another
  product's built-in tools and withholds `search_for_pattern`.
- Binding is per run, not per application. Serena's client is owned by the run's
  `SessionMCPManager` and shared by every agent within that run, so two parallel
  sessions hold two Serena processes bound to their own workspaces and neither
  can change the other's active project.
- After Serena's client is created, the framework verifies the binding by calling
  a project-scoped Serena tool (`list_memories`) and logs a warning if it fails.
  A failed probe does **not** discard the client: Serena's symbolic tools remain
  useful even when its memory store does not answer.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A Serena launch gains `--project` pointing at the run's workspace; a user-supplied `--project`/`--project-from-cwd` is left alone; non-Serena stdio servers are untouched; the shared provider probes the binding and keeps the client when the probe fails | Command/arg resolution; shared MCP tool provider | `tests/unit/test_mcp_resolution.py::test_serena_launch_is_bound_to_the_workspace`, `::test_user_supplied_project_argument_wins`, `::test_non_serena_stdio_server_is_untouched`, `tests/unit/test_shared_tool_provider.py::test_serena_binding_is_probed_after_connect`, `::test_a_failed_serena_probe_keeps_the_client` |
| Integration | The orchestrator's resolved Serena entry is bound to the workspace it will run in, including when that workspace is a worktree | Config load → persona factory → agent MCP config | `tests/integration/test_serena_mcp_discovery.py::test_serena_is_bound_to_the_run_workspace`, `::test_serena_binding_follows_an_isolated_worktree` |
| User-flow E2E | A user opens a fresh workspace and initializes it; Serena is set up without any agent ever being offered `activate_project` | Public product boundary → user-observable result | `apps/rotaris/tests/test_project_init_e2e.py::test_first_run_sets_up_a_code_workspace_and_lifts_the_run_gate` |

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
