# Process view — five processes and what crosses each boundary — Message families (continued)

Part 3 of 8 of [the process view](../02-process-view.md), which indexes every part.

**Checkpoints (Part P; ADR-0039's first execution).** Renderer → main: `checkpoints.list {sessionId}` (rows only, REQ-GIT-050),
`checkpoints.preview {sessionId, sequence}` and `checkpoints.restore {sessionId, sequence, force}`; main holds ONE desktop
checkpoint operation in flight (REQ-GIT-091) and declines a second with code `checkpoint.busy`, which the view shows as the
toast or, for a listing, retries once after 150 ms against the then-selected session (REQ-GIT-095). Main → run host:
`checkpoint.list {workspaceId, sessionId}` → `checkpoint.list {listing}` (the rows with pre-formatted local-time labels,
`lastRestoredSequence`, REQ-GIT-093's `liveness` verdict, the tree root of REQ-GIT-053, an `unavailable` reason when the
binding's tree is gone, `repaired` when REQ-GIT-094's stale-session repair ran, `includeUntracked`);
`checkpoint.recordSafety {…}` → `checkpoint.recorded {sequence, trimmed}` (the pre-restore row through the writer's one
transaction, its trimmed refs pruned by the run host's own ask, then the event published); `checkpoint.recordRestore {…}` →
`ack` (REQ-GIT-062/068/155). Main → workspace service, where every Git call lives (ADR-0038 c.4): `checkpoint.capture
{workspaceRoot, treeRoot, sessionId, sequence, iteration, childName, checkpointKind, includeUntracked, message}` →
`checkpoint.captured {outcome: recorded | nothing-to-record | unavailable | failed, ref?, commit?, files?, detail?,
invocations, elapsedMs}`; `checkpoint.refs {treeRoot, sessionId}` → `checkpoint.refs {ok, entries}`; `checkpoint.preview
{…, commit, candidates, includeUntracked}` → `checkpoint.previewed {treeState, entries, dirty, blockedReason, text,
invocations, elapsedMs}`; `checkpoint.restore {…, commit, entries}` → `checkpoint.restored {ok, touched, detail?, …}`;
`checkpoint.prune {treeRoot, sessionId, refs}` → `checkpoint.pruned {deleted, failed}`. **The run host's three checkpoint
asks back to main** (`ServiceAsk`, beside `credentials.lease`): `checkpoint.capture`, `checkpoint.refs`, `checkpoint.prune`
— main relays each to the workspace service of `workspaceRoot` and answers the run host with the service's reply; the two
children still never talk directly (ADR-0002 c.4). The service tracks its in-flight checkpoint operations and its `shutdown`
waits for them (REQ-GIT-101); main sends every service `shutdown` after the run host's and awaits it, bounded by REQ-GIT-033's
limits, before it quits. The two paths that end the process at once rather than through `app.quit()` — the capture
seam's exit and the driver's `quit` when it is asked for the immediate exit — go through `exitCleanly` (`main/exit.ts`):
every child window is destroyed, its `closed` awaited (bounded at 2 s), and `app.exit` runs on the next turn, because on
Linux `app.exit` over an open modal child segfaults. Neither sends `shutdown`; both are verification seams
(`ROTARIS_CAPTURE_PNG`, and the driver under `ROTARIS_DRIVER`), and every quit a user can reach goes through
`window-all-closed`, the main window's close guard turning an `app.quit()` into one. **Since 2026-09-29 the driver's
`quit` is `app.quit()` unless it names the immediate exit** (`pnpm app:drive stop` against `stop --crash`), and **a
capture whose wait timed out ends through `app.quit()`** rather than `exitCleanly` (`CaptureHost.quit`, `capture/probe.ts`):
both then take the user's path below and send `shutdown`, so a live run comes to rest as a quit leaves it (PD-ORCH-005
clause 3). A capture whose wait was satisfied, or that had none, still ends by `exitCleanly`
(`docs/defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md`). A quit Electron starts on its own account (SIGTERM,
the desktop's logout where Electron emits `before-quit`, `app.quit()`)
is turned into the same path. **On Windows Electron emits no `before-quit` at a logout, restart or system shutdown**; since
2026-10-07 (fin29) each main window's `session-end` (Windows only, and not refusable) starts the same orderly shutdown
`window-all-closed` runs — memoized, so it runs once whichever starts it — with the quit marked as the process's exit and no
guard asked, and the process exits when it is done (`SessionEndShutdown`, `main/exit.ts`;
`docs/defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md`; not yet observed on a Windows host — *2026-10-20: observed on a Windows ARM64 host under a SIMULATED logoff (the two end-session messages sent to the application's own windows): the line logged, exit 0 in 0.9–1.9 s, the store as clause 23 wants; a real logout is still unobserved, and Windows' allowance against the 30 s bounds is [OQ-402](../../open-questions/66-spikes-and-later-questions-33.md#oq-402)*). For the quits
that do emit it: `before-quit` is held while any main window is open, and the main windows are closed
all or none (`closeThroughGuards`: every guard asked, every close confirmed, then every window closed). The handler is
`QuitOutsideAnyWindow` (`main/exit.ts`, since 2026-10-14 fin46; inline in `main/index.ts` before): it holds the quit while a
main window is open and not already closing, starts the close once, holds a second `before-quit` while that close is under way,
and lets the quit `window-all-closed` starts go ahead. **Since 2026-10-14
(fin45; OQ-298, `PD-SHELL-009` revision 2) that quit asks no close guard**: `quitGuardsOutsideAnyWindow` (`main/exit.ts`) hands
`closeThroughGuards` one guard per open main window whose `ask` allows at once and whose `confirm` and `close` are the window's
own `CloseGuard`'s, so the renderer's unsaved-settings guard is never asked — a quit from outside any window is no
user-initiated close (REQ-SHELL-119 guard (1), REQ-CONFIG-287) — unsaved settings stay unsaved and nothing is written, and main
logs "quit: started outside any window; each close guard allows without a question, so no Save/Discard/Cancel or active-run box
is shown, and unsaved settings, if any, stay unsaved (OQ-298)" (until 2026-10-14, fin46, "no close guard is asked", which read
as the opposite of the line before it, "through their close guards first"). Until then it asked each renderer's guard and
waited on a person's Save/Discard/Cancel without bound. What follows about a renderer that cannot answer now concerns a
person's close of a window and REQ-SHELL-021 gate (1) alone. **A renderer that is gone cannot answer, and a guard that cannot
answer allows** (since 2026-10-14, fin43): the renderer's guard is asked by `askRendererGuard` (`main/main-windows.ts`), which
rejects at once when the window's
`webContents` has crashed or is destroyed and the moment `render-process-gone` or `destroyed` is emitted while it is out,
because Electron's `executeJavaScript` on a disposed frame never settles; until then a crashed renderer held a person's close
and the quit for good (`docs/defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`,
shown by `pnpm exit-trace-proof`). **A renderer that is alive but does not answer cannot answer either** (since 2026-10-14,
fin44; `PD-SHELL-010`, OQ-297): beside the guard's question `askRendererGuard` sends main's own liveness probe
(`executeJavaScript('true')`) and arms `RENDERER_LIVENESS_BOUND_MS` (5 000 ms) on the main-window timers port; a probe answered
in time is followed by the next when the bound elapses, and one unanswered at its bound — or Chromium's `unresponsive` for the
contents while the question is out — rejects the question ("cannot answer: unresponsive", apart from "gone"), main writes at
`warn` which signal it was, and every listener and timer is removed whichever way the question settles. Until then a hung
renderer held a person's close and the quit, a SIGTERM's included, for good
(`docs/defects/fixed/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md`, shown by `exit-trace-proof`'s `hang`
and `hang-close` launches: the renderer stopped with SIGSTOP, the quit and the host's close each end the process, exit 0, about
5.6 s after they were asked). The allowed `win.close()` completes on a hung renderer, so the close stays a close, not a
`destroy()`. A renderer that answers its probes is waited for with no bound: its guard may be a person's Save/Discard/Cancel
(a quit from outside any window no longer asks it: [OQ-298](../../open-questions/61-spikes-and-later-questions-28.md#oq-298), ruled; `exit-trace-proof`'s `hang`
quit now exits in well under a second, and its `unsaved-quit` and `unsaved-sigterm` launches leave the configuration file
byte-identical). Nothing a quit closes answers for a person. `QuitState` (`main/exit.ts`) knows the quit from
`exitCleanly` and from each main window's confirmed close, which `guardClose` reports before closing. While it is under
way an approval dialog that closes sends no Deny, and the question dock's cancellation is not forwarded. The run host's
`shutdown` withdraws both instead (PD-ORCH-005 clause 9, OQ-96). **Since 2026-10-06 a person's close of a main window asks
REQ-SHELL-119's guards in order** (REQ-STARTUP-046, OQ-206; fin22): the renderer's unsaved-settings guard, then guard (2)
(since 2026-10-15, fin47: while a worktree integration runs the close is refused by the informational "Integration in progress"
box, `integrationAllowsClose`, `main/integration-guard.ts`, reached through the adapter's `integrationAllowsClose`; main reads
`noWorktreeIntegration`, which answers none running while integration is deferred, so it refuses nothing in this build;
since 2026-10-21, as [OQ-361](../../open-questions/63-spikes-and-later-questions-30.md#oq-361) ruled on 2026-10-20 (`PD-SHELL-009` revision 3), the close of one of
several main windows asks about the closing window's own workspace and never refuses a window that holds none, the last
window's close asks about the whole instance, the reader is main's own record of an integration it admitted and has not
seen end — never a binding's `merge_status` or REQ-GIT-128's lock — and a record that cannot be read allows with a `warn`
line, so the close goes on to guard 3), then, when no
other main window stays open and the run host's `runs.active` counts a run (a count that cannot be read counts), the
active-run confirmation — a message box over the closing window, "Quit while a run is active?" with Cancel and Yes, Cancel
the default and Escape's answer (`activeRunCloseBox`, `confirmActiveRunClose`, `main/close-confirmation.ts`, reached through
the adapter's `confirmRunsAtClose`). Only Yes confirms the close; Cancel leaves the window, its state and the run as they
were. A close made while the guards are being asked is held and asks nothing more. The application's quit
(`closeThroughGuards`) asks no guard at all since OQ-298 (it asked the renderer's guard alone until 2026-10-14): it is not a
person's close of a window. **Since 2026-10-07 the close
of one of several main windows ends its own project's runs, asking first** (PD-SHELL-009, OQ-206 ruled under R-072; fin28):
main → run host `runs.active {workspaceId, scope: 'stoppable'}` counts that workspace's runs the stop would take (the
session row's `workspace_root`, `Sessions.stoppableRunCount`: a live run whose end is not yet written — the predicate
`Sessions.stopActiveIn` stops by, since fin29; the plain keyed count, `activeRunCount`, also counts a run still ending, which
no stop takes; the empty id counts the instance's, as the last window's close and the update's close ask), and while it is
above zero (or cannot be read) the box asks "Close this window while a run is active?" (`windowCloseBox`). Its Yes sends `runs.stopWorkspace
{workspaceId}` → `runs.stopped {workspaceId, sessionIds}` — the stop control's graceful stop over that workspace's runs
(`Sessions.stopActiveIn`), which rest `paused` by `stop` — and only then does the guard confirm the close, so the stop reaches
the run host before `presenter.revoke`. Main keeps the stopped ids in `QuitState.stoppedByClose`: until the stopped run's own `run.result`
arrives, an approval dialog closing for one answers nothing, a queued approval is not reported unshown, the question dock's
cancellation is not forwarded (the stop withdraws all three, PD-ORCH-005 clause 9), and a `notice.publish` for it is held
back from the windows that stay (REQ-STARTUP-046's last sentence); the `run.result` is the rest's own notice — main holds
the outcome notice it would raise from it and does the rest of what it asks — and ends the hold. A run whose `run.result`
reached main between the stop's request and its reply (`QuitState.stopAsked`) is not held. (Until fin29 the hold followed
`publish.snapshot` statuses — rest, then active — which named no run: a run stopped before it had saved an active status lost
its hold at its `cancelling`, a session never continued kept its notices held for good, and the outcome notice was never
held.) The event relay asks `QuitState.holdsBack` of every run host event, and `unshownApprovals` filters through
`QuitState.unshownToReport`. A window whose
workspace has no active run closes unasked. REQ-SHELL-021's gate 3 and the restore's refusal send their window's workspace
id and so count that workspace alone. ~~`session.start`'s forced isolation (REQ-GIT-120, REQ-MONITOR-251: "whenever any run is
active") sends the empty id, so a launch without an explicit tree is placed in a worktree while a run executes in any
project.~~ *Replaced 2026-10-07 by PD-GIT-001 (OQ-224; fin29).* `session.newId` and `session.start` ask one count,
`runs.active {workspaceId, scope: 'sharing'}` (`Sessions.activeRunsSharing`: the window's workspace's own runs, and any run
whose tree is its folder, inside it or around it; a run of an unrelated project never counts). `session.newId` answers
`{sessionId, isolationRequired}` — above zero or unreadable — and the launch dialog shows that answer as REQ-GIT-119's lock;
`session.start` forces the default tree for a launch without an explicit tree on the same answer and, when it forces, raises
an informational notice scoped to the new session carrying REQ-GIT-119's hint and the branch. The run host refuses to start
a further run of a base-tree session (a message at rest, Continue, the retry, the plan gate's relaunch) while that count,
with the session excluded, is above zero, with REQ-GIT-120's words.

**The session browser's actions (Part U).** Renderer → main: `session.repair {sessionId?}` (one stale session, or every
stale session when the id is absent — REQ-SESSION-060/182) → `{report: {repaired[{sessionId, from, to: interrupted,
reason}], skipped[], nothingStale}}`; `session.delete {sessionId}` → `{existed, refsDeleted, refsLeft, filesRemoved,
unreadable, elapsedMs}` (a live session refused with its sentence); `session.export {sessionId}` (REQ-SESSION-199's
four records) and `session.exportTrajectory {sessionIds}` (one document, or REQ-EVENTS-144's wrapper in selection
order) — main opens the save dialog first and nothing is written until a path is chosen; `session.openLog {sessionId}`
and `session.revealFiles {sessionId}` (REQ-SESSION-191, answered from main with `shell.openPath` /
`shell.showItemInFolder`, a missing file reported). Main → run host: `session.repair {workspaceId, sessionId?}` →
`session.repaired {report}`; `session.delete {workspaceId, sessionId}` → `session.deleted {…}`; `session.export
{workspaceId, sessionId, destination}` and `session.exportTrajectory {workspaceId, sessionIds, destination}` →
`session.exported {destination, bytes, documents, warnings, elapsedMs}` (the run host writes the file from its one open
connection through ADR-0004's replace under REQ-TRACE-061's ladder); `session.files {workspaceId, sessionId}` →
`session.files {directory, log, summary, artifacts}` (null for a file never written). **The run host's fourth checkpoint
ask** back to main: `checkpoint.deleteNamespace {workspaceRoot, treeRoot, sessionId}`, relayed to the workspace service
as the request of the same name → `checkpoint.namespaceDeleted {deleted, detail?}` (REQ-GIT-069, best-effort).
`SessionListItem` gains `unreadable` (REQ-SESSION-041: the parse detail, or null). Verification seam:
`ROTARIS_CAPTURE_SAVE_PATH` answers the export save dialogs with `;;`-separated paths consumed in order (the backup's
`ROTARIS_CAPTURE_BACKUP_TO` is unchanged).

**The Library's saved prompts and its change channel (Part X; REQ-LIBRARY-105/137/138).** Renderer → main:
`prompts.read`, `prompts.push {list, text}` and `prompts.take {list, index, remove}` — no session id, because the two
lists belong to the workspace and outlive every session; `remove` is a REQUIRED boolean, not a defaulted one
(REQ-LIBRARY-107 makes keeping and removing two deliberate acts), and `index` is the entry's position in the WHOLE
list, newest first, so a filtered view acts on the row the user chose. Main relays each to the run host, which owns
the store, exactly as it relays `timeline.append`: `prompts.read {workspaceId}` → `prompts.state {state}`,
`prompts.push {workspaceId, list, text}` → `prompts.state`, `prompts.take {workspaceId, list, index, remove}` →
`prompts.taken {text, state}`; a store failure comes back `refused` and main raises REQ-LIBRARY-138's persistent
notice "Could not save prompt history" while the window keeps its lists in memory. **A ninth channel,
`library:changed`** (main → every live window), carries `{v, revision}` and nothing else: a counter cannot be
overtaken, so a burst settles with the last write visible (REQ-LIBRARY-105), and a window off the Library sees the
move and re-reads when it is next shown. Main bumps it for exactly the four things REQ-LIBRARY-105 closes a
"library change" to (`LIBRARY_CHANGES` in `contracts/src/library.ts`) — Part X writes the two prompt members and Part Y's `artifacts.save` writes `session-artifacts` — and
`bump` takes a member of that union, so a settings write has no way to reach it. A `prompts.take` that KEPT the
entry writes nothing and bumps nothing. `prefs.set` gains `panels/library` (REQ-SHELL-069, no arrangement suffix; since 2026-10-14 `panels/library/state`, stored across the three registered keys).
Verification seam: `ROTARIS_CAPTURE_PROMPTS="history>>text@ms;;stash>>{n}text @ms"` pushes through the real command.

**The post-run improvement analyst (REQ-LIBRARY-015..035/125..131/165).** The run host publishes `run.result` first,
then captures a frozen, bounded job from the persisted task run: progress, todo, child reports, transcript, gate evidence
and at most five prior artifacts, with unavailable sources represented explicitly. The history holds post-run artifacts
only: a retrospective's artifact is dropped before the five-artifact bound (PD-LIBRARY-002 revision 3 (h), OQ-271 ruled under
R-072), so `considered_session_ids` names the source session of every prior artifact supplied. Skipped terminal reasons and
`improvement_run` sessions produce no job. The capture is detached and never rejects (`run-host/improvement-capture.ts`):
a stop reason on REQ-ORCH-137's skip list ends it before main is asked for the history, the store is looked up again
after that ask, and a store the quit or a workspace close has closed meanwhile, or a capture that throws, yields no job
and a log line. Main queues `improvement.job` in one application-wide FIFO and asks the run
host to execute `improvement.analyze`; the analyst receives no tools, retries malformed JSON once and has a hard configured
timeout. Both passes' system texts state a proposal's whole shape: each field's closed vocabulary or bound, and every key a
`proposed_verifier_section` and its checks may hold, with an example (`PROPOSAL_SHAPE` in `engine/src/improvements/analyst.ts`,
fin46 L1: before it they named the field only, and the live run at `b9e3005` lost a retrospective to invented keys). Main then relays `save-collected` to the workspace service, rereads the canonical record, bumps
`improvement-artifacts`, and publishes the ready notice. `improvement:activity` carries workspace identity, active
state, queued count and source session, the running pass (`pass`, Part AT) and, per main window, whether a retrospective of
that window's own workspace is pending (`retrospective_pending`, PD-LIBRARY-002 revision 2 (e)); the paragraphs below say
how each is read. Workspace close or application shutdown sends `improvement.cancel`, aborts active
analysis and discards queued jobs before any artifact or notice is written.

**The retrospective pass (Part AT; `PD-LIBRARY-002`, ADR-0065).** The same analyst, reached without a run. A gesture on
any of three surfaces sends main `improvements.retrospective {workspaceRoot}`; main asks the run host for
`retrospective.capture {workspaceRoot}`, which resolves the workspace's configuration as a run start does, leased first and
completed over the bearers it leased (`retrospectiveSetup` → `leasedSetup`; no run context exists, and the workspace's cached
`configuredFor` setup may have been completed over no lease — the live run at `ce5f952`, F2), and answers the existing `improvement.job` event —
carrying `pass: 'retrospective'` and a `retrospective` sources block (session digests, prior proposals, saved prompts,
persona memory, instruction files, each entry naming its record) — or `retrospective.no-model` when nothing resolves.
The setup is prepared as a retrospective's (`prepareRun`'s `retrospective` option): an entry role with no usable model does not
refuse it while the retrospective's own model resolves — the setup is completed with that model in the entry model's place, and
the log says so — and `leasedSetup` answers `no-model` only when neither resolves, which `retrospective.capture` says as
`retrospective.no-model` and `improvement.analyze` as `improvement.no-model` (*since 2026-10-15, fin47; until then the entry
role's `no-model` became `unconfigured`, answered `retrospective.no-configuration` "The workspace configuration could not be
loaded" and, at the analysis, `improvement.expired`,
`docs/defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-the-entry-role-has-no-usable-model.md`*).
ADR-0022's start-time confinement gate does not meet a retrospective's setup: it is a run start's, and the pass opens no shell, so
`runtime.sandbox_mode` and the run host's verdict — settled or not — refuse nothing here, while a run start and a continuation keep
the gate. Of `prepareRun`'s other refusals, only a configuration that did not load or apply (`ConfigureRefusal` code `unloaded`)
becomes `unconfigured`, said as `retrospective.no-configuration` at the capture and `improvement.no-configuration` at the analysis,
each with the loader's reason as its detail. Of a configuration that loads, nothing else refuses the pass (`PD-LIBRARY-002`
revision 6, OQ-363): a `default_persona` naming no role this build knows leaves its setup completed on the retrospective's own
model — the configured name kept, no role's system text, the log saying so — and refused as `no-model` only where no
retrospective model resolves either; REQ-CONFIG-246's referential errors are the setup's warnings whatever the presenter, since
the setup reads no attendedness; and `retrospective.capture` writes every warning of the setup — the load's and the referential
messages — to the log once, at `warn`, prefixed `retrospective: `, before the collector is resolved, while `improvement.analyze`,
which repeats the preparation, writes none. `retrospective.configuration`, `leasedSetup`'s answer for a loaded configuration that
refuses the pass, is reached by no current refusal and stays as the truthful answer for one that ever does (*since 2026-10-20,
loc1; from 2026-10-15 (fin47 `fin47-accept1-4`) the unknown persona and the referential errors with no presenter answered
`retrospective.configuration` with `prepareRun`'s reason, and until then a requested confinement refused the pass wherever the
verdict was unsettled or unavailable, and every such refusal read "The workspace configuration could not be loaded" and, at the
analysis, `improvement.expired`,
`docs/defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md`*). Every run
start and continuation keeps both refusals word for word.
A lease that leaves the retrospective model's sign-in provider unresolved — the model its request goes to, `retrospective_model`
then `medium_model`, never the entry role's (*since 2026-10-14, fin46; it read "the entry provider" and checked the entry role's,
`docs/defects/fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`*) — answers `session.provider-auth` with REQ-WORKSPACE-137's headline and the
retrospective's own detail ("Authenticate at least one configured provider before running a retrospective."), which main
posts as one error notice per gesture carrying the action that opens Settings at Models; the same refusal at
`improvement.analyze` ends the job, and its reason reaches `PD-LIBRARY-002` (c)'s warning with no action
(`PD-LIBRARY-002` revision 5, OQ-300).
The **instruction files are decided by the run host, not by the engine**: `dispatch` passes
`skills.retrospectiveInstructionFiles(root)` — the same discovery and the same per-file and master switches that
workspace-context injection consumes (OQ-65), kept to the files discovered at the **workspace root**, so no file under
the global, home-relative or machine-wide bases reaches the analysis (`PD-LIBRARY-002` revision 2, OQ-235; until
2026-10-13 it passed `skills.instructionFiles(root)` whole) — on the capture input, and `captureRetrospectiveJob` reads
what it is handed and discovers nothing itself. An omitted set reads nothing rather than falling back to the workspace
root.
From there the path is the post-run one, unchanged: the same application-wide FIFO, the same `improvement.analyze`
(whose run-free branch takes its backend and `credentialFor` from the configured workspace rather than from
`improvementContexts`), the same `save-collected` to the workspace service, the same canonical reread and bump. Two
things differ at the ends. The artifact carries `source_kind: 'retrospective'` and a NULL `source_session_id`, naming
what it read in `considered_session_ids` and attributing each evidence entry to its own record. And
`improvement:activity` gains `pass`, which is what lets the two indicators (REQ-LIBRARY-125/126, built in this part and
not before) say WHICH analysis is running, and — since `PD-LIBRARY-002` revision 2 (OQ-236) — `retrospective_pending`,
which main computes **per main window** from the coordinator's `retrospectivePending(workspaceId)`, because the rest of
the publication is application-wide and this one fact is a workspace's. Since fin38 a main window that opens a workspace
(a launch, an added or replacement window, a hand-over, a reopen) is also sent the activity as it stands
(`ImprovementCoordinator.current()`, through `MainWindows`' `workspaceOpened` hook, after the window has loaded), and the
window **reads** the same once as it mounts, after subscribing (**`improvements.activity`**, renderer → main, answered once the
window's workspace is open with that workspace's own `retrospective_pending`), since a push sent before the root has
subscribed is lost — so a window opened while its workspace's retrospective is pending draws the gesture at rest at once
rather than at the next publication. It is the only thing that rests the gesture's two
buttons; a post-run analysis never does. `improvements.retrospective` itself refuses while that workspace's retrospective
is queued, running or still being captured, with one info notice ("A retrospective is already queued or running.") and no
`retrospective.capture`, which is the palette's refusal. `improvement.cancel`, the queue's ordering and shutdown's discard are
untouched: a retrospective is an ordinary job on the ordinary queue.

**The session artifact store (Part Y; REQ-LIBRARY-087..101, REQ-ORCH-149).** Renderer → main: `artifacts.list` (the
Library's Artifacts tab), `artifacts.body {ref}` (the inspector's load), `artifacts.save {ref, body}` (REQ-LIBRARY-133's
save, the body ONLY; since PD-LIBRARY-003 revision 2 the inspector shows the document's frontmatter read-only and sends it back
unchanged in front of the edited text, and the store writes the record's own frontmatter, with the new `edited_at`, in its
place). Main relays each to the run host as `artifacts.list {workspaceId}` → `artifacts.state {state:
{sessionId, artifacts[], warnings[]}}`, `artifacts.body {workspaceId, ref}` → `artifacts.body {id, slug, title, kind_,
status, producer, persona, edited, body, fallback}`, `artifacts.save {workspaceId, ref, body}` → `artifacts.saved {id,
editedAt}`. **No session id crosses**: REQ-LIBRARY-136 scopes the tab to the LOADED session, so the run host answers for
the session it holds and reports none when it holds none, rather than letting a renderer name a session that is not

loaded. A refusal carries REQ-LIBRARY-134's and REQ-LIBRARY-136's own sentences as its headline (`Unknown artifact:
'<id>'`, `Artifact not found in the loaded session.`, the load failure's reason). The bodies themselves never cross a
boundary as files: the run host reads and writes them beside the store (REQ-SESSION-002) and the renderer sees text. The
scripted client's step `artifact:<tool>[:<key>]` calls one of the three artifact tools with arguments from
`ROTARIS_SCRIPT_ARTIFACT_ARGS` (verification only).
