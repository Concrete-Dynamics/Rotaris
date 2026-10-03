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

## Outcome (2026-10-03, fin12, repaired)

The configuration stays loaded per workspace and is bound at the hand-off. `mcpConfigurationForExecutionRoot`
(`packages/config/src/mcp/index.ts`) gives a run whose execution root is a worktree the view in which every server
REQ-MCP-034's stage bound carries the tree's root: its configured arguments carry neither project-selection option, its
resolved arguments carry the launch subcommand and end with the project-path option and the workspace root, and that last
argument becomes the tree's root, in the resolved arguments and in the description launch and discovery read. A configured
selection, every other server, `cwd` and REQ-MCP-035's fill-in are left as they were (OQ-194). The run host's
`configurationForExecutionRoot` (`apps/desktop/src/run-host/mcp.ts`) is read by the tool port's `ready()`
(`ctx.effectiveRoot ?? ctx.workspaceRoot`, discovery and surface memoised on that root) and by `session.start`'s discovery
ahead of the run (`dispatch.ts`). The start-session dialog's worktree, the board's unit trees and a continuation (through
the session row's binding) all reach the port as `effectiveRoot`, so every isolated run takes the one path. The discovery
line and the connected line now name the project the launched description carried (`mcp: discovery of 'code_intelligence'
(project <root>) listed …`, `… hook code_intelligence:ok, project <root>) in … ms`; `SessionDeps.launchNote` in
`packages/mcp/src/sessions.ts`), since the transport's launch line is written at debug.

Pinned by "REQ-MCP-034: the code-intelligence binding of a run in an isolated working tree" in
`apps/desktop/src/run-host/tools.test.ts` (the command line every MCP call is handed ends with the project-path option and
the worktree's root, the anchoring root absent; red before the repair with the workspace root in its place), by
"REQ-MCP-034: the configuration a run in an isolated working tree launches from" in `packages/config/src/mcp/mcp.test.ts`,
by two cases in `apps/desktop/src/run-host/mcp.test.ts` and one in `packages/mcp/src/mcp.test.ts`, and (added at the
bundle's first repair round) by "session.start discovers ahead of the run against the root the run executes in (REQ-MCP-034,
REQ-MCP-050)" in `apps/desktop/src/run-host/dispatch.test.ts` (red on the dispatch hop before the repair, the workspace's root
handed to discovery). Shown in the built app by
`injection-proof`'s isolated launch, which now asserts the launch lines: red on a build of the code without the repair
("isolated: REQ-MCP-034 — not every launch named <the worktree> — discovery: <the workspace>"), green after it, and the base
launch naming the workspace (as root under Xvfb, Node 24, `--skip-build --skip-latency`, load 2.2 to 3.9 on 4 CPUs).

The harness half: `live-run.mjs`'s requirements scenario now also checks "the code-intelligence server was launched against
the worktree's root, never the workspace the board sits in (REQ-MCP-034)", reading every launch line of the server in the
scenario's app log through `bindingVerdict` (`apps/desktop/scripts/lib/code-intelligence-binding.mjs`, four cases in its
test, the first of them the run at 1763f7f's own lines, which name no project and are red). Not run live here (this plan runs
no live scenario); the scenario that shows it is `live-run --only=requirements`.

REQ-MCP-099's marker against a worktree, measured against the pinned runtime (serena-agent 1.7.0) in a scratch repository: the
linked tree holds no marker (its directory is excluded the OQ-161 way and so never checked out); the runtime's first launch
against the tree generates the tree's own project and registers it in the runtime's home, answers from the tree, and never
falls back to the main checkout. It serves the tree's own memories, not the anchoring project's, and a memory written in the
run stays in the tree: raised as OQ-195, not ruled here. The editing tools were not exercised against a language server (none
is provisioned on this host); bound as above they act on the tree.
