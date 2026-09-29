## The code-intelligence server cannot start as root

The run host launches the bundled code-intelligence runtime of REQ-MCP-033 as a full Electron start of the application's
own executable (`electron out/main/index.js builtin:code-intelligence -- …`, packaged `Rotaris builtin:code-intelligence
-- …`), which the sentinel hands to the runtime. Run as root on Linux — a container, a CI runner — Chromium refuses to
start without `--no-sandbox` and the child dies by SIGTRAP before the sentinel runs. The project setup failed
("exited with signal SIGTRAP"), tool discovery failed, and every run recorded an `mcp_config` warning: "MCP server
'code_intelligence' failed tool discovery; its tools may be unavailable". Every agent worked without the
code-intelligence tools. The application itself starts as root only because its launchers pass the switch; the children
it spawns did not.

Found 2026-09-29 by the first live run of the merged revision 4 build of `PD-ORCH-005` (R-065, R-066), in every
scenario's issues.

## Specs

REQ-MCP-033: the reserved token launches the bundled runtime. As root it launched nothing, and REQ-MCP-042's warning was
the only trace.

## Relevant files

- `apps/desktop/src/run-host/code-intelligence-launch.ts` — the reserved token's launch, new; `host.ts` builds it.
- `apps/desktop/src/main/sentinel.ts` — `runtimeArguments`, what the runtime is handed.

## Repaired — 2026-09-29

With the owner's permission (R-066): run as root, the launch puts `--no-sandbox` between the token and `--`, and the
sentinel drops every switch before `--`, so the runtime sees its own arguments only. Every other launch is unchanged.
The child opens no window. Tests: `code-intelligence-launch.test.ts` and `sentinel.test.ts`, each red with its limb
reverted. In the built app, as root: the child's command line without the switch dies by SIGTRAP, and with it reaches
the sentinel. After `pnpm code-intel:bundle`, a live run's setup succeeded, discovery listed 22 tools, the orchestrator
was granted 12, and the session recorded no issue.
