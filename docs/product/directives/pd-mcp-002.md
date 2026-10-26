[Product directives](../directives.md) › PD-MCP-002

<a id="pd-mcp-002"></a>

### PD-MCP-002 — every root an isolated run hands its MCP servers is the run's own tree

For a run whose execution root is an isolated working tree (REQ-WORKSPACE-050, REQ-GIT-140), "the workspace root" in the
following SHALL be read as **that tree's root**, as REQ-MCP-034 already reads it for the project path it appends:

- REQ-MCP-035's filesystem-server path fill-in: the path appended when a filesystem server is given none, and the path
  substituted for a missing one under the name `filesystem`;
- REQ-MCP-043's default `cwd` of a stdio server whose entry configures none, which REQ-MCP-050's discovery uses as well;
- REQ-MCP-070's `lsp_init` call: `{"root": "<the tree's root>"}` for a connection established by that run.

Only what the product filled in moves. A path the user configured — the workspace root itself included — a configured `cwd`,
and a project-selection argument already present are left exactly as configured. A run in the workspace itself is unchanged,
and the loaded configuration is never rewritten: the tree's root is a view of it taken for the run.

**Why, and what it costs.** A run in an isolated tree promises that its work stays in the tree. REQ-MCP-034 kept that promise
for the bundled code-intelligence server, but a filesystem server or a language server named `lsp` that a user adds would
otherwise read and write the main checkout from a run that promises isolation; no shipped default uses these, so nothing a
default run launches changes. What is given up: a user who wanted such a server to see the main checkout from an isolated
run now has to name that path in its configuration. An `lsp` connection is still the session's, so in a session whose agents
work in different trees the first to connect decides the root.

> **Narrows:** REQ-MCP-035, REQ-MCP-043, REQ-MCP-050, REQ-MCP-070

*Raised by the owner, 2026-10-06, ruling OQ-194 as recommended; logged as [R-071](../requests.md#r-071).*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071) (fin21):** the rule held as written. It extends the
> rebinding REQ-MCP-034 already had (`mcpConfigurationForExecutionRoot`, `packages/config/src/mcp/index.ts`), read the same
> exact way: the fill-in moves where the resolved arguments after a filesystem package are the workspace root alone and the
> configured ones did not name it, the `cwd` where the entry configures none. The default `cwd` moving also moves a runtime
> launched with the project-from-working-directory option onto the tree, which REQ-MCP-034's clause already asks for. The
> `lsp_init` root needed a seam: `SessionConnections.connect` (`packages/mcp/src/sessions.ts`) takes the root for the connection
> it establishes, `McpHost.executorsFor` passes the root it is handed, and the tool port now hands it the execution root where
> it handed the workspace root (OQ-194's literal reading, kept beside its replacement in `run-host/tools.ts`). **What was
> measured.** `config/src/mcp/mcp.test.ts` (a new case over nine servers, and two older cases corrected from the literal
> reading), `mcp/src/mcp.test.ts` (a real fixture server's `lsp_init` given the tree's root) and `run-host/tools.test.ts` (the
> port's executors handed the worktree), red without the change; and `injection-proof`'s isolated launch, which now carries two
> fixture servers a user might add and reads the root each was handed. **What was not measured.** A session whose agents work
> in different trees, where the first `lsp` connection decides the root for all. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57): not drivable as built.** Every run of a session, and every agent of each run,
> works in the session's one recorded execution root: a session's first run fixes it (`sessions.start`, the worktree it is
> given), and every later run reads it back (`effectiveRootOf`, `packages/engine/src/sessions.ts`, at each `setupFor`). No child
> is given a tree of its own (`delegate` takes no worktree). So no session's agents work in different trees, and the case this
> paragraph names cannot be built by a proof or a live run until something gives one session two trees. It is recorded as not
> measurable, not as measured.
