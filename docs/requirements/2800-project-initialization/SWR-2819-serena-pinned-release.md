---
req-id: SWR-2819
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2818
title: "Serena runs at a pinned release"
epic: SWR-2800
date: 2026-08-11
---

# SWR-2819 — Serena runs at a pinned release

The default Serena MCP entry MUST launch an exact published release of the
`serena-agent` distribution, never a moving reference.

The previous default was `uvx --from git+https://github.com/oraios/serena`,
which resolves to whatever the upstream default branch happens to be the moment
a machine's `uvx` cache is cold. That is acceptable for trying a tool out and
unacceptable for a harness: with SWR-2818 making Serena the only semantic
navigator Rotaris ships, an upstream push can change every persona's tool names,
withhold a tool a prompt tells an agent to call, or fail to build — and it does
so on a schedule nobody in this repository controls, on some machines and not
others. A run cannot be reproduced from a bug report if the code intelligence
behind it was rebuilt from `HEAD`.

The pinned version therefore lives in exactly one place,
`rotaris_core.config.defaults.SERENA_PINNED_VERSION`, so that upgrading Serena is
a single reviewed edit with the whole test suite behind it rather than a silent
event.

## Acceptance criteria

- The default `serena` entry launches `uvx --from serena-agent==<version>
  serena start-mcp-server`, where `<version>` is `SERENA_PINNED_VERSION`.
- No default MCP entry names a VCS reference (`git+…`) or a floating `@latest`
  tag for Serena.
- `SERENA_PINNED_VERSION` is an exact release version (`MAJOR.MINOR.PATCH`), not
  a range or a constraint expression.
- The pin survives per-run command resolution: the launch Rotaris actually
  performs still carries both the pinned spec and the `--project` binding
  SWR-2905 fills in.

## Test coverage

Unit coverage asserts the shape of the default entry — the pinned `serena-agent`
spec, the absence of any `git+` element, and the exact-version format of
`SERENA_PINNED_VERSION` — in `tests/unit/test_config_defaults.py`. Integration
coverage asserts the pin survives `resolve_stdio_server_command_args` alongside
`--project` in `tests/integration/test_serena_mcp_discovery.py`, which is the
same seam SWR-2905 already exercises.

No separate user-flow E2E is required: the product flow this enables is the one
SWR-2818 already covers end to end, and a hermetic test cannot meaningfully
assert against a real upstream release without a network install.

Derived from: [SWR-2818 — Serena is the only semantic code-intelligence server in the defaults](SWR-2818-serena-sole-code-intelligence.md)

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
