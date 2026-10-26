# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline — First execution — 2026-09-05, Part S (the three paths, the pipeline, the sink; ADR-0033 beside it)

Part 7 of 7 of [ADR-0034](../0034-mcp-connections-and-configuration-resolution.md), which indexes every part.

## First execution — 2026-09-05, Part S (the three paths, the pipeline, the sink; ADR-0033 beside it)

*Recorded under GD-10; the proof is `pnpm mcp-proof` (nine launches, `.mcp-proof/results.json`).*

**Built and run.** The three connection paths over ADR-0033's one factory (`packages/mcp/src/`): `ToolDiscovery`
(memoised per process on the nine-value identity of `identity.ts`, `invalidate()` on a load, the 30 s timeout and
the 35 s outer watchdog on the Timers port — measured at 35,005 ms in the ninth launch, the application exiting
1.4 s after the user's quit; a teardown error after the list is debug only); `HealthProbe` (own connection every
call, 8 s budget, two probes contacted the fixture twice — the pid file counted two launches); `SessionConnections`
(the keyed single-flight — two concurrent first demands, one promise, one process; three interleaved calls each
answered; the shutdown latch; idempotent `closeAll()`; the connect-time list kept beside the current one). The
pipeline (`packages/config/src/mcp/`): entry schema, discovery files, merge with the origin map, command
resolution, availability, environment and secrets, persona resolution, the normalised description, the prompt
section — every stage `{ value, diagnostics }`, every diagnostic a value with severity, key and scope, ONE sink
(`DiagnosticSink` applying the scopes; `McpHost.deliver` in the run host fanning out to the log, the 8 s notice and
the `mcp_config` issue). Grants stay `undefined` versus `[]` through the whole pipeline; every ordering goes
through `compareCodePoints` (moved to `@rotaris/kernel` so `config` and `mcp` share it — the component view
already allowed both edges), and `order.test.ts` refuses `localeCompare`/`Intl.Collator` in both places.

**The placement reading — consequence 3 falsified and kept.** This decision's placement paragraph has the
settings surface instantiate the discovery and probe paths "in its own process", and consequence 3 accepts that
"two processes may hold different tool lists for one server, and that is correct behaviour rather than a bug".
That was written against `REQ-MCP-047` as it read on 2026-08-31; the requirement now says the memory "is the
whole application's: every window and every run observes the same tool list … and there is no second holder of
a tool list anywhere". The reading taken: **every path lives in the run host** (`apps/desktop/src/run-host/mcp.ts`,
`McpHost`), the one process that lives for the application's life and owns every session; the settings category
asks it over `mcp.list` / `mcp.probe` / `mcp.setEnabled` / `mcp.secrets` (main relays). The library still has no
Electron import and no process assumption — that half of the placement holds and is what made the choice free.
Consequence 3 is falsified as written and is kept above beside this note; consequence 2 (a server running twice
at once, once for a session and once transiently for a probe or a discovery) still holds and the proof's pid
files show it (one discovery launch plus one session launch per server).

**OQ-22's reading — overlay on the parent environment, flagged for the owner** (recorded under OQ-22):
`resolveServerEnvironment` produces `REQ-MCP-090`'s map (full-value `${VAR}` expansion, unset → the key omitted,
secrets last) and the child inherits the run host's environment with that map overlaid. No scrubbing of the parent
environment is applied; which names to scrub is the owner's *(ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): none, the overlay ratified as built, OQ-22)*. **Falsified at the merge and kept (the manager,
2026-09-05):** this paragraph first read "the run host hands the child `{ ...process.env, ...map }`" — the code handed
the child the map ALONE (`transportFor` spawned with the description's `env`), so the shipped `browser` entry's `npx`
had no PATH and the settings PNG still read `spawn npx ENOENT` after the twenty-ninth's wrap; the unit test had masked
it by passing a full environment as the description's map. The overlay now lives at the transport (`parentEnv` on
`OwnedStdioSpec`, threaded through `openClient` and the three paths from `McpHostDeps.parentEnv`, the run host's own
environment), and never enters the nine-value identity, which is the configured map's. The test's description map is
empty now.

**Readings where the record was silent, recorded here (each in the code beside its rule):**

- *Name collisions across servers.* `REQ-MCP-069` aggregates every server's tools into one callable surface and
  `REQ-MCP-101` prints names per server, but nothing says what happens when two servers — or a server and a native
  tool — report the same name (the proof's first run: three fixtures all reporting `echo`, five names refused as
  "collides with a native tool"). The reading: a colliding name is offered under the client-side prefix `<server>_`
  that `REQ-MCP-057` already anticipates (so grants and denials written against the reported name still match),
  **only on collision**, in code-point order of the servers, so the printed name and the callable name stay one
  (`REQ-MCP-062`). `persona.ts`, `reservedNames`. ~~The recorded evidence (`granted_mcp`) is computed without the
  native names (the persona resolver's surface at spawn), so a name a native tool shadows appears unprefixed there
  and prefixed in the port; stated, not hidden.~~ *Corrected 2026-10-01:* that was true until then, and is no longer.
  The spawn records no evidence; the recorded evidence is the port's grant (`ToolPort.grant`, drawn by the run host's
  `grantEvidence`), written on the child's row once the port is ready, from the port's own surface — the one resolved
  with its native names reserved and narrowed to the tools that joined the callable map. A name a native tool shadows
  is therefore recorded under its prefixed callable name, as the port offers it, and a tool the controls withheld is
  not recorded at all (`docs/defects/fixed/a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`).
- *The mask.* `REQ-MCP-081` says the mask "carries no character of the value … and no indication of that value's
  length"; `REQ-TOOLS-171`'s display mask (`ab****yz`) carries four characters and a length band. The rendering
  of a stored secret uses `REQ-TOOLS-171`'s **marker** `***` (`REDACTION_MARK`), which is the one of the two the
  MCP requirement describes. ADR-0007 groups `REQ-MCP-081` under the display mask; that grouping is contradicted by
  the requirement's own text and the marker was chosen. For the owner to confirm.
- *The `enabled: false` deviation (the owner's decision of 2026-09-05).* `REQ-CONFIG-181` and `REQ-MCP-010` make
  `code_intelligence` the one default enabled by default; it ships `enabled: false` until ADR-0035 executes,
  because the reserved token resolves to nothing launchable today and an enabled entry would put a permanent
  discovery failure into every run. Recorded in `packages/config/src/mcp/defaults.ts` beside the entry; revert to
  `true` with the manifest.
- *When the memo is invalidated.* `REQ-MCP-047`: a reload interrogates afresh. Every run start loads the
  configuration twice within milliseconds (`session.start` resolves it before the lease and `Sessions.start` again),
  so `McpHost.newConfiguration` invalidates when the merged servers' fingerprint changed **or any memoised discovery
  had failed** — the requirement's own purpose ("a server that failed before the reload but answers after it
  produces no further warning") holds, and an identical reload keeps a healthy memo.
- *The empty state of the category (`REQ-CONFIG-350`)* is present in `McpSettings.tsx` and unreachable with the
  shipped defaults: three entries always exist and nothing removes them. Stated.
- *Session end.* `REQ-MCP-066` closes at session-lock release and at exit. The engine releases session locks only
  in `Sessions.closeAll()` (shutdown) today, so the session connections live until exit; a child ending leaves them
  open as `REQ-MCP-068` requires. When a per-session release exists, `McpHost.closeSession` is the call.
- *Discovery ahead of the first port.* A tool port is created synchronously; discovery is not. The run start kicks
  discovery off for every carried, launchable server (`McpHost.prepare`), and the engine's turn awaits the port's
  new optional `ready()` before it reads the listing and the prompt section (`ToolPort.ready`/`promptSection`,
  `run/turn.ts` — the one engine change beyond the ledger line). One resolution (`surfaceFor`, memoised on the
  versions of its inputs) feeds the executors, the model's listing, the prompt section and ~~the spawn evidence~~ —
  *corrected 2026-10-01:* the port's grant (`ToolPort.grant` / `grantEvidence`), recorded on a child's row once the port
  is ready. The spawn evidence was a second resolution with no names reserved (`McpHost.evidenceFor`, removed then;
  `docs/defects/fixed/a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`).

**Found in existing code (the tally's twenty-ninth).** *ADR-0033's transport on Windows:* `spawnChild` starts a
command by bare name; `npx` and `uvx` on Windows are `npx.cmd`/`uvx.cmd`, which `spawn` cannot start by name and —
since Node's CVE-2024-27980 hardening — refuses to start without a shell even by full path. The shipped `browser`
default (`npx -y @playwright/mcp@0.0.80 --headless`) could therefore never start on Windows, the one platform the
product builds for, and `REQ-MCP-113`'s "a stdio server launched by the desktop application SHALL start" was
false for every package-runner entry; the probe reported "spawn npx ENOENT" (the settings launch's PNG, first
run). The falsified reason — that one spawn helper with `windowsHide` was enough for every launch — is kept in
`packages/platform/src/spawn.ts` beside `windowsLaunchOf`: a command whose PATH resolution ends in `.cmd`/`.bat`
is launched through `cmd.exe /d /s /c "<quoted line>"` with the arguments verbatim, the way ADR-0015's hook
children already reach the interpreter; `findExecutable` is the one PATH lookup every surface uses
(`REQ-MCP-037`). Recorded in ADR-0033's note as well; the tally is the manager's.

**What the proof measured** (`.mcp-proof/results.json`): discovery per fixture 389–424 ms; first call after
connect 101 ms; one session process for three children (pid 15116, two launches: one discovery, one session); the
narrowing withdrawn once and the prompt rendered once; the crash's one warning issue and two connections; the drop
rules' five fates recorded on the child's row; the toggle's wording and the relaunch without it; the category's
health texts, the `***` mask, the scope, the expected-keys hint; both YAML defects in one refusal and the same two
dropped from the discovery file; the 35 s bound at 35,005 ms and the exit 1,437 ms after the quit.

**Not built, said so:** the write side of secrets (`REQ-MCP-084/110/111`); ADR-0035 entirely (the token's launch,
the manifest, `REQ-MCP-011/015/016(check)/034(binding, inert)/036/071/095/096/099/102/112/116`, the grant tiers);
the palette entry (`REQ-MCP-108`'s `REQ-SHELL-048` half); `web_search` and `browser` exercised live; a real
third-party server; `REQ-MCP-070` against the fixture named `lsp` only.

**The owed halves, alive — 2026-09-06, Part T (ADR-0035's first execution; its note holds the measurements).** The
`enabled: false` deviation above is **reverted**: `code_intelligence` ships enabled, the record kept beside the entry in
`config/src/mcp/defaults.ts`. The binding probe of `REQ-MCP-071` ran for the first time — the manifest's memory-listing
tool, once per connection, 15 s, `hook code_intelligence:ok` in the proof's connected line; its failure path now reaches
the sink through `SessionDeps.probeFailed` (a warning, both channels, nothing withheld). `REQ-MCP-034`'s binding is live
on the manifest's launch subcommand (the pipeline binds by default; `binding: null` is a test's affordance),
`REQ-MCP-036`'s derivation and `REQ-MCP-102`'s block are in `config/src/mcp/code-intelligence.ts` and `prompt.ts`, and
the grant tiers of `REQ-MCP-014` are on the built-in personas' `mcp_tools`. **A real third-party server** was exercised
for the first time — Serena, twice per run as consequence 2 says (one discovery launch, one session launch; two launch
lines in the proof's log). **A gap surfaced by the binding coming alive, stated, not fixed:** the MCP configuration is
resolved per *workspace* (`configureRun(workspaceRoot)`), so the path REQ-MCP-034 appends is the workspace root even for
a run in an isolated working tree, where the requirement wants the tree's root; nothing exercised it (no proof starts an
isolated session through this path) and it is owed to whoever next touches the isolated-run start.

**The isolated-run binding, executed — 2026-10-03 (fin12; the gap above, kept as stated).** The gap was real and it reached
the user before anyone touched the isolated-run start: the orchestrator's default live run at origin/main 1763f7f had a
Requirements board run confined to its worktree whose `get_diagnostics_for_file` answered from the main checkout — the edit
scenario's uncommitted `clearCompleted`, not the `completedCount` just written in the tree — and three agents read the
answer and saved two false explanations into project memory
([note](../../../defects/fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md)). The
reading "resolved per workspace" held; what it implied was that the tool port handed `configured(ctx.workspaceRoot).cfg` and
the anchoring root to `prepare`, `surfaceFor` and `executorsFor`, and `session.start` ran discovery the same way, while the
port's context already carried the worktree as `effectiveRoot`. **The repair keeps the load per workspace and binds at the
hand-off:** `mcpConfigurationForExecutionRoot` (`config/src/mcp/index.ts`) gives a run whose execution root is a worktree the
view in which every server REQ-MCP-034's stage bound — its configured arguments carry neither selection option, its resolved
ones the launch subcommand and, last, the project-path option and the workspace root — carries the tree's root, in the
resolved arguments and the description launch and discovery read (REQ-MCP-050); a configured selection, every other server,
`cwd` and REQ-MCP-035's fill-in are untouched (OQ-194 asks whether those should follow). The run host's
`configurationForExecutionRoot` is read by the port's `ready()` and by the discovery ahead of the run, both memoised on the
execution root, and the discovery and connected lines now name the project the launched description carried, since the
transport's launch line is written at debug. Every isolated run takes the same path — the start-session dialog's worktree
and the board's unit trees alike reach the port as `effectiveRoot`, a continuation through the session row's binding. **What
the first execution found beyond the gap:** against the pinned runtime, a linked worktree holds no marker (its directory is
excluded, OQ-161's reading, and so never checked out); the runtime's first launch against the tree generates the tree's own
project (named after its directory) and registers it in the runtime's home, answers from the tree and never falls back to the
main checkout; the binding probe and REQ-MCP-102's block read that project, whose memories are the tree's own and not the
anchoring project's (OQ-195). Shown by `injection-proof`'s isolated launch, red on a build without the repair ("not every
launch named <the worktree> — discovery: <the workspace>") and green after it, and by the live run's requirements check,
which now reads the binding the run launched with as well as the session's worktree record.

**The isolated-run binding, extended — 2026-10-06 (fin21; `PD-MCP-002`, the owner's ruling of OQ-194 under R-071; the
paragraph above kept as stated).** Its "`cwd` and REQ-MCP-035's fill-in are untouched" no longer holds: the same view now
moves every root the load filled in, for every stdio server, read as exactly as the project path is — REQ-MCP-035's fill-in
where the resolved arguments after a filesystem package are the workspace root alone and the configured ones did not name it,
and REQ-MCP-043/050's default `cwd` where the entry configures none (which also moves a runtime launched with the
project-from-working-directory option). The tool port hands `executorsFor` the execution root, and `SessionConnections.connect`
passes it to REQ-MCP-070's `lsp_init` for the connection it establishes; a connection is still the session's, so a later demand
from another root reuses it. Shown by unit cases in `config/src/mcp/mcp.test.ts`, `mcp/src/mcp.test.ts` and
`run-host/tools.test.ts`, and by `injection-proof`'s isolated launch, which now carries two fixture servers a user might add —
one taking the filesystem fill-in, one named `lsp` — and reads the root each was handed.

**Launches 6 and 7 driven — 2026-09-28, R-062.** The proof's toggle launch (REQ-MCP-115) and its Settings launch
(REQ-MCP-054) are now driven through `scripts/lib/driver.mjs`: every click, choice and read waits for its condition
instead of firing at an offset from the window's load. On a loaded Linux host the offsets had produced two
REQ-MCP-115 reds the product had not earned, a toggle clicked before its row was drawn and a relaunch row probed
before it was drawn ([note](../../../defects/fixed/mcp-proofs-drop-rules-launch-clicks-at-a-fixed-offset.md)). The
assertions are unchanged. Three runs in a row as root under Xvfb all passed every launch that applies on Linux; the
`.cmd` runner check is stated not applicable off win32, as before. **Found nothing new about the mechanism:** the
override's wording, its absence after a relaunch, the five fates, the granted set, the two contacts per two probes,
the mask and the scope all read as the first execution recorded them. The steps finished in about 10 s (launch 6) and
3 to 5 s (launch 7), against the 14 s and 19 s the offsets had reserved. **Could not show:** the loaded-host red itself
on demand, and anything on Windows (IC-3 — *corrected 2026-10-14: a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).

*On Windows, 2026-10-21 (the Windows ARM64 session's F1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, built at `af692eea`).* `pnpm mcp-proof --skip-build` ran whole twice on an idle host, every launch, exit 0 (about 3 minutes each). Launch 6: the override's wording "Overridden for this session — not persistent." appeared and was gone after the relaunch, the fates were `connected`, `disabled` (two), `unavailable`, `not-configured` and `discovery-failed`, and the inspector drew `broken` as dropped — discovery-failed. Launch 7: no "not applicable" (the `.cmd` runner check applies and reads healthy), `browser` healthy through `runner.cmd`, two contacts per server for two probes, the mask `***`, the scope Global and `ALPHA_KEY:yes`, `FROM_SHELL:no`. Launch 9: discovery 35.0 s, the quit at 40 s, exit 1.08 to 1.13 s after it. A sampler took `cmd`, `node` and `conhost` started during the second run every 250 ms (676 samples, 263 processes): every `MainWindowHandle` was 0, so no server, runner or shell drew a console window. **Found nothing new about the mechanism.** `packages/mcp/src/mcp.test.ts` (22 passed, the `.cmd` runner case among them) and `platform.test.ts`'s PATHEXT case ran on the same host.

**The sink's severities gain `debug` — 2026-09-29, R-067 (acceptance finding A41).** "Every diagnostic is a value
carrying its severity" held, and the severities stopped at `info`: `DiagnosticSeverity` was `info | warning | error`, and
`McpHost.deliver` wrote `info` at `info` and everything else at `warn`. REQ-MCP-059 calls its grant count "a debug log",
so it could only be written at `info`, which PD-MONITOR-002's default threshold keeps in every packaged build — on every
persona's first spawn whose `mcp_tools` narrows a server. `DiagnosticSeverity` now carries `debug` (`debug(…)` in
`packages/config/src/mcp/diagnostics.ts`, a log-only diagnostic), the grant count is built with it in
`resolvePersonaMcp`, and the sink writes it at `debug`, so the default threshold drops it and `ROTARIS_APP_LOG_LEVEL=debug`
restores it. No other diagnostic changed level. Pinned by "REQ-MCP-059 (A41): …" in `config/src/mcp/mcp.test.ts` and
"REQ-MCP-059, PD-MONITOR-002 (A41): …" in `run-host/mcp.test.ts`, both red on the unrepaired code
([note](../../../defects/fixed/the-mcp-grant-count-is-logged-at-info-not-debug.md)).
*On Windows, 2026-10-21 (the Windows ARM64 session's F1; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, built at `af692eea`):* every mcp-proof launch whose configuration narrows `beta` wrote "persona orchestrator: 2 of 5 tools granted on server 'beta' (REQ-MCP-059)" at `debug` once, beside one "surface for orchestrator" line; launch 6, which narrows nothing, wrote none. Orchestrator is the one persona the proof narrows, so "once per persona" reads once. A scratch launch over a copy of the proof's profile without `ROTARIS_APP_LOG_LEVEL` wrote no grant line and no `debug` line at all (the surface line stayed); the same launch at `debug` wrote the grant line again.

**A sixth fate in launch 6 — 2026-10-03 (fin13; the counts above kept as they were measured).** "The five fates" above
is what launch 6 recorded until 2026-10-03. Since then it also declares a server `broken` that exits before initialize,
and its child's row records `{ fate: 'dropped', reason: 'discovery-failed' }` (REQ-MCP-114 with REQ-MCP-042), so the
launch records six. Before, `grantEvidence` recorded such a server `connected` with no tool
([note](../../../defects/fixed/an-mcp-server-whose-tool-discovery-failed-reads-as-connected.md)).
