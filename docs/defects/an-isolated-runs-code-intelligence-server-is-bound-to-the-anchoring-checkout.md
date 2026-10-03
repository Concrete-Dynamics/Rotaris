## An isolated run's code-intelligence server is bound to the anchoring checkout, not to the run's working tree

A run confined to an isolated working tree (a Requirements board run, or a session started with the start-session
dialog's isolated worktree) launches the code-intelligence server with `--project <the anchoring workspace root>`, so
every symbol-level answer comes from the user's main checkout and every symbol-level edit tool the persona holds would
act on it. The MCP configuration is resolved once per workspace (`configureRun(workspaceRoot)`), REQ-MCP-034's stage
appends that workspace root, and the run host's tool port hands the configuration to the MCP host unchanged, keyed on
`ctx.workspaceRoot` (the anchoring root) rather than on the run's execution root, which the port's context already
carries as `effectiveRoot`. The gap was stated, not fixed, in ADR-0034's Part T report (2026-09-06): "nothing exercised
it … owed to whoever next touches the isolated-run start".

Seen by the orchestrator's default live run at origin/main 1763f7f (2026-10-03 05:56 to 06:15 UTC, `live-run PASSED`,
133 checks), requirements scenario, session 76d7de01: the board run was confined to
`.rotaris/requirements/worktrees/rotaris-req-req-104-u1` (app.log:26), yet `get_diagnostics_for_file src/todos.js`
(transcript #29, and #57 for the verifier) listed `clearCompleted`, which exists only as the edit scenario's uncommitted
change in the main working tree (app.log:11, `uncommitted=4`), and missed the `completedCount` the implementer had just
written in the worktree (#20, #31; `requirements/diff.txt` holds no `clearCompleted`). Three agents were misled and two
false "stale LSP index" explanations were saved into project memory (#64, #66). The coding agent's surface carried the
server's editing tools (app.log:58: `insert_after_symbol`, `insert_before_symbol`, `rename_symbol`, `replace_content`,
`replace_in_files`, `replace_symbol_body`, `safe_delete_symbol`); none was called, but bound as above they would write
into the main checkout from a run the board disclosed as confined to its worktree. The live run's check "the run was
confined to a worktree of its own" passed on the session's worktree record alone, so no check saw it. Recorded
2026-10-03 by plan fin12, before any repair.

## Specs

- REQ-MCP-034: "For a run against an isolated working tree, the appended path SHALL be that tree's root." The appended
  path was the anchoring workspace root for every isolated run.
- REQ-MCP-050: discovery uses "the same resolved command and arguments as launch", so discovery for an isolated run was
  bound to the anchoring checkout as well.
- REQ-TRACE-472's disclosure names the worktree a board run is confined to; the server's editing tools, bound to the
  main checkout, reach outside it (not exercised in the run).

## Relevant files

- `apps/desktop/src/run-host/tools.ts`: the tool port's `ready()` hands `run.cfg` and `ctx.workspaceRoot` to
  `mcp.prepare`, `mcp.surfaceFor` and `mcp.executorsFor`.
- `apps/desktop/src/run-host/dispatch.ts`: `session.start` runs discovery ahead of the run with `mcp.prepare(setup.cfg, s.root)`.
- `packages/config/src/mcp/commands.ts`: REQ-MCP-034's stage in `resolveCommand`, which appends the root it is given.
- `packages/config/src/mcp/index.ts`: `resolveMcpConfiguration`, run once per configuration load with the workspace root.
- `packages/engine/src/sessions.ts`: `baseCtx` carries the worktree as `effectiveRoot` beside `workspaceRoot`.
- `apps/desktop/scripts/live-run.mjs`: the requirements check "the run was confined to a worktree of its own".
- `docs/architecture/adr/0034-mcp-connections-and-configuration-resolution.md`: the Part T report that stated the gap.
