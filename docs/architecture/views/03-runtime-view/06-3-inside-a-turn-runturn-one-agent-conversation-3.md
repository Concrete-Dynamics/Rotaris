# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 3. Inside a turn (`runTurn`, one agent conversation) (continued)

Part 6 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

**The MCP surface (Part S; ADR-0033/0034).** A port is created synchronously but its MCP surface needs discovery, so the
run start kicks discovery off for every carried, launchable server (`McpHost.prepare`, each bounded by REQ-MCP-053's 35 s
watchdog on the clock port) and the turn awaits the port's `ready()` before reading `specs()` and the prompt section.
`ready()` resolves ONE surface per persona (`surfaceFor`: the drop rules, grants `undefined` ≠ `[]`, denial, rename, the
collision prefix; memoised on the versions of its inputs and the names the port reserves — its native tools; a second
resolution writes only a line the first did not: the surface line and REQ-MCP-059's grant count once per persona, a
second surface line only where a collision prefix made it differ — live-run finding D7, 2026-09-29, when the spawn
evidence of REQ-MCP-065 (`evidenceFor`, removed 2026-10-01) resolved the surface a second time with none reserved) and from it, in one place, the executors outside the registry (named by callable name, dispatching the
reported name to the session's shared connection under the entry's allowance, 300 s by default), the model's listing and
`## MCP servers` appended to the system prompt (REQ-MCP-101, byte-exact), and the **grant** the port reports once ready
(`ToolPort.grant`: the native tools its one resolution kept and, per carried server, the tools that joined the callable
map, with every carried server's fate — `grantEvidence`; a server whose tool discovery failed stays in the surface, so the
prompt lists it bare, and is recorded `dropped` for `discovery-failed` with nothing granted under it, REQ-MCP-114 with
REQ-MCP-042 — it was recorded `connected` until 2026-10-03,
`docs/defects/fixed/an-mcp-server-whose-tool-discovery-failed-reads-as-connected.md`), which a child's execution records on its row before its first
model step (`ChildLedger.recordGrant` → `SessionWriter.recordChildGrant`; REQ-MCP-065 with REQ-TOOLS-006) — started beside
the first turn, never ahead of it, so the payload reaches the conversation record while readiness is pending. Until
2026-10-01 the spawn recorded the persona's declared tools and its MCP surface before any control instead
(`docs/defects/fixed/a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`). Under `restricted` or `read_only` the MCP
tools are withheld from the surface (ADR-0016's reading), and while the plan gate holds every server executor is withheld by identity — `withheldUnderPlanGate(name, false)` — rather than by the registry's answer for its name, which a server's tool offered under a free public name such as `read_file` would otherwise borrow (REQ-ORCH-153; the gate refuses the same call on dispatch through its `publicTool` predicate and the port's withheld set). The prompt section and the grant are drawn from the surface narrowed to the tools that joined the callable map, so a tool withheld at the plan gate or dropped for colliding with a native name is neither printed nor granted (REQ-MCP-062; until 2026-10-01 the section was rendered from the unnarrowed surface and printed it). A port's readiness resolves once, under the hold it was built with; approval launches a new run, whose ports are built with the gate released. The session's connections open on first demand under a keyed
single-flight (one process per server per session, shared by every child), a per-call failure is that call's (no retry,
no reconnect; the next call re-establishes; one `mcp_config` warning per server per session), a `tools/list_changed`
recomputes and only narrows (the executor deleted, the prompt untouched). **Their lifetime:** the connections of a
session live until the session's lock is released, which today is the run host's shutdown (`McpHost.closeAll`, after
`Sessions.closeAll`; the discovery children are killed first so no outstanding discovery delays the exit). **Who the
client says it is:** every handshake on all three paths names `rotaris` at the product version the run host read from
the application manifest (`McpHost`'s `productVersion`, required as `clientVersion` by `ToolDiscovery`, `HealthProbe`,
`SessionConnections` and `openClient`), never a literal (REQ-STARTUP-158; a literal `0.1.0` until 2026-09-27).

**Code intelligence (Part T; ADR-0035).** The shipped `code_intelligence` entry is **enabled** (REQ-CONFIG-181; the
2026-09-05 deviation reverted, its record kept in `config/src/mcp/defaults.ts`), so every run whose persona carries it —
twelve of the thirteen built-in roles — starts one runtime per session through the token. Its arguments come from the
generated manifest (`start-mcp-server`, the transport and the host-integration context); REQ-MCP-034 appends
`--project <root>` at command resolution for the workspace the configuration was loaded for, and a run whose execution
root is a worktree is handed the view bound to that tree's root instead (`configurationForExecutionRoot` in
`run-host/mcp.ts`, read by the tool port's `ready()` and by `session.start`'s discovery ahead of the run, both memoised on
the execution root). Since `PD-MCP-002` (OQ-194, 2026-10-06) the same view moves every root the load filled in for every
stdio server — REQ-MCP-035's filesystem fill-in and REQ-MCP-043/050's default `cwd` beside the project path — and the
tool port hands `McpHost.executorsFor` the execution root, which `SessionConnections.connect` passes to REQ-MCP-070's
`lsp_init`; until then those three stayed the workspace's (OQ-194's literal reading, superseded by its ruling). Until
2026-10-03 the isolated run's server was bound to the anchoring checkout (ADR-0034, "The isolated-run binding, executed").
The discovery and connected lines name the project the launch carried (`… (project <root>) listed …`, `…, project <root>)`);
the grant is the persona's tier union from the manifest (12 or
19 names; REQ-MCP-014/015). The usage-instruction tool is described in the product's words, which the manifest carries
by capability (`productDescriptions`, `PD-MCP-001`, OQ-115): `filterServerTools` puts them on the bundled server's tool,
so the prompt section and the tool definition the model is handed both read them, and the runtime's own imperative
("call this tool immediately") reaches no prompt. Since `PD-MCP-004` (OQ-273, 2026-10-13) the MCP executor sends the bundled
server's referencing-symbol search for the same `name_path` and `relative_path` before every symbol rename it forwards, by the
name the server reports (so a `tool_name_map` rename is warmed and another server's same-named tool is not), and discards the
answer: the pinned runtime answered a rename before its language server had loaded the project and renamed the declaring file
alone. The search helps only where a `tsconfig.json` or `jsconfig.json` covers the files; in a workspace with neither (a plain
JavaScript project, the live run's `todo-app`) the language server holds the open files alone, the search answered nothing and
the rename changed the declaring file only (fin47, 2026-10-15). So since `PD-MCP-004` revision 2 (OQ-362, ruled 2026-10-20),
clause 5, a rename whose declaring file the runtime serves with its TypeScript language (the manifest's `projectFiles`, read
through `codeIntelligenceProjectFile`) and which no `tsconfig.json` or `jsconfig.json` covers — in its directory or any up to
the executor's root, none above — gets a `jsconfig.json` of the product's own at that root (`CODE_INTELLIGENCE_PROJECT_FILE_BYTES`:
one comment line naming Rotaris, then `{}`), created exclusively after `connect` and before the search, and removed in the
call's `finally`, before the reach observation looks again, only while its bytes are still the product's. A per-root count on
`McpHost` (process-wide, every session's executors) lets overlapping renames share one file; a file with the product's bytes
that no rename keeps is adopted by the next rename and removed at each run start at the root (`prepare`, outside its memo).
Each placement and removal is noted in OQ-245's write journal under a name no agent bears, so no observation lists the file,
and written to the application log at `info`; nothing else records it. The pairing and the shared argument names are the manifest's `warmUps`, read through `codeIntelligenceWarmUp`; the
search is sent under the run's signal and the rename's one REQ-MCP-003 allowance, measured from the call's start, so the rename
gets what the search left. A search that spends the allowance is the rename's timeout and a cancel during it is `interrupted`,
neither sending the rename; any other failure is one `warn` line and the rename goes ahead. It is no tool call: no gate, no
record, no total, no notice — sent quietly, so a transport it loses raises no REQ-MCP-069 unreachable notice (the rename, sent
next, is the call that may; fin44). On connection the binding probe calls the memory-listing tool once under 15 s
(REQ-MCP-071; a failure warns through REQ-MCP-044 and withholds nothing); the prompt's `## MCP servers` entry for the
server carries the fixed project-memories block iff both gating names are granted (REQ-MCP-102). Measured cold: the
runtime answers `tools/list` about 4 s after launch, connect about 4.2 s; the first symbol tool on a language provisions
that language's server (minutes; IC-7 adopted under ESC-32 — a declared package at its declared version, disclosed on the
MCP category before any run can trigger it, `REQ-MCP-118`), warm afterwards. **The project setup** (`McpHost.startSetup`): the invocation
derived from the entry (REQ-MCP-036 — a remote or launch-less entry is the non-retryable "not a local launch",
answered as a finished status whose outcome is `unavailable`, not as a refusal; the one refusal `startSetup` makes is
a second run while one is running), the contains-code walk once (breadth-first from the root, VCS directories skipped, the root `.gitignore`
honoured in git's order, a directory re-included under an ignored glob walked, dot-directories walked, no symlink followed, first indexable file stops it), the marker
(`.serena/project.yml`) skipping creation, then the three steps in order with the closed status vocabulary; one run at
a time, re-runnable, cancellable; the status held in the run host for the application's life, never on disk.

**The manual arm (Part AO — REQ-CHAT-078..081, REQ-MONITOR-090..097; `run/conversations.ts`).** `runTurn` registers its `Conversation` on the run's `ConversationRegistry` for exactly the span of the turn — the handle carries the agent's name and one operation, compress now through this agent's own `CompressionRunner` — and unregisters on every exit, so a handle never outlives its turn. `Run.forceCompression()` compresses every registered conversation at once and settles once all have; a manual pass replaces the array under whatever call is in flight (the swap rule above) and marks the history condensed so the next count falls back to the estimate until the next step reports a real prompt figure, exactly as an automatic pass does. `REQ-MONITOR-085`'s live field became a map, because several agents compress at once and one name could not say so; the record names them all, comma-joined, from the earliest start. §5 has the control's row.
