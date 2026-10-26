# Process view — five processes and what crosses each boundary — Message families (continued)

Part 5 of 8 of [the process view](../02-process-view.md), which indexes every part.

**`initialization.*` (Part AS, ADR-0064).** Five commands, renderer → main and no further: `initialization.read`
(REQ-WORKSPACE-115's refresh — the persisted section as it is on disk, nothing else disturbed),
`initialization.resolve` (REQ-WORKSPACE-102's "Check again", additional to the one automatic resolution per
workspace open), `initialization.start`, `initialization.skip {ids}` and `initialization.cancel`. Each answers with
the whole state of the sending window's own workspace: the coordinator keeps one entry per workspace a window holds, keyed
by its canonical root, and every one of its methods names the root it is asked for — there is no "current" workspace, so
with two main windows open (PD-SHELL-001) a Skip, an Initialize or a Cancel in one acts on that window's workspace alone,
each open's automatic resolution is its own, and a task's applicability is judged against the asked workspace's
configuration (`ApplicabilityContext`, `config`'s registry) (REQ-WORKSPACE-013/102/105; 2026-10-01). A skip records every listed id except one the live run is attempting, which it logs (ADR-0064,
finding (2)), and one already recorded completed, which it leaves completed (REQ-WORKSPACE-084/086; 2026-09-29,
R-062). Main makes every marker write through one queue per workspace root, one at a time in the order asked, and builds each patch
(a skip's, each of a run's recordings, the silent stamp) inside its turn from the file as the previous write left it,
because a patch replaces both lists whole (REQ-CONFIG-050); which ids a skip leaves out is decided in that turn too
(REQ-WORKSPACE-084/086/111; 2026-09-29, R-062). The window can open the dialog from its mount read before main's 800 ms slot, so a skip that arrives
before the open's one automatic resolution performs that resolution first (or waits for the one under way, and after it
reads nothing more before recording), and the
background task it starts is then attempted (2026-09-28, R-062; REQ-WORKSPACE-083/084/086/102; OQ-122). The state
carries `backgroundRun` beside the run report: whether that report describes a run the resolution started for background
tasks. The window reads it twice. A background run neither withdraws the setup prompt nor lifts the composer gate
(`setupPromptDue`, OQ-123). The dialog draws that run's report only once Initialize has been pressed (REQ-WORKSPACE-103/110;
2026-09-29, R-062). When the last main window holding a workspace closes — a switch's outgoing window, a replacement
discarded after a veto, one of several windows — `MainWindows` says so (`workspaceClosed`) and main calls
`initialization.close`: the run under way is cancelled (`mcp.setup {action: cancel}`, so the run host ends what the step
launched; one the run host refuses or does not answer is logged as not delivered — at `info` while the application is
quitting, whose run host `shutdown` ends the setup itself, and at `warn` otherwise; 2026-10-01), its recordings are refused, nothing of it is published or bannered — nor of a resolution still under way for it, whose failure is said in the log only (2026-10-01) — and the entry is dropped, so a return to
the root is a new open with its own automatic resolution (REQ-WORKSPACE-013/092/102/109, OQ-141 for a close that is
not a switch's; 2026-09-30, R-067). The run
host holds one setup and pushes `mcp.setupStatus` with no workspace on it, so the coordinator runs its setups one at a
time (`setupTurn`): a run's `code-intelligence-setup` starts once the setup before it has ended — after a switch, the
outgoing one, still ending — the one step sink is cleared only by the follow that set it, and a run's abort reaches the
run host's one cancel only while that run's own setup is live, never once the next run's has started behind it — and
an abort that lands while the setup's start request is in flight is sent as soon as the start answers (REQ-WORKSPACE-084/092/109;
2026-09-30, R-067). A follow whose finished status can never come still ends, as a retryable failure that releases the
next setup's turn: main tells the coordinator when the run host exits (`onRunHostExit`, from the run host's `exit`; it is
never forked again), and a follow with no finished status 2235 s after it began — every stage budget plus 5 s each —
ends on its own (`SETUP_FOLLOW_BOUND_MS`; REQ-WORKSPACE-084/091/092/109, OQ-169; 2026-10-01). A status pushed while the coordinator's own start request is in flight, before its sink exists, is kept and drained after the start's answer if it is the same setup's (`startedAt`), because a setup whose every step ends without waiting pushes its steps and its `finished` status ahead of that answer. Where the drained status has every step ended and still reads `running`, `mcp.setup {action: status}` is asked once (REQ-WORKSPACE-084/109; 2026-10-02). A setup start the run host never answers — main's request rejecting on its 15 s bound — is the task's own retryable failure in REQ-WORKSPACE-093's summary, not REQ-WORKSPACE-084's generic report, and the next setup's turn comes; a status read that rejects counts the task not applicable (REQ-WORKSPACE-080; OQ-169; 2026-10-01). Main is the coordinator because REQ-WORKSPACE-085 gives the marker **one writer** and that file
is the workspace service's (`config.setField`, Tier A, after a `config.bootstrap` that writes the starter only where the
file is missing or blank: REQ-WORKSPACE-040, `serviceMarkerWriter`, 2026-10-03) while the one shipped task's work is the run host's
(`mcp.setup`) — and the matrix gives neither of those two an edge to the other. The run host gained one event,
`mcp.setupStatus`, pushed on every change of the setup's status: the task follows a live setup through it rather
than on a cadence, because REQ-WORKSPACE-109 wants a step visible at the moment it finishes and SR-3 withdrew
polling wherever two processes can talk. `ROTARIS_INIT_TEST_TASK=consent|fail` (verification only) registers an
ordinary task through the ordinary registry, which is the only way to reach the consent dialog and the composer
gate: the shipped set requires no consent (REQ-WORKSPACE-088, REQ-WORKSPACE-104).

**Main → renderer (`CHANNEL`).** Since 2026-09-09 channel 3 has a producer and a delivery bound (Part AL, above), which since 2026-09-11 is one budget across every window rather than one per window (Part T″, above), and channel 10 carries the board's generation (Part AK, above). `transcript:increment` and `session:snapshot` share one per-session
sequence stamped in the run host and relayed unchanged (REQ-MONITOR-214); `terminal:frames` has its own
per-stream sequence; `notice:current` is the single notice or null, to the windows attached at the publication (a window built later reads the current one with `notice.current` at boot, 2026-10-14); `acknowledgement:publish` (channel 8, Part V) is a transient for ONE
window's own stack — the stack is per window and is not the notice store (ADR-0049); `library:changed` (channel 9,
Part X) is the library revision, to every live window; `initialization:state` (channel 12, Part AS) is
one workspace's nine values of REQ-WORKSPACE-105, their labels and descriptions, and its live run report, to the main
windows holding that workspace (`MainWindows.holding`) whichever view each is showing, and to no other (2026-10-01); `reauth:prompt`
(channel 13, 2026-10-02, the 401 note's part B) is `{sessionId, prompt}`, one session's non-modal re-authentication prompt
(REQ-NOTIFY-071) or null when it closes, to EVERY main window: each holds the prompts by session and draws only the
followed session's, so the prompt moves with the focused session (REQ-NOTIFY-030). *Corrected 2026-10-02 (the repair
round): it first went to the one window following the session (`ownerOf`) and was drawn there whatever that window
focused next, so another session's prompt stood over the focused one and acted on its own session;* `theme:changed` repaints
every live window; `display:changed` (channel 14, 2026-10-14) is `{preference, value}`, one of the three transcript display
preferences (`display/showReasoning`, `display/autoCollapseTools`, `display/groupToolCalls`) just stored by `prefs.set`, to EVERY
live window (`announceDisplayPreference`, `main/commands/shell.ts`), the writer included; each renderer folds it into its
`displayPrefs` store (`displayPreferencePatch`), so a persona window already open redraws its rows under the new value
(REQ-CHAT-167, REQ-CONFIG-403; until then only the writing window's store changed), and a window's boot read, still under way,
leaves alone what such an announcement set (`renderer/display-prefs.ts`, fin44); `project-init:open` (channel 15,
2026-10-14, PD-WORKSPACE-005 revisions 2 and 3) is `{workspace}`, to ONE main window, the one holding the workspace a
project-setup banner names — surfaced, or since revision 3 added for it — which opens Settings › Project
(`shell.openSettings('project')`); sent by `MainWindows`' `deliver` once the window's renderer has said it listens
(`projectInit.ready`), held on its record until then; `session:focus` (channel 16,
2026-10-14, PD-SHELL-001 revision 3) is `{sessionId}`, to ONE main window, the one holding the workspace a `focus-session`
notice names, which focuses the session through its own load (`session.resume`, as its session browser would) — sent by
`MainWindows`' `deliver` once the window's renderer has said it listens (`session.focusReady`), held on its record until then; `config:changed` repopulates every main window **and its family** — its persona windows and its terminal
window (`configFamily`) — from **its own** workspace's snapshot (`announceConfig`, `main/config-broadcast.ts`): the families
of the windows holding the written workspace take the reloaded snapshot, every other family its own workspace's, read again
from its service. *Corrected 2026-10-03 (fin10's repair round): every window was sent the written workspace's snapshot, so a
second main window's status strip and Settings read the first workspace's values. Corrected again the same day (the second
repair round): that repair first read "repopulates every main window from its own workspace's snapshot" and sent nothing to
a persona window, which kept the model, declared tools and compression threshold it mounted with until it was reopened.*

**Main ↔ run host (`RunHostRequestSchema` / `ProcessReplySchema` / `ProcessEventSchema`).** Since 2026-09-09 (Part AL): the seven `terminal.*` requests, the `terminal.streams` reply and the `publish.terminal` event, listed above. Since 2026-10-06 (fin22, PD-PROVIDER-001)
main's handshake `hello` carries `sharedQuotaCaps` — the shared-quota cap each provider's catalogue entry declares, by
provider id (`sharedQuotaCaps()`, `packages/providers/src/catalogue.ts`) — because the run host cannot read the catalogue;
the run host keeps them (`RunHost.sharedQuotaCaps`) and every run's `modelCapFor` applies them to a model whose entry
states no `max_parallel` (`modelCapInForce`, `packages/config/src/sections/models.ts`). Requests:
`workspace.opened/closing/refuseRuns/renewLease/closeStore/release`, `session.*` (start, list, resume,
continue, prompt, retry (since 2026-10-02, REQ-NOTIFY-045; answered `ack`), attach, detach, reconcile, pageOlder, control, and since 2026-10-02 `restartOnFallback {sessionId}` —
REQ-NOTIFY-070's pin of `fallback_model` and the restart with the same prompt, answered
`session.fallbackRestarted {failed, fallback}` with each pair's provider, model and key, or `refused` — whose code main reads
since the merge beside the recovery dialog: `session.no-fallback`, `session.fallback-failed` and `session.no-model-failure`
are REQ-NOTIFY-072's "no usable fallback" and open the dialog, `session.run-active` a superseded failure, any other a
restart that could not begin; and
`repinPrimary {sessionId, provider, model}` — REQ-NOTIFY-078's re-pin of the primary after re-authentication, answered
`session.primaryRepinned {applies: next-iteration | next-run}`), `runs.active`, `circuit_breaker.status`,
`config.liveState` (answered with the ack, or since 2026-10-14 `refused config.live-state-invalid` when the state holds a value
the load's schema rejects — `03-runtime-view.md`, Tier B), `presenter.register/revoke/pollReply` (a revoke the application's quit causes carries `quitting`,
PD-ORCH-005 clause 9 — `06-sequences.md` §2), `approval.shown/queued`, `hooks.*`, `playbooks.catalogue`,
`checkpoint.list/recordSafety/recordRestore` (Part P), `prompts.read/push/take` (Part X, session-less like
`session.list` — REQ-LIBRARY-137/138), `workspace.usage {workspaceId}` (fin10, session-less too: the status strip's tokens and
cost over the workspace's stored sessions, answered `workspace.usage {tokens, cost}`), `timeline.append` (Part V, REQ-NOTIFY-268; its optional
`severity` is REQ-SESSION-134's vocabulary and `info` where absent, while the entry's `id` is minted by the writer
that records it and never travels on the wire), `shutdown`. Events back: `publish.increment`, `publish.snapshot`,
`run.result` (since 2026-09-13 it may carry `persistence: {confirmed: false, last_event_ordinal}` — present only when
terminal persistence could not be confirmed, and what main reads to suppress its own terminal notice, `REQ-EVENTS-088`
allowing exactly one failure notification per affected run; since 2026-10-14 it carries `workspaceRoot`, the root the run host
recorded the session under in `sessionRoots`, absent where none is recorded — PD-SHELL-001 revision 3, the workspace a
`focus-session` action names), `run.paused`, `approval.present/close`, `presenter.poll`, `notice.publish` (Part V: the fields
REQ-NOTIFY-023 lists, `sessionId` and `persistent` among them, and since 2026-10-14 `workspaceRoot` as on `run.result`,
stamped by `withSessionRoot`, `run-host/session-roots.ts`, whose `runResultEvent`, `runNoticeEvent` and `reportNoticeEvent`
build all three events `host.ts` sends about a session (2026-10-14, fin45) — the workspace a `focus-session` action names and, since OQ-293, the
project a run's `hooks.review` notice is named for and its `open-hook-review` action reaches (`main/run-notice.ts`, through the
open slot's composer `hooksReviewNotice`); the `ttlMs` Part S added is gone — REQ-NOTIFY-040
forbids a notice leaving on a timer), `acknowledgement.publish` (REQ-MCP-044's warning, now a transient),
`log {level, message}` (a line for the application log, below), `ready`. **The run host's
asks back to main** (on the `ServiceAsk` envelope): `credentials.lease {providerIds}` (ADR-0030), answered
`credentials.leased {bearers, report}` — the only message in the product that carries a credential value, and it never
crosses a renderer boundary — and the three checkpoint asks of the paragraph above, relayed to the workspace service.

**Main ↔ workspace service.** Since 2026-09-09: `prompts.roots.read` → `prompts.roots` (Part AO, above), `requirements.command` → `requirements.result` (Part AK) and `traceability.operate`/`traceability.cancel` → `traceability.result`/`traceability.cancelled` (Part AJ), listed above. Requests: `workspace.open/close/backup/restore.assess/restore.perform`
(`workspace.open` writes the starter `<workspace>/.rotaris/agents.yaml` when it is absent or blank, once the store is open
and before it answers, so main's initialization, opened only after that answer, never records into a file it created
without the starter: REQ-CONFIG-025/028, `workspace-service/open-bootstrap.ts`, 2026-10-03; since 2026-10-14 its answer
`workspace.opened` carries an optional **`cutRestore {reversed, hadStore, staging, stamp}`** when the open reversed a restore
cut between its renames, OQ-266 (`staging` `null` when the prepared copy is not there at the open), which main raises as one
info notice, and the open is **refused** — `workspace.store-missing`
for a place holding no store (REQ-SESSION-202, W-31), `workspace.store-displaced` for a cut restore whose store could not be
put back, `workspace.restore-in-flight` while the service's own restore runs — each creating nothing, the first two raised by
main as an error notice and answered by `session.list` as the same refusal, `workspace-service/store-open.ts`; since
2026-10-14, OQ-281, the `store-missing` notice carries `open-settings`/`project` and is withdrawn by the next open that
succeeds, and while it is held `workspace.restore.assess/perform` are admitted for that window — no `runs.active` asked, no
store having been handed to the run host, whose restore controls acknowledge a workspace it holds none for — with
`RestoreAssessment.target.placeEmpty` saying what was found; every other workspace-scoped command in that window answers the
held refusal rather than `workspace.none` (or the checkpoints' `checkpoint.no-workspace`), main's `runCommand` mapping it in one place), `workspace.store.establish.assess {workspaceRoot}` →
`workspace.store.establishable {place, kept, stamp}` and `workspace.store.establish.perform {workspaceRoot, stamp}` →
`workspace.store.established {place, kept}` (OQ-281: Settings › Project's deliberate new store, asked by main first with Cancel
the default; the service re-checks the condition, moves the found place aside as `<identifier>.displaced-<stamp>` and keeps it,
then opens as an absent place opens; `workspace-service/store-establish.ts`),
`config.read/save/setField/bootstrap`, `repository.read`, `git.view`, `worktree.*`, `checkpoint.capture/refs/preview/
restore/prune` (Part P), `shutdown`. The service's narrow asks back to main (`ServiceAskSchema`, ADR-0002 c.7) —
`runHost.refuseRuns/renewLease/closeStore/release/reopen` — are forwarded by main to the run host; the two children never
talk directly.

**The application log (`PD-MONITOR-002`, built 2026-09-27).** Main's standard output, and nothing else: main's own lines
and the `log {level, message}` events both children send — the run host's and each workspace service's — are written
through one writer, `logAt` in `main/index.ts`, built over `main/app-log.ts`. A line carries its level as a field, a
column of its own ahead of the message: `[main <instant>] <level> <source>: <message>`, the level one of `debug`,
`info`, `warning` (the protocol's `warn`) and `error`, the source present only on a forwarded line (`run host`,
`workspace service`); main's own line about the run host's handshake reads `run host hello:` so it is never taken for
one. A forwarded line keeps the level its child gave it — the event's `level` is the logger's own type, so no mapping
stands between them. **One fact, one emitter** (live-run finding a71-9, repaired 2026-10-01): a fact is written by the
process that did the work, and the process it answers relays the answer without saying it again — the repository read
(`repository <root>: …`) and the Git view (`git view: N reads in M ms (…)`) are the workspace service's lines, not main's
command handlers'; the credentials lease's report is the run host's `LeaseReportLog` (REQ-PROVIDER-068), not main's ask
handler; a setup step's outcome is the run host's step reporter (`mcp setup: <id> succeeded (N ms)`), not
`runSetupSteps`, which logs only the command a step spawns; an MCP tool discovery's failure is `ToolDiscovery`'s one
REQ-MCP-048 warning (`mcp <name> (project <root>): tool discovery failed in N ms (…)`, the child's stderr kept on its one
line, ` | ` between its lines), not `McpHost.prepare`'s, which says a success only (live-run finding U4, repaired 2026-10-03).
`scripts/lib/restated-facts.mjs` reads a launch's log for a restatement of any of the five; `git-proof`, `mcp-proof`'s
drop-rules launch and every live-run launch assert there is none. Main's own lines are `info`, except its reports of a loss — a crash, a renderer or child process
gone for any reason but `clean-exit`, a child exiting with any status but 0, a `shutdown` a child refused or left
unanswered, still running, when its bound elapsed at quit, a failed hand-over, a refused launch — which are `error`, and
a dialog it could not present, which is `warning`. An exit status of 0 is not proof of an orderly `shutdown`: Electron
reports 0 for a child it tears down at quit, too, which is why the unanswered `shutdown` has a line of its own. The quit
races each `shutdown` against that child's exit (`shutdownAtQuit`, `main/exit.ts`), watched from the fork: a child that
exits has ended even when its answer was lost to the exit, so only one still running when its bound elapses, or one that
answers with a refusal (its `shutdown` threw, so it closed nothing and Electron's teardown will report 0), is said. Main then waits for the run host's exit itself, bounded, ending it if it has not come, before it quits — and an immediate exit ends it at once — so main is gone only after the run host and no session lock outlives the instance (`endBeforeMain`, 2026-09-28); a run host still running past that bound is said at `error`. The run host main ends that way is recorded (`ChildrenEndedByMain`, `main/exit.ts`, 2026-09-29): Electron reports its end `killed` after its own `exit` has said 0, and that report is `info` and says main ended it; a child killed any other way, or crashed, stays a loss at `error` (live-run finding L13). The writer onto standard output is `standardStreamWriter` (`main/app-log.ts`, 2026-09-29): it
listens for the stream's `error` and, from its first failure, writes nothing more, and standard error carries the same
listener — so a reader that has gone (EPIPE) never becomes an uncaught exception that the uncaught-exception handler
logs to the same stream without end, which had starved the quit and REQ-MONITOR-131's backstop. A
line below the threshold is not written. The threshold is `info`, and the environment variable `ROTARIS_APP_LOG_LEVEL`,
read once when main's module is evaluated, is the only thing that moves it; no message kind, command, configuration key
or setting reaches it, and it is a different thing from the per-session `session.log`, whose level is
`session_log_level` (REQ-CONFIG-121). The live-run harness sets the variable from its `--app-log-level` flag, and since
2026-10-20 to `debug` or `info` only: its readings read the `info` lines a higher threshold drops
(`apps/desktop/scripts/lib/app-log-level.mjs`). The per-session log is the run host's file; the application log is not a file the
product writes — whoever launched the process keeps it or does not. The sentinel (`main/sentinel.ts`) is not main and
does not write this log itself: its two diagnostics — the bundled runtime absent, or present and unable to start — go to
its own stderr. The token process is an MCP stdio child, so that stderr reaches this log through the run host like any
child's: line by line at `debug` (`run host: mcp code_intelligence stderr: …`, `packages/mcp/src/transport.ts`), and
quoted in the failure lines — REQ-MCP-107's stderr tail in a failed discovery's line at `warning`, and a failed setup
step's last output at `info` (`mcp setup: create failed — …; its last output: …`, the detail `packages/mcp/src/setup.ts`
builds). At the default threshold only the quoted route is written. **The hook engine's `log` sink reaches this log
(REQ-HOOKS-138, repaired 2026-09-28)**: a hook fault that reduces to a log entry (REQ-HOOKS-079/128/129) and the run
host's account of a hook set it could not resolve (REQ-HOOKS-085) are handed to `Sessions` through `HookPortContext.log`,
which `Sessions` writes through its `SessionsDeps.log` — the run host's `log` event at `info` — and never through the
per-session log, whose `WARNING` default had dropped them. The checkpoint port's `CheckpointPortContext.log` stays the
per-session log by decision, because its root writes every checkpoint line to both logs through a channel of its own.

**Every window subscribes for itself (Part R).** `session.subscribe` / `session.unsubscribe` bind the relay subscription to the **sender's** webContents id — the persona window's when it asks — not the main window's (the twenty-seventh defect, ADR-0043's note); the run host's `session.attach` then re-delivers the whole-session update and the resident rows to every subscriber of the session. A persona window subscribes on show and unsubscribes on hide (ADR-0048's zero-work rule). A start's send settles in the renderer only on this command's reply, so the run is drawn active before it: the composer takes the focus back on that reply only when nothing else took it meanwhile (`composerReclaimsFocus`, `ui/src/composer.ts`), so a steer dialog opened in between keeps it (`../../../defects/fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`, 2026-10-01). Verification seam (under `ROTARIS_CAPTURE_PNG` only): `ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS` holds the reply that long after the attach is acknowledged, logging `capture: session.subscribe reply held … ms` and `… released`, so `part-j-proof`'s steer-early launch opens the dialog inside that window every time. A second seam, `ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS` (since 2026-10-06, finacc2's A1), holds the subscription itself that long **before** it takes effect, logging `capture: session.subscribe held … ms before it takes effect`, so `resilience-proof`'s `auth-fallback` launches end the first run on its 401 before the window subscribes, and assert the started session is still the focused one (`MainWindows.showingSession`). **`session.release`** (since 2026-10-02, REQ-NOTIFY-031/032) clears the sender's follow of a session in `MainWindows` and nothing else: "New session" sends it for the session it releases to run on in the background (REQ-MONITOR-249/252), so the focus test (`followerOfSession`) reads that session as not on screen while the window keeps its relay subscription; until then main went on counting it as followed until the next prompt subscribed the new one.
