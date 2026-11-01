# Process view — five processes and what crosses each boundary — Message families (continued)

Part 4 of 8 of [the process view](../02-process-view.md), which indexes every part.

**The improvement artifact store (ADR-0061; REQ-LIBRARY-002/036/042..058).** Main → workspace service:
`improvements.command {workspaceRoot, command}` → `improvements.result {value, changed?}`. The command union carries
list, detail, history, approved-proposal, collected-save, review, edit, delete, run preparation, applied-checkpoint,
rollback-preview and rollback operations. The workspace service
constructs `ImprovementReader` from its writable store handle and `ImprovementWriter` from that reader plus the
mutation path, runs the legacy import on first construction, and remains the sole process with the write capability.
Session creation crosses `runType` to the run host; existing callers default to `task_run`, and the session row keeps
the first value across resume.

**Reviewed improvement execution and rollback (REQ-LIBRARY-059..078/169..176).** Renderer → main:
`improvements.start {artifactId}` prepares the approved-only todo, applies approved verifier blocks through the shared
configuration writer, records or reuses the dedicated `pre_improvement` checkpoint, then starts a normal run-host
session with `runType: improvement_run` and `initialTodo`. A terminal result asks the workspace service to record the
`applied` checkpoint. `improvements.rollbackPreview {artifactId}` is read-only and returns sorted path actions plus any
post-run work at risk; `improvements.rollback {artifactId, force}` first records `pre_rollback`, restores through Git,
and records proposal reversal through the improvement writer. Improvement refs live under
`refs/rotaris/improvements/<artifactId>/<sequence>` with independent retention. Every successful mutation bumps the
`improvement-artifacts` library revision, while main publishes the persistent start, refusal, success, or discrepancy
notice. Export is assembled from the same current records and retained history and written only after the desktop file
chooser returns a destination.

**The transcript's row renderer and the one command it needed (Part AA; ADR-0051's second execution).** Renderer →
main: **`shell.openExternal {url}`** → `{url}` | a refusal. `REQ-CHAT-076` opens an `http(s)` link from transcript text
in the **system browser**; the renderer is sandboxed and never navigates (ADR-0051), so a link is an element that asks
for this command, and it is a command with an OUTCOME rather than a fire-and-forget message because the requirement
makes the opening acknowledged and the failure reported. **Main checks the scheme and nothing else does**: transcript
text is model-authored, so anything that is not `http:` or `https:` — a `file:`, a `javascript:`, a shell-registered
scheme — is refused with the target named (`link.scheme`), and an unparseable target with `link.unreadable`. No new
channel and no run-host hop: main answers it itself, as it answers `theme.set`. **Every surface that renders Markdown asks
for it through the window's one `openLink`** (`renderer/shell.ts`): the transcript, the persona window, and since
2026-10-13 the artifact inspector's Preview in the Library and in a persona window, whose two mounts had passed no
opener, so `Markdown` drew each link disabled. Verification seams (under
`ROTARIS_CAPTURE_PNG` only): `ROTARIS_CAPTURE_OPEN_EXTERNAL=record|fail` records or refuses instead of launching a
browser; `ROTARIS_CAPTURE_NET=1` logs every request the window's session issues, which is how `REQ-CHAT-056`'s "no
image is ever loaded" is measured from **main** rather than from the page; `ROTARIS_CAPTURE_DRAG_AT="selector@ms"`
performs a real pointer selection across an element and logs what was selected (`REQ-CHAT-075`); `ROTARIS_ROWS_PROOF=1`
loads the renderer in the `rows-proof` role, the row renderer over a fixture array in both surfaces at once.

**The About page's two commands (Part AG).** Renderer → main: **`shell.openThirdPartyLicenses`** → `{path}` | a refusal.
`REQ-SHELL-142`'s notices bundle is a **local file shipped with the build**, so it cannot travel through
`shell.openExternal`, which refuses every scheme but `http(s)` for the reason above; it takes its own command, the
renderer names no path, and main answers `licenses.absent` when the build carries no bundle. Since 2026-10-31 its
`shell.openPath` is bounded at 5 s (`openFile`, `main/open-folder.ts`), so an opener that never answers is `licenses.failed`. Since 2026-09-27
`pnpm notices` produces the asset (below), but only once its validation passes, and `pnpm package` carries it into the
artifact (`first-release-plan.md` §4.4). A package cannot be made without it, except a development package that
`ROTARIS_PACKAGE_WITHOUT_NOTICES=1` asks for. That package, and any source-tree run nobody has written the file for,
takes the absent branch. Main looks for it as `THIRD-PARTY-LICENSES.txt`, the name REQ-STARTUP-141 fixes and the
generator writes; it looked for a lowercase name until that date, which Linux does not forgive. `shell.hello`'s reply
gains three local facts beside the version
— which is the application manifest's, read once per process by `main/version.ts` (through `@rotaris/platform`'s
`installedProductVersion`) from the `package.json` beside the bundle and never `app.getVersion()`, since Electron answers
that with its own version for the unpacked entry (`REQ-STARTUP-007`, `REQ-STARTUP-158`; 2026-09-27) — for `REQ-SHELL-140`'s product card: `build` (the bundled build identifier,
null when the asset is missing or unreadable; `pnpm build-id` writes it, below), `standalone` (`app.isPackaged`) and
`thirdPartyLicenses` (whether a bundle exists). The About page issues no request of its own — `REQ-SHELL-139` requires
zero network requests at render — and the same capture seam (`ROTARIS_CAPTURE_OPEN_EXTERNAL=record|fail`) covers both
openers. **Its network-activity disclosure crosses no boundary** (`REQ-STARTUP-160`, 2026-10-13): three statements held as
constants in the renderer bundle (`NETWORK_DISCLOSURE`, `packages/ui/src/settings/About.tsx`), drawn before `shell.hello`
answers and with every outbound request blocked, naming no host; what they describe is this view's update check and, under
[`PD-STARTUP-006`](../../../product/directives/pd-startup-006.md#pd-startup-006) (OQ-261, ruled 2026-10-13), the first-use fetches: a tool
server's pinned package fetched by its package runner when that server first starts, and a language's server provisioned by
the code-intelligence runtime at that language's first use. First-launch machine setup, cache warm-up and the tool-archive
hosts are not named, since this build carries neither (2026-10-14).

**The requirements board's contracts (Part AK; ADR-0041's first execution).** Renderer → main: `requirements {command}` — ONE envelope member carrying the `name`-discriminated `RequirementsCommand` (`board`, `detail {id}`, `refresh`, `reachable {id, from, to}`, `act {id, action, target?, payload?}`, `operation`, `cancel`, `queue.set`, `source.write`, `source.previewLocation`); main replaces `workspace` with the open root and stamps the `Actor` (REQ-CONFIG-198), a renderer never sends one. Main → workspace service: `requirements.command {workspaceRoot, command, actor, disclosure?}` → `requirements.result {value, changed?}`; `disclosure` (since 2026-10-02) is main's standing disclosure — `due`, `accepted` (accepted, not permanently, earlier in this launch of the application: main holds it in memory, told by the board's `requirements.runs {op: 'accept'}`, and the preview reads it too; 2026-10-02), `suppressed` or `off`, what REQ-TRACE-472's two preferences and the launch's own acceptance make of a launch nobody disclosed — stamped beside the actor by the relay and the run coordinator alike, so the queue the service publishes and the claim it answers read one value (REQ-TRACE-478); a reply to a command whose value moved carries `changed`. Main → renderer: **channel 10 `requirements:changed {v, workspace, generation, affected | null, progress?}`**, broadcast to every window only after a reply carrying `changed` (persist before publish). The workspace service's case takes the one traceability engine `traceability.ts` holds for the process (since the merge of 2026-09-09; it shipped with `ENGINE_NOT_MERGED`).

**The requirements adoption assistant (domain 22, PD-TRACE-001; 2026-10-29).** The board's family gains two members: `requirements.adoption` (the comparison on opening — a read that writes nothing, consults no model and carries no `changed`, REQ-ADOPT-022) and `requirements.adopt {mode: run | record, writeLayout?}` (the strip's button). Both travel the Part AK path — main replaces `workspace` and stamps the actor; the workspace service answers them in `adoption.ts` before the delivery service is reached, and neither moves the generation, so channel 10 is untouched. A **run** needs one model interpretation, and the service cannot reach a model: it asks main on the `ServiceAsk` envelope, **`adoption.interpret {workspaceRoot, detection}`** (the detection result as JSON text, at most 200,000 characters), main forwards it to the run host as the request of the same name (bounded at 195 s, the workspace root replaced with the service's own key), and the host answers **`adoption.interpreted {text, model}`** or `refused` — the text is untrusted and validated by the service (REQ-ADOPT-013) before anything is written. Main's relay bounds `requirements.adopt` at 240 s. Progress uses the board's protocol words (`reading`, `adopting`, `recording`) and comes back collected in the reply; no new channel.

**Runs from the board, the queue and the panes (Part AP; ADR-0041's second execution).** Renderer → main gains ONE command kind: `requirements.runs {op: preview | dispatch | accept | suppress | live, id?, action?, suppressed?}` (`accept`, the plain acceptance main holds for the rest of the launch, since 2026-10-02). Main's run coordinator (`main/requirements-runs.ts`) owns the elevation's two desktop preferences, the session start and the run's lifetime, so a surface asks it for a launch preview, a dispatch, the acceptance for the launch, the permanent suppression and the live board runs — never the service. Main → workspace service: the `requirements.*` family gains a **run half only the system may speak** — `run.preview`, `run.claim`, `run.started`, `run.ended`, `run.abandon`, `run.waiting`, `run.reap`; a person's copy of any of them is refused (REQ-TRACE-392) — and two pane reads, `review {id}` and `blocker {id}`; `queue.set` gains `start`, `hold`, `release` and `disclosure`, and `source.write` / `source.previewLocation` answer for real instead of refusing. Main → run host: for a claim that was disclosed, the coordinator sends `config.liveState {runtime: {permission_mode: autonomous}}`, then the ONE `session.start` bound to the provisioned worktree (`effectiveRoot` and a `WorktreeBinding`), then `config.liveState {}` at once — the elevation is confined to that start (REQ-TRACE-470/471) and the composer's next run reads the restored state. It settles the run row from the host's own `run.result` (REQ-TRACE-477) and marks a run waiting on a person from `publish.snapshot` (REQ-TRACE-466), each against the service of the workspace the run was started for, not the focused window's (since 2026-10-02). A run-host **exit** re-runs the reap with an empty live set (REQ-TRACE-476 under SR-2), and the last window closing ends the board's runs as the application's quit — `session.control {op: 'announceShutdown'}`, so each comes to rest by `quit`, as a session started by hand does (PD-ORCH-005 clauses 3 and 15; `docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`). No new channel and no new process: the board's refreshes ride channel 10 as before, published after the service's committed reply.

**The traceability operations (Part AJ; ADR-0040's first execution).** Main → workspace service: `traceability.operate {workspaceRoot, operation: check | regenerate | baselines | compare, base?}` → `traceability.result {operation, root, elapsedMs, result: {ok, value?, error?}}`; `traceability.cancel {workspaceRoot, operation}` → `traceability.cancelled {cancelled}`. The service discovers the repository root from the workspace root (REQ-TRACE-512); a renderer never nominates one. Progress is logged by phase name in wave 1; channel 10's `progress?` is where it goes. **Since Part AJ′ (2026-09-09)** the renderer reaches the same four operations through the board's family — `requirements {command: operation | cancel}` → `requirements.command` → the delivery service's two arms, which run the injected engine and answer `requirements.result {value: <the traceability.result reply>, changed?}`; a successful check, regeneration or baseline update re-reads the projection and moves the generation (channel 10 follows), a comparison does not. No new message kind, channel or command: the two arms that refused in wave 1 now run. The Settings Project category's traceability card is the surface; the parser (`workspace/src/traceability/parser.ts`) runs inside the sweep on the worker thread and loads `typescript` from `node_modules` at first use.

**The prompt-file commands and the two chat control arms (Part AO).** Main → workspace service: `prompts.roots.read {workspaceRoot}` → `prompts.roots {result: {files[], skipped[]}}` — REQ-CHAT-160's three roots in their order (`<workspace>/.agents/prompts/`, `~/.agents/prompts/`, `<user config dir>/prompts/`), read by the process that reads the user's files; each file crosses ONCE with its stem, its frontmatter `description`/`argument-hint` and its UNEXPANDED body, a malformed or unreadable file as a `skipped` entry with its reason. The naming, the first-root-wins collision rule and REQ-CHAT-161's one-pass expansion are the renderer's (`ui/src/slash/prompts.ts`), because the catalogue that holds the other names lives there; the renderer re-reads on composer focus and on a configuration change, and a read still in flight is the window's answer — a second caller joins it rather than putting a second `prompts.roots.read` on the wire (defect AO-3; the `skills.read` reader beside it joins the same way, where three effects start one). Run host → main: the two control arms (`forceCompression`, `clearTranscript` — armed in Part AO) answer over the existing `control.result` with two OPTIONAL fields beside the boolean, `compression {compressed, unchanged, failed[{agent, reason}]}` and `refusal {code: no_run | no_active_conversations | transcript_busy | clear_failed | run_coming_to_rest | store_failed | session_locked, message}` (`run_coming_to_rest` is PD-ORCH-005's: a compression is a model call, and none follows an accepted pause or stop; the last two are PD-ORCH-005 clause 16's, answered by `cancelAgent` when the cancel of a paused child while its session rests is refused by a store failure — one that requires recovery, a lock that could not be read or taken, or the child's move that could not be written — or by another live process holding the session's lock, whose words the renderer states in place of REQ-MONITOR-128's "not cancellable", OQ-101), and raise what only the run host knows through the existing `acknowledgement.publish` (the count of REQ-CHAT-080, REQ-CHAT-084's "Transcript cleared.") and `notice.publish` ("Context compression incomplete" with the per-agent list as the copyable detail, REQ-MONITOR-094; "Could not clear transcript"). `forceCompression` is the one control the run host AWAITS (`Sessions.controlAsync`): it settles once every live conversation has (REQ-MONITOR-092), so main's `session.control` relay bounds it at 130 s — the pass is bounded by `compressor.timeout_seconds`, 120 s by default — where every other control keeps 10 s.

**The authentication recovery dialog (REQ-NOTIFY-072..075/079/080; the 401 note's part C, 2026-10-02).** Main → run host: `session.authRecovery {sessionId}` → `session.authRecovery {failed, active, models, lastPrompt}` (each model `{key, provider, model}`, and since fin10 `excluded: true` on a pair the session holds out of quota, which the dialog annotates with the reason and still offers, REQ-MONITOR-194; `failed` the model the run's failed root call was addressed to, `Run.failedEntryModel`, or null; `models` every configured model a restart could reach — `Sessions.authRecoveryFacts`) | `refused` (the session not live, a run active, or its configuration not resolving — REQ-NOTIFY-069's "configuration service"); `session.authRestart {sessionId, modelKey | null}` → `session.authRestarted {pinned: {from, to} | null}` | `refused`, after the same continuation lease a `session.prompt` takes (`Sessions.restartAfterAuthFailure`: with a key, the chosen model pinned against the failed pair as a `model_override` timeline entry, and — since 2026-10-02, fin10, REQ-MONITOR-194 — the chosen pair's out-of-quota exclusion cleared as a `model_exhausted` entry carrying `cleared: true`, restored (`restored: true`) if the restart cannot begin; with none — part D's re-authentication — no pin, the lease carrying the key just stored; either way the last prompt re-submitted — since the fourth repair round of parts A and B, the failed run's own launch relaunched, a plan decision's run as that decision, `Sessions.relaunchAfterAuthFailure`). Renderer → main: the recovery window's four commands, above. No channel: the window reads its payload by command, as the pause window does.

**The live terminal (Parts AL and AM; ADR-0021's and ADR-0047's first executions).** Run host → main: `publish.terminal {payload}` — one frame `{v, sessionId, streamId, seq, kind: delta | screen | meta, payload, meta?, closing?}`; main delivers it on **channel 3** to `subscribersOf(sessionId)` through `FrameDeliveryLimiter`, which caps delivery at 1,000 frames/s **across every window taken together** by merging a stream's frames into larger steps, never dropping (REQ-MONITOR-306, REQ-SHELL-103). **Since 2026-09-11 (Part T″, defect T2-1) the sliding second is ONE ledger every window shares** rather than one ledger per window: a frame fanned to two windows spends two of the budget, because REQ-MONITOR-306 counts a stream shown in more than one window "once per window … the cost this bound exists to control is paid per delivery". The drain goes round the windows one segment at a time, so a window saturating on forty streams cannot starve the window beside it of the second they share. Renderer → main → run host: `terminal.streams {sessionId}` → `terminal.streams {streams}`; `terminal.sendKeys {streamId, keys: EncodedKey[]}`, `terminal.resize {streamId, cols, rows}`, `terminal.interrupt`, `terminal.endInput`, `terminal.kill`, `terminal.audit {streamId, entry}` — each answered with a refusal from the closed set `ended | unknown-stream | no-kill-capability | streaming-disabled` when it cannot act. `terminal.kill` on an agent's `fg:` stream is the session's reset in the run host (REQ-SHELL-092, the reset of REQ-TOOLS-099): the process tree behind the command goes, the shell restarts, and the killed call re-applies PD-TOOLS-001's snapshot of the directory and the exported variables before it returns, its detail naming the loss and the restore (since 2026-10-20; before, the kill was the one reset path that restored nothing). The same kill reaches a soft-paused command, which is still the command the terminal runs though no call waits on it: the same reset ends it and its tree, PD-TOOLS-001's restore starts at once and the session's queue holds the next call until it has answered, and the agent's next poll or call reports the kill, the loss and the restore (REQ-TOOLS-098, OQ-164's report of an earlier command); a call that was waiting behind it reports it so too, and as never having run itself, with no exit code (since 2026-10-21). A kill that terminates nothing — the command had ended and no paused one stood in its place — answers `ended`, never ok: a control's `kill` answers false for it (since 2026-10-20; before, the foreground control dropped that answer, and a kill of a paused command did nothing and answered ok). When such a stream ends is [OQ-370](../../../archive/architecture/open-questions/67-spikes-and-later-questions-34.md#oq-370). The commands discriminate on `kind` like every other member of the union. Streams are `fg:<agentName>` (scoped by the frame's `sessionId`) and `bg:<id>`; the transcript row's `streamId` is a display field the projection owner publishes while a foreground command runs and never records. In each renderer the frames are applied at one subscription point (`TerminalStreamSet`); from the moment the parser reaches a `screen` frame's reset until the frame's text has parsed, the previews it hands the transcript row and the persona card read the screen that reset replaced (before the reset they read the emulator as it parses), and the point notifies its listeners a second time (`parsed`) once the text has parsed (since 2026-10-02, fin7: a closing frame's reset had blanked a preview).

**MCP (Part S; ADR-0033/0034's first execution).** Renderer → main: `mcp.list` (every configured server: name, type, the
masked line, origin, enabled, overridden, available, unresolved placeholders, expected env keys), `mcp.probe {name?}` (one
server per request so the category probes sequentially under main's bound), `mcp.setEnabled {name, enabled}` (the session
override, REQ-MCP-094; never on disk), `mcp.secrets {server?}` (the read side: server, key, the `***` mask, scope). Main
relays each to the run host as `mcp.list {workspaceId}` → `mcp.list {listing}`, `mcp.probe {workspaceId, name?}` →
`mcp.probe {results}`, `mcp.setEnabled` → `ack`, `mcp.secrets {workspaceId, server?}` → `mcp.secrets {view}`. The run
host's `notice.publish` event gains `ttlMs` (REQ-MCP-044's 8 s auto-dismiss on the one notice slot).

**Confinement (Part AR; ADR-0022's first execution).** Renderer → main: `confinement.status {recheck?}`; main relays it
to the run host unchanged and answers with `{available, backend, reason, remediation}` — REQ-SANDBOX-071's four fields,
which every surface presents as the same text. **No workspace is required**: whether this HOST can confine anything is a
property of the machine, and REQ-SANDBOX-130's disclosure is owed on the settings surface before any workspace question
is settled. The verdict lives in the **run host** and nowhere else, because that is the process that executes commands —
the verdict that gates a session and the mechanism that would confine its commands are then one reading, and no message
between processes can land between them (REQ-SANDBOX-094). One probe per process, cached for the life of the
application, cleared only by `recheck: true` (REQ-SANDBOX-067, REQ-SANDBOX-129); bounded at 5.0 s and never retried
(REQ-SANDBOX-069), so no surface blocks on it. The run host writes the verdict's own text to the application log once,
on whichever path settles it first — the settings read or a launch.

**The MCP child
processes** live under the run host: one per stdio server per session (`SessionConnections`), one transient per discovery
or probe, all through `OwnedStdioTransport` (three piped streams, hidden window, `.cmd`/`.bat` runners through
`cmd.exe`), killed by `terminateTree` (terminate, 5 s, force, the tree). On Windows, since 2026-10-16 (R-074), closing stdin supplies the graceful EOF; the runner is kept alive until its server exits or `taskkill /T /F` ends the intact tree at the grace bound. Killing the runner first left its server holding the working directory after close returned. A child's stderr reaches the log redacted and
at **debug** — its diagnostics are its own, and a real server writes them by the dozen per connection — while
`REQ-MCP-107`'s tail keeps every line for the failure account. **Since 2026-09-27 debug is a filter as well as a
label** (`PD-MONITOR-002`, the ruling of OQ-63): the application log records `info` and above unless
`ROTARIS_APP_LOG_LEVEL` restores `debug`, so those lines — 141 in one measured launch before the directive — are not
written by default. The application log paragraph under [Message families](02-message-families.md#message-families) says where the
threshold lives. The fixture server the proof and the tests speak
to is `apps/desktop/scripts/fixtures/mcp-fixture-server.mjs`. The scripted client's step `mcp:<server>.<tool>` calls an
MCP tool by its callable name; `ROTARIS_CAPTURE_PROMPT_MS` delays the typed prompt (verification only).

**The bundled code-intelligence runtime (Part T; ADR-0035's first execution).** A `stdio` entry whose command is the
reserved token `builtin:code-intelligence` launches **the application's own executable** with the token first and `--`
second (`Rotaris.exe builtin:code-intelligence -- start-mcp-server --transport stdio --context ide --project <root>`;
in development `electron.exe out/main/index.js` before them; **since 2026-09-28 the one Chromium switch the parent was
started with, `--no-sandbox`, stands between the token and `--`** — the token stays the first argument (REQ-MCP-033);
the child is a fresh Chromium and died with SIGTRAP before its sentinel ran when the parent ran as root without handing
it over; `@rotaris/platform`'s `chromium-switches.ts` is the definition, main forks the run host with the switch so
`run-host/code-intelligence-launch.ts` can read it off its own argv, and the sentinel drops it before the separator so
the runtime never receives it — OQ-82's reading, confirmed 2026-10-06 by R-071; the first build that day put it in front of the token, superseded):
that process is a **sixth process shape**, the
**sentinel** — Electron's main entry whose first module (`main/sentinel.ts`) sees the token, resolves the bundled
interpreter under `process.resourcesPath/code-intelligence/runtime/` (the source tree's `apps/desktop/resources/` in
development), seeds the runtime's per-user home once (`<data>/code-intelligence/`, its interface off), and runs the
runtime **synchronously with the parent's own pipes** (`stdio: 'inherit'`), exiting with the runtime's status — no
window, no instance claim, no store, nothing of main's body evaluated. Under it the runtime (`python.exe`) and, at
first use of a language, the language server it provisions (`npm`/`uvx` children; IC-7, adopted under ESC-32 — the packages declared
in the binding manifest and disclosed on the MCP category, `REQ-MCP-118`; the status carries `provisioning`). It lives under the run host
like every other MCP child: one per session, one transient per discovery or probe, killed by `terminateTree` (the
`/T` reaches the runtime below the sentinel while both live; on stdin's end the runtime exits by itself). The
`--` is Electron's, not ours: a scheme-looking positional followed by another positional exits the binary before any
JavaScript (spike `code-intelligence-branch.md`). The transport tolerates the one CR LF Electron writes to standard
output at start. **`mcp.setup`** — renderer → main `{action: start | cancel | status}`; main → run host
`{workspaceId, action}` → `mcp.setup {status}` (the initialization coordinator's setup port names the run's own
workspace, by the identifier main was handed at its open, never the focused window's — 2026-10-01, PD-SHELL-001) (or `refused` with `mcp.setup.running`, `workspace.unknown` or
`mcp.configuration`; an entry that is not a local launch is not refused but answered with a finished `unavailable`
status). Main's setup port carries a refusal's code and words to the initialization coordinator, which reports it as a
retryable failure and keeps REQ-WORKSPACE-094's "not a local launch" for the `unavailable` status alone (OQ-167;
2026-10-01, R-067). A step stopped before it finished carries `stopped: cancelled | budget` beside the run host's own
`detail`, from which the coordinator writes REQ-WORKSPACE-092's two fixed sentences (2026-10-01, R-067). Beside it a step carries `skipped: marker-present | no-code` when it had no need to run, `output` (its output's trimmed tail, at most 400 characters, without the prose) when its command ran, and `startError` when its command could not be started; the coordinator writes REQ-WORKSPACE-091's fixed sentences and REQ-WORKSPACE-092's last 400 bytes from them, and the MCP category keeps `detail` (OQ-175; 2026-10-01). REQ-MCP-099's three steps run in the
run host as children of the derived invocation (`Rotaris.exe builtin:code-intelligence -- project create <root>`, then
`project index`, then `memories initialize`), each polled at 0.25 s on the clock port under 300 / 1800 / 120 s, asked to
terminate then tree-killed after 2 s on cancel or timeout (`SETUP_TERMINATE_GRACE_MS`; `PD-MCP-003`, OQ-172 ruled 2026-10-06 —
it was REQ-MCP-099's 5 s until then) — on POSIX each step leads a process group of its own and the
signals go to the group, so what the step started is ended with it (REQ-WORKSPACE-092; 2026-10-01) — and the run host's
`shutdown` ends a setup under way the same way after the same 2 s (`McpHost.endSetup`, `SETUP_SHUTDOWN_GRACE_MS`), cutting a
cancellation's grace already running to 2 s from the shutdown (since `PD-MCP-003` every stop's grace is that 2 s; before,
only the close was cut from 5 s, the build's reading of OQ-172 while it was open)
and exits only once the step has gone (REQ-WORKSPACE-092/109; 2026-10-01); the
category polls the status every 500 ms while it runs.
`ROTARIS_SCRIPT_MCP_ARGS` (verification only) hands the scripted client the arguments of an MCP step, and since fin42
(N52) `ROTARIS_SCRIPT_TOOL_ARGS` any tool's `{ name, args }` for a `tool:<key>` step, an argument written `@content_hash` sent as
the newest `content_hash:` a tool result of the conversation carried (`withLatestHash`; `pnpm edits-proof`).
