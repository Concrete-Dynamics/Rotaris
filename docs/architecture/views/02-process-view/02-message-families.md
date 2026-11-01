# Process view — five processes and what crosses each boundary — Message families

Part 2 of 8 of [the process view](../02-process-view.md), which indexes every part.

## Message families

**Per-launch board permissions (2026-09-13, REQ-TRACE-470/471).** The main-to-run-host `session.start`
accepts optional `boardPermissions: permissive`, produced by main's board coordinator after the existing
disclosure and preference checks. Renderer `session.start` retains its existing fields. The grant applies
to the captured configuration for that launch, including autonomous mode and the unsandboxed opt-in.
Board dispatch therefore crosses this boundary once to start the session. `config.liveState` continues
to carry the Settings surface's live values.

**Renderer → main (`CommandRequestSchema`).** `shell.hello`, `theme.get/set`, `prefs.get/set` (keys: the theme, the motion preference, the Settings tab, the pane layouts — `panels/overview/state`, `panels/git/state`, `panels/library/state` and (Part AB) `panels/workspace/state`, each naming one `PaneLayout` record that main reads and writes whole across REQ-SHELL-006's three registered keys, that state, the view's `panels/{view-key}/panes` and the one `panels/version` stamp (`PreferenceStore.readLayout` / `writeLayout`; a layout stored whole under `panels/<view>`, as it was until 2026-10-14, is carried over once, only at version 1, setting the stamp to 1), read against that view's current pane count in `platform`'s `PANE_LAYOUT_PANES` (two for every view today; until 2026-10-14 `prefs.get` read every view against a literal 2) — `interface/agentPopout` — REQ-SHELL-073's "agent pop-out", Part R, the key REQ-CONFIG-405 registers (until 2026-10-14 `interface/agentPopOut`, carried over once, `RENAMED_KEYS`) — and the transcript's three display preferences, all booleans registered in `platform`'s `PREFERENCE_KEYS`: `display/groupToolCalls` (REQ-CHAT-067's tool-grouping switch, default **ON**, Part Z; the key REQ-CONFIG-405 and REQ-SHELL-006 register — until 2026-10-14 stored as `display/groupTools`, which `PreferenceStore` carries over once, `RENAMED_KEYS`), `display/showReasoning` (REQ-CHAT-167, which names the key literally, default **off**, Part AA; read at startup since Part AA and **written since 2026-10-13** by the palette's "Toggle reasoning bodies", its slash mirror and Settings → Display, all through the renderer's `writeDisplayPref`), `display/autoCollapseTools` (REQ-CHAT-067, default **off**, Part AA); the Workspace's layout is REQ-CHAT-010's transcript/composer divider under REQ-SHELL-069's key rule, pane count 2), and **the requirements board's keys** (Part AK′; spec 08 §Persisted state, REQ-TRACE-301: `requirements/filter/{text,epic,source,lifecycle,health,priority}`, `requirements/sort`, `requirements/axis`, `requirements/blocked_column` — the person's display state, strings; `requirements/fullPermissionRuns`, `requirements/fullPermissionNoticeSuppressed`, `requirements/answerWaitSeconds` — REQ-CONFIG-405's, registered with the family and read by Part AP, never by the board; and ONE placeholder key `workspaces/{workspace}/requirementColumnFolds`, sent literally by the renderer and resolved by main to `workspaces/<digest of the open workspace>/requirementColumnFolds` — the same discipline as the composer draft, so a window can neither read nor write another workspace's folds, REQ-TRACE-312), **`composer.readDraft` / `composer.writeDraft {text}`** (Part AB, REQ-CHAT-015 / REQ-SHELL-159 / REQ-NOTIFY-066: the per-workspace composer draft. They carry **no key and no workspace** — main resolves `workspaces/{workspace-key}/composerDraft` from the workspace it opened, so a renderer cannot name another workspace's draft, which is what REQ-CHAT-015's last sentence forbids; the key family is registered in `platform`'s `PREFERENCE_KEYS` and minted only by `composerDraftKey`), `shell.openExternal {url}` (Part AA, REQ-CHAT-076 — see the row-renderer paragraph below), `window.openPersona {persona, agentId, focusSteer?}` / `window.personaPayload` (Part R: open or raise the persona window; the window reads its persona, the followed session and the instance to select — answered by main from the registry; a raise is a request, REQ-SHELL-161), **the terminal window's five (Part AL′; contracts `terminal.ts`, answered by main's registry, none reaching the run host): `window.openTerminal {streamId?}` (open or raise the main window's one terminal window, bringing the stream forward when retained — from the toolbar, the palette's Ctrl+Shift+T, a row's preview, a persona card's; REQ-SHELL-080/081/085), `window.terminalPayload` → `{sessionId, focusStream, autoOpen}` (the window asks what it was opened onto), `window.terminalSession {sessionId | null}` (the main window's renderer reports the session it follows; main closes the window and reopens it without focus when it had been open on a session — REQ-SHELL-110/111; refused `window.notMain` from any other window), `window.terminalAutoOpen {value}` (REQ-SHELL-109's preference, `interface/terminalPopout` in `platform`'s `PREFERENCE_KEYS` — the key REQ-CONFIG-405 registers; until 2026-10-14 `terminal/autoOpen`, carried over once — key-less on the wire like the composer draft), `window.showWorkspace` (REQ-SHELL-083's "Go to Workspace": the main window switches view and is surfaced as a request)**, `repository.read` (the Overview's card; relayed to the workspace service, waiting for a workspace open in flight),
`session.start/newId/list/resume/prompt/continue/subscribe/unsubscribe/reconcile/pageOlder/control` (`pageOlder`
is wired end to end and, from Part Z, is CALLED: the transcript asks for the next older span when the reader scrolls
toward the top, and the replica's `prependOlder` places it above — REQ-CHAT-165, REQ-SESSION-192; `resume` carries
`{sessionId}` and raises every refusal (the run host records a session's workspace only once the engine has loaded it, so a
refused resume moves nothing); *from 2026-10-14 until PD-SHELL-001 revision 3 the same day it also carried `fromNotice?`,
which logged a `focus-session` press refused `session.no-session` and raised nothing — withdrawn with the case it answered*;
**`session.focusFromNotice {sessionId, workspace}`** (PD-SHELL-001 revision 3, OQ-292): a `focus-session` notice action,
pressed in any window — main reaches `workspace` (`MainWindows.reach`: the holder surfaced, else a window added) and asks THAT
window, on channel 16, to focus the session through its own `resume` (`MainWindows.focusSession`); a window still loading
holds the request on its record, and **`session.focusReady`** — sent by the renderer once it listens on channel 16 — marks it
listening and answers `{sessionId}`, the held focus delivered once, or null. A refusal of `session.focusFromNotice` — "The
window holding the session closed before it could focus it" (`window.gone`), "No main window is open" (`window.notMain`) — is
published by the pressing renderer as the hook review's is (`renderer/notice-action-refusal.ts`, REQ-NOTIFY-254/003, since
2026-10-15), a refused reach REQ-SHELL-019 already reported only logged; until 2026-10-15 it reached the renderer console
alone; `continue`
carries `{action, withoutPaused?}` since PD-ORCH-005's phase 5, the option clause 6's "continue without them",
relayed as it is to the run host's `session.continue`, which since clause 18 also continues a session a crash left),
**`session.retry {sessionId}`** (REQ-NOTIFY-045 / REQ-CHAT-173, OQ-178; 2026-10-02: a notice's retry with a blank composer draft, relayed to the run host as itself after the continuation lease a `session.prompt` takes; `Sessions.retry` resubmits the session's last submitted prompt — read over every row, released ones included (`lastSubmittedPrompt`) — with its images read back from the session's directory and verified by digest (`readBackAttachments`), so no prompt text or image bytes cross from the renderer again; answered `ack`, or refused `session.no-prompt`, `session.attachment-unavailable` naming the image, or any refusal a `session.prompt` meets), **`authRecovery.payload` / `authRecovery.retry {modelKey}` / `authRecovery.reauthenticate {apiKey}` / `authRecovery.cancel`** (REQ-NOTIFY-072..077/080, 2026-10-02: the recovery window's payload and answers, keyed by the SENDER as a pause window's are, so the window acts on the session it was opened for and names none; `retry` is relayed to the run host as `session.authRestart {sessionId, modelKey}` — refused for a key the dialog did not list; `reauthenticate` carries a pasted key INWARD to main's provider key store (`ProviderService.reauthenticateWithKey`, validated by discovery before it is saved, never logged) and then relays `session.authRestart {sessionId, modelKey: null}`; each answered `{ok}` or the sentence the dialog shows), **`session.planEdit {text}` / `session.planDecision {decision, changes?}` / `session.planRearm {sessionId}`**
(ADR-0062 and PD-ORCH-003, REQ-ORCH-152/153/154: the plan gate's three entries, relayed to the run host that owns
the session and answered `ack` / `{cycle, relaunched}` / `ack`. They are session commands and **not** control
operations, because `CONTROL_OPS` is REQ-MONITOR-004's closed enumeration over a LIVE run and a run held at the
gate is parked — the answer must reach a session whose hosting process may have exited since the gate opened.
`planEdit` records the user's text and approves nothing; `planDecision` carries one of exactly three answers;
`planRearm` drops the approval's release so the session's next run is held again, refused while a run is active and
a successful no-op on a session holding none — it addresses a session with no run at all, live or parked),
**`session.chooseNextModel {sessionId, modelKey}`** (REQ-MONITOR-146/194, 2026-10-02, fin10: the composer's "Model for the
next run" chosen, sent by `session-actions.ts`'s `setNextModel` once its `config.setField` write of `personas.<entry>.model`
succeeds and only with a session followed; relayed to the run host as itself and answered `ack`, or refused
`session.unknown-model` / `session.no-catalogue`. `Sessions.chooseNextModel` resolves the key through the side-effect-free
`restingCatalogue` port and clears the pair's exclusion if the session holds it out of quota — in its memory and a resting
read's, and as a `model_exhausted` entry carrying `cleared: true`; a session command for the plan gate's reason, no run
being needed),
`git.read`, `worktree.create/remove/chooseAttach/probePath` (Part O — see the Git paragraph below),
`pause.present/payload`, `approval.payload`, `approval.raise {requestId}` (Part AC, REQ-CHAT-098/103: the approval
trailer row shares the question trailer's one click handler, and an approval's modal is a separate window, so
"re-openable while pending" is main raising the dialog already up; refused when no dialog is open for that request —
a queued one never jumps the queue), `notice.acknowledge {noticeId?}` (Part V: an absent identifier clears
whatever is current, one given is a compare-and-clear — REQ-NOTIFY-026; since 2026-09-28 main asks the updater FIRST whether the notice being cleared is the update offer, and if so records its version as waved off before the clear, REQ-STARTUP-116/117, REQ-SHELL-114), **`notice.current`** (2026-10-14, ADR-0049 with PD-WORKSPACE-005's "shown in every open main window": every main window's renderer asks it once at boot, right after registering for channel 4 (since a later 2026-10-14 change, fin45, a persona, terminal or dialog window, which draws no notice, does not ask); main answers `{v, current}`, channel 4's shape, once the store's chain has applied every publication accepted before it, and the renderer seeds its store with it only if no publication arrived first — so a window built after a publication shows the notice; `docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md`), **`update.install` / `update.restart`** (the updater, first-release-plan.md §4.6, 2026-09-28: the targets of the `install-update` and `restart` notice actions. Neither carries anything — main holds the offer, runs REQ-STARTUP-122's sequence and reports into the same notice; `update.install` is `Update now` and `Try again`, `update.restart` is `Restart now`, and both are refused, not queued, while an update operation is in flight, REQ-STARTUP-114; since 2026-10-14, OQ-311, `update.restart` and the installer flavour's `update.install` first ask every open main window's unsaved-settings guard in turn — main sends each dirty window's renderer REQ-SHELL-124's question through `askRendererGuard`, at the click and again before the hand-off — and answer `{ cancelled }` with nothing started on a Cancel or a failed Save; since 2026-10-21, [OQ-361](../../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361) ruled 2026-10-20 point (a), the same closes then ask REQ-SHELL-119 guard (2) for the whole instance (REQ-NOTIFY-056) — after the unsaved-settings guard and before the run box, at the click and again at the hand-off (`integrationAllows`, `integrationAllowsUpdate` in `main/integration-guard.ts`) — and answer `{ cancelled }` with nothing started while main records an integration running or cannot read its record; `06-sequences.md`), **`reauth.submit {sessionId, apiKey}` / `reauth.dismiss {sessionId}` / `reauth.read`** (2026-10-02, the 401 note's part B: the two
answers of channel 13's prompt, and `reauth.read` answering `{prompts}`, every prompt open now, read by a window as it mounts so a reload or a new window draws them — main holds the prompt, saves a supplied key through the credential store
(~~`providers.replaceKey`~~ since the merge beside the recovery dialog `providers.reauthenticateWithKey`, the dialog's validate-then-save path with its refusing stage named; never logged), clears its first-failure bookkeeping and relays `session.repinPrimary` to the run
host, answering `{ok, applies}` or `{ok: false, message}`; the dismissal closes the prompt and keeps the fallback,
REQ-NOTIFY-071/078), **`notice.report {severity, title, message?, detail?, persistent, sessionId?}`** (Part AO: a renderer surface raising a PERSISTENT notice through main's one store — ADR-0049 decision B's missing entry for a renderer, defect fifty-seven, first needed by REQ-CHAT-021's "Command not run"; `sessionId` absent means the focused run and REQ-NOTIFY-268's record applies; answered `{id}`), **`prompts.roots.read`** (Part AO, REQ-CHAT-160: no workspace on the wire — main names the open one and relays to the workspace service, below), **`skills.read` / `skills.rescan` / `skills.forceLoad {name}` / `skills.loadFile {path?}`** (ADR-0063, REQ-WORKSPACE-051..073/151: none carries a workspace or a session — main names the window's open workspace and the session it follows and relays to the RUN HOST, which owns the catalog; the run host refuses all five with code `config.fatal`, the fatal report as the detail, while the saved configuration does not load (OQ-279, since 2026-10-14); `skills.loadFile` with no path opens the native chooser in main first, on REQ-SHELL-164's terms, and a dismissal answers `{cancelled: true}` having changed nothing), **`skills.list`** (REQ-CHAT-162's `/skills`, 2026-09-27: no argument — main refuses a window following no session before anything crosses (OQ-67), else relays `skills.list {workspaceRoot, sessionId}` to the run host, which writes the listing as ONE `system` row through that session's own writer and answers `skills.listed {count, index}`; the row reaches every window following the session on the transcript channel like any other row, so nothing is drawn from the answer), `workspace.backup/restore`,
**`workspace.choose`** (Stage B, REQ-SHELL-035 / REQ-WORKSPACE-016: the title-bar chip asking for the
project-folder flow. It carries **no folder and no window** — main evaluates REQ-SHELL-021's three gates in that
requirement's fixed order (gate 2, the worktree-integration decline, since 2026-10-15 over `noWorktreeIntegration`, which
answers none running while integration is deferred; `main/integration-guard.ts`; since 2026-10-21, [OQ-361](../../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361)
ruled 2026-10-20 and `PD-SHELL-009` revision 3, asked for the requesting window's own workspace — a window that holds no
workspace passes it, and a record main cannot read goes on to gate 3 with a `warn` line), opens the native chooser asynchronously (ADR-0019's application-wide prohibition on a
synchronous one) and interprets every answer the host can return, so no surface can skip a gate or name a folder
it was not given; the request is attributed to the window that sent it, REQ-SHELL-020. **`newWindow`** is
`PD-SHELL-001`'s add route, decided by the gesture before the chooser opens — a palette entry or the chip with the
platform's secondary-activation modifier — on which REQ-SHELL-021's three gates are not evaluated and no window is
closed; a folder another window already holds surfaces that window and builds none, on REQ-STARTUP-163's rule),
**`workspace.openFolder`** (fin10, REQ-SHELL-040: the status strip's workspace-path link; no path on the wire — main
opens the folder of the window that asked with `shell.openPath`, bounded at 5 s because an opener that cannot be launched
may never answer (`main/open-folder.ts`), and answers a failure as a refusal naming the path, which the renderer raises on
the transient error surface; OQ-191), **`workspace.usage`** (fin10, REQ-SHELL-044/045: the strip's tokens and cost, relayed
as the run host's `workspace.usage {workspaceId}`, answered `{tokens, cost}` by `workspaceUsage` over the workspace's stored
sessions; OQ-190), **`window.state` / `window.minimize` / `window.toggleMaximize` / `window.close`**
(PD-SHELL-003: the frameless main window's renderer asks main to operate the BrowserWindow that sent the command;
close calls `BrowserWindow.close()` so the existing guarded close event remains the only decision point),
`window.modality {active}` (Part W: the main window's application-modal surface — the command
palette, the keyboard help — registering itself open or closed; main's registry disables input in every persona window
of that family for the duration, ADR-0048; a persona window sending it is refused `window.notMain`),
`hooks.summary/review/reviewPayload/reviewDecide/clearDecision/setToggle` (**`hooks.review {workspace?}`**, ESC-34: the
unreviewed-hooks notice's `open-hook-review` hands its named workspace back, and main reaches it — `MainWindows.reach`
surfaces the window holding it, else adds one for it on PD-SHELL-001's route with no gate and no close (PD-SHELL-001
revision 2, OQ-267 ruled 2026-10-13), and where the holder is a window still opening that workspace (a second press during
the load of the window the first press added) waits for its open before acting, since 2026-10-14, and a holder left with
no workspace open (its store refused, OQ-281) is reached all the same, the surface answering in it — then
parents the review to that window; the dialog's payload keeps the workspace id its decision is stored against; without
`workspace`, the asking window's own. A refusal — "This workspace declares no hooks", "Open a workspace before reviewing its
hooks", "The review dialog could not be opened" — is published by the pressing renderer as a persistent `warning` notice
through `notice.report`, main's headline its title (`renderer/notice-action-refusal.ts`, REQ-NOTIFY-254/003, 2026-10-14); a
refused reach coded `workspace.buildFailed`/`workspace.openFailed` is only logged there, REQ-SHELL-019 having reported it;
until 2026-10-14 every refusal reached the renderer console alone), **`projectInit.open {workspace}`** (2026-10-14, [`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005)
revisions 2 and 3, OQ-262, OQ-294: a project-setup banner's `open-project-init`, activated in any window; main reaches the
workspace as the hook review does — `MainWindows.reach`, the holder surfaced on REQ-SHELL-161's terms, else a window added on
PD-SHELL-001's add terms — and asks the reached window for Settings › Project through `MainWindows.openProjectInit`: channel
15 at once to a renderer listening, held on the record of one still loading; a failed reach answers its outcome, the add
route having reported it. A refusal — "The window holding the project closed before Settings › Project could open"
(`window.gone`), or a refused reach — is handed by the pressing renderer to `reportNoticeActionRefusal`, which publishes the
first as a persistent `warning` notice and only logs the second (REQ-NOTIFY-254/003, since 2026-10-15; the console alone
before). *Under revision 2 (fin43, until the same day) main surfaced a holder through `surfaceHolding` and,
with none, raised "Project <name> is not open in any window." in the asking window and added nothing*), **`projectInit.ready`**
(PD-WORKSPACE-005 revision 3: sent by a main window's renderer right after it registers for channel 15; marks the window
listening and answers `{owed}`, whether an open was held for it, once),
`playbooks.catalogue`, `config.read/save/setField/liveState`, `providers.list/health/open/save/validate/signOut/
delete/refresh`, `provider.payload/signIn`. Main relays a session or hook command to the run host, a workspace or
config command to the workspace service, and answers preference, theme and **provider** commands itself (the
credential store lives in main). `provider.signIn` is the one command carrying a pasted key inward; no outcome
carries one back — the list shows the display mask. A sign-in that succeeds asks the workspace service
`config.bootstrap` (the starter `agents.yaml` if absent, then the load again; since 2026-10-03 the open has already
written it, so the answer is normally `exists`) and broadcasts `config:changed` (to each main
window's family with its own workspace's snapshot, `announceConfig`, since 2026-10-03). **`repository.read`
{workspaceRoot}` → `repository.state {gitAvailable, isRepository, branch, base, ahead, behind, touched, uncommitted, failed,
readMs}`** is the workspace service's answer for the Overview's repository card — ADR-0038's helper lives there and
nowhere else; every read bounded at 15 s, every failure an empty value (REQ-GIT-102).

**The Git view and the worktrees (Part O; ADR-0038's second execution).** Renderer → main: `git.read` → the whole
`GitViewState` (header, worktrees with the base tree by common directory — each row also carrying `upstreamAhead`, its
branch's commits ahead of THAT branch's own upstream from one `for-each-ref … %(upstream:track)` read, 0 with none, for the
status strip while it names an isolated worktree's branch (REQ-WORKSPACE-020; acceptance repair F8, 2026-10-03) — 30
history rows with the local flag; a
`gitAvailable: false` answer raises the fixed-identity notice `git.missing` "Working without Git", REQ-GIT-104);
`worktree.create {branch, path}` (the user's own path, REQ-GIT-115); `worktree.remove {path, force}` (a refusal Git
would lift with `--force` comes back as code `worktree.needs-force`, REQ-GIT-117); `worktree.chooseAttach` (main's
folder chooser, then the service's REQ-GIT-011 check); `worktree.probePath {path}` (answered by main from the
filesystem, for the dialog's live message); `session.newId` (main mints `randomUUID` and holds it for the next
isolated or attached start); and `session.start` gains `isolation {branch}` | `attach {path}` and `sandboxMode`. Main →
workspace service: `git.view {workspaceRoot}` → `git.state`; `worktree.create {workspaceRoot, branch, collisionSafe,
baseRevision?, target: path {path} | session {sessionId, subpath?}}` → `worktree.created {path, branch, baseBranch,
baseRevision}` | `refused` (the Git failure text as the headline); `worktree.remove {workspaceRoot, path, force}` →
`worktree.removed` | `refused {…, needsForce}`; `worktree.checkAttach {workspaceRoot, path}` → `worktree.attachable
{path, branch, baseBranch, baseRevision}` | `refused`. Main → run host: `session.start` gains `sessionId`,
`effectiveRoot`, `worktree` (REQ-GIT-015's binding) and `sandboxMode`; the binding is made BEFORE the run host is
asked, so a binding failure leaves no session behind (REQ-GIT-023 by construction). *Since 2026-10-13 (fin41):* an
isolated start first asks the service `config.read` and sends the snapshot's `worktreeStorageSubpath` as the session
target's `subpath` (REQ-GIT-073, REQ-CONFIG-068); a snapshot with `loadOk: false` refuses the start in main as
`session.configuration`, the load's report its detail, and nothing is created (REQ-GIT-071/138). An attach reads no
configuration. *Since 2026-10-06 (finacc2's A1):*
main sends `sessionId` on every start, minting the base tree's too, and marks it as the asking window's start
(`MainWindows.beginStart`) before the run host is asked, so the focus test reads a run that fails before the renderer's
`session.subscribe` as the focused session's (REQ-NOTIFY-032); the message's shape is unchanged. `SessionListItem` gains `worktree`
and `checkpointCount` (REQ-GIT-018); `SessionRecord` gains `worktreeBranch` for the status strip (REQ-GIT-122), and
since 2026-10-02 `sandboxBackend` beside `sandboxed` (REQ-SANDBOX-121: the backend the latest run was confined by, '' when
it was not; the strip's sandbox indicator reads both). A run of the session refused at the confinement gate republishes the
record with both cleared until a run of it starts (REQ-NOTIFY-061, `Sessions.refusedAtStart`); the row is not written. Also since 2026-10-02
`modelOverrides` (REQ-CHAT-006, REQ-SESSION-026): each configured model key a session-wide override replaces, with the key
it runs on, derived at every snapshot from the run's catalogue and the session's memory — for a session no run of this
process has started, from its workspace's catalogue read once where its timeline holds an override, through the
side-effect-free `SessionsDeps.restingCatalogue` port (the run host's `restingCatalogueOf`: the load, the live overlay and
the snapshot fold, never the per-run `configure` with its MCP configuration load and run maps), against a memory of its own
(`Sessions.modelOverridesOf`) — so the composer's model chip names what the next run starts with, as the inspector does at
rest; while a run is live the run-level agent's Model names **`entryModelKey`** instead (since 2026-10-03, REQ-MONITOR-052/066):
the key the live root's ladder cell runs on (`Run.entryModelKey`, the key the cell carries, `AgentResilienceCell.key`), null with
no live run. A child's `AgentRecord.model` and `contextLimit` likewise name the key its live ladder cell runs on, and measure
against that model, once a fallback or an override has moved it (`Run.childModel`, since 2026-10-03). At rest they come from
its row's `model_key`. The record's `wait` carries `excluded`
(REQ-MONITOR-194/303, since 2026-10-02): the configured keys the session holds out of quota, which the quota-wait chooser
annotates and leaves choosable. Since fin10 the same list rides outside a wait as **`excludedModels`** (REQ-MONITOR-194): from
the live run's memory (`Run.excludedModelKeys`), else — a session at rest — the memory its timeline rehydrates through the
same `restingCatalogue` read, now taken where the timeline holds a `model_exhausted` entry too (`Sessions.restingReadOf`);
the run header's Switch model, the inspector's Model field and the composer's next-run chip annotate each key with the
reason and leave it choosable (`annotatedModelOptions`, `packages/ui/src/model-options.ts`) — since 2026-10-03 choosable when
it is already the selector's value too: each excluded key is marked `rechoosable`, and the design system's searchable select
fires a choice of its current value for such a row alone (`choiceFires`), so the composer's chip showing the excluded
configured key sends `session.chooseNextModel` for it.
