---
req-id: SWR-2823
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2820
title: "Serena CLI command resolution"
epic: SWR-2800
date: 2026-08-15
---

# SWR-2823 — Serena CLI command resolution

Derived from: [SWR-2820 — Deterministic Serena project setup](SWR-2820-deterministic-serena-setup.md)

The deterministic setup runs Serena's CLI rather than its MCP server. Both must be the
**same Serena**, or a workspace ends up indexed by one build and queried by another — and the
pin that [SWR-2819](SWR-2819-serena-pinned-release.md) exists to guarantee would hold for the
server and silently not for the setup that feeds it.

Hard-coding `uvx --from serena-agent==<pinned>` in the setup runner would do exactly that: a
workspace that repointed `serena` at a local checkout, a different version, or an entirely
different launcher would have its index built by the default build regardless.

## Required behaviour

A resolver MUST derive the CLI invocation from the workspace's configured `serena` MCP server
entry:

- It reuses the existing shorthand expansion (`resolve_command`, SWR-1715/SWR-1716), so an
  `npm:`/`uvx:` prefixed command resolves the same way it does for a server launch.
- It takes the configured argument list up to Serena's launch verb — identified by the
  existing `SERENA_LAUNCH_MARKER`, not by the server's name, since a user may call the entry
  anything — and drops that verb and everything after it. What remains is the prefix a CLI
  subcommand is appended to.
- Server-launch-only arguments (`--context`, `--transport`, `--project`, and their values)
  never reach a CLI invocation, because they live after the launch verb.
- A configured entry that is not a Serena launch at all, or one with no resolvable command,
  yields no invocation, and the caller reports the task as unavailable rather than guessing.

The result is that upgrading Serena stays the single edit `SERENA_PINNED_VERSION` promises,
and a workspace that overrode the server keeps its override for setup too.

## Acceptance criteria

- The resolved invocation for the shipped default names the pinned `serena-agent` version.
- A workspace that repins or repoints `serena` gets its own build in the resolved invocation.
- No argument following the launch verb appears in a resolved CLI invocation.
- An entry carrying no launch verb resolves to nothing.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The default entry resolves to the pinned build; a repinned and a repointed entry each resolve to their own; server-only arguments are dropped; a non-Serena entry resolves to nothing | MCP config entry → CLI invocation | `tests/unit/test_mcp_resolution.py::test_serena_cli_command_uses_the_pinned_default`, `::test_serena_cli_command_honours_a_repinned_workspace`, `::test_serena_cli_command_drops_server_launch_arguments`, `::test_serena_cli_command_is_absent_without_a_launch_verb` |

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
