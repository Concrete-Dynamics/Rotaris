# Reconciliation log — what each change did to the views

The views themselves say what is true now. This file is the chain of *what changed when*, moved out of
`README.md` on 2026-09-16 so that consulting a view before a change costs a page rather than a chapter.

Nothing here is deleted: every entry is the one the change that made it wrote, in the order it was written,
newest first. `docs/architecture/first-executions.md` and `codebase.md` hold the same history from the build's
side; this one is the views' side of it.

The entries from 2026-09-16 (the navigation pass) to 2026-10-13 were written in `README.md` and moved here verbatim on
2026-10-13 (fin41), less the navigation pass's closing line ("Everything reconciled before this date is in
reconciliation-log.md"), which here would point at itself. Since then each change writes its entry at the top of this file and moves only the date in
`README.md` (its maintenance rule, item 2).

---

Last reconciled with the code: **2026-10-14**

**A retrospective's lease requires its own model's provider (fin46, `fin46-accept1-11`; PD-LIBRARY-002 revision 5).**
`02-process-view.md`'s retrospective paragraph now says the refusal is on the sign-in provider of the retrospective's model
(`retrospective_model`, then `medium_model`), not the entry role's, with the old wording kept beside it. No package, edge or process
changed.

**A packaged build carries no scripted model client (fin46, `fin46-accept1-11`; OQ-312).** `02-process-view.md`'s run-host row
says the scripted client does not ship — `host.ts` builds it behind `__ROTARIS_SEAMS__`, and a `provider: scripted` entry is the
client's only where the seams are compiled in (`isScriptedProvider`) — with the old reading ("then with the fixed
`PACKAGED_SCRIPT`") kept beside it; `03-runtime-view.md` §1 gains "The model client a run is handed", which states the same at
`prepareRun` and that rule 4 (b)'s packaged launch runs against a loopback stub. No package, edge or process changed. The README's
date stays 2026-10-15, the later.

Last reconciled with the code: **2026-10-14**

**A refused hook-review notice action is said on screen (2026-10-14, fin46 `fin46-accept1-10`, C22; REQ-NOTIFY-254,
REQ-NOTIFY-003).** The process view's `hooks.review {workspace?}` entry and the sequences view's notice-action block say that the
pressing renderer publishes main's refusal as a persistent `warning` notice (`renderer/notice-action-refusal.ts`), a refused reach
REQ-SHELL-019 already reported excepted; until now it reached the console alone
(`docs/defects/fixed/a-refused-hook-review-notice-action-is-reported-only-to-the-renderer-console.md`). The README's date stays
2026-10-15, the later one.

**The update's closes ask every window's unsaved settings (fin46, `fin46-accept1-9`; OQ-311).** `02-process-view.md`'s
`update.install` / `update.restart` entry and `06-sequences.md`'s update block now say that `Restart now`, and the installer
flavour's `Update now` / `Try again`, ask REQ-SHELL-124's Save/Discard/Cancel of every open main window in turn
(`UpdaterDeps.confirmUnsaved`, `askUnsavedInTurn`) at the click before OQ-86's run box and again first at the hand-off, a
Cancel starting nothing; the renderer's guard joins a question already open. The README's date stays 2026-10-15, the later.

Last reconciled with the code: **2026-10-15**

**The quit outside any window's second log line no longer reads as the first's opposite (2026-10-14, fin46 `fin46-accept1-8`,
C4; PD-ORCH-005 clause 9, OQ-298).** The process view quotes the new line, "each close guard allows without a question, so no
Save/Discard/Cancel or active-run box is shown", with the old "no close guard is asked" beside it
(`docs/defects/fixed/the-quit-log-says-it-closes-through-close-guards-beside-saying-none-is-asked.md`). The README's date
stays 2026-10-15.

**The quit outside any window's `before-quit` handler moves into `exit.ts` (2026-10-14, fin46 `fin46-accept1-8`, C3;
PD-SHELL-009 revision 2, PD-ORCH-005 clause 9).** The process view's quit paragraph names `QuitOutsideAnyWindow`
(`main/exit.ts`), the handler `main/index.ts` held inline until now, and what it holds and lets go. Behaviour unchanged;
unit cases in `exit.test.ts` pin it and its wiring
(`docs/defects/fixed/no-unit-test-pins-the-before-quit-wiring-of-a-quit-outside-any-window.md`). The README's date stays
2026-10-15, the later one.

**A pane layout is read against its own view's pane count (fin46, `fin46-accept1-7`, finding C18; REQ-SHELL-069).** The
process view's `prefs.get` entry names `platform`'s `PANE_LAYOUT_PANES`, each view's current pane count, which main's read
now passes to `PreferenceStore.readLayout` in place of a literal 2
(`docs/defects/fixed/the-pane-layout-read-assumes-two-panes-for-every-view.md`). Every view still has two panes. The date
above stays: this change was made on 2026-10-14 UTC, and the later date is kept.

**PD-TOOLS-001's PowerShell capture run on Windows (the Windows ARM64 session's B2).** A comment in `snapshotCommand` and
new test cases only; no view changed.

**Every PowerShell command takes the guarded payload (the Windows ARM64 session's B3; REQ-TOOLS-097/179).** `wrapCommand`'s
PowerShell branch no longer splices a single-line command raw into the line: one line or many, the command is carried as
base64, parsed alone, then dot-sourced in a `try` with its flag's line appended. No view changed: the wrapper's spelling is
none of the maintenance rule's triggers, and the runtime view names the marker protocol, not its PowerShell text. Recorded
because the code changed (`docs/defects/fixed/a-single-line-powershell-command-that-throws-loses-its-end-frame.md`).

Last reconciled with the code: **2026-10-14**

**A run's unreviewed-hooks notice with no recorded root names no workspace (fin45, `fin45-optional-findings`; OQ-293).**
`runNoticeReport` raises a `hooks.review` notice the run host could not stamp with the engine's words and no action, where it used
to review the active window's workspace. `04-seams.md` (a notice raised at two sites).

**A skills request is refused from the read that found the file unloaded (fin45, `fin45-optional-findings`;
`../../defects/fixed/a-skills-request-throws-when-the-configuration-stops-loading-between-its-two-reads.md`).** `SkillHost.state`
and `forceLoad` throw `SkillsUnloaded` carrying the fault; `dispatch.ts`'s `skillsAnswer` answers each of the five `skills.*`
requests with OQ-279's `config.fatal` refusal from it. `03-runtime-view.md` §8.

**The run host's three session events are built beside their stamp (fin45, `fin45-optional-findings`).** `runResultEvent`,
`runNoticeEvent` and `reportNoticeEvent` (`run-host/session-roots.ts`) build `run.result` and the two `notice.publish` shapes
`host.ts` sends, each through `withSessionRoot`; no behaviour changed. `02-process-view.md` (`notice.publish`) and
`05-state-ownership.md` (`sessionRoots`).

**Only a main window asks for the current notice at boot (fin45, `fin45-optional-findings`).** `renderer/shell.ts` sends
`notice.current` under the main role alone; persona, terminal and dialog windows import the module and draw no notice.
`02-process-view.md` (`notice.current`) and `05-state-ownership.md` (the renderer's copy of the notice).

**A window's renderer that starts a new document listens again only once it says so (fin45, `fin45-optional-findings`).**
`MainWindowAdapter.onNavigated` (Electron: the main frame's `did-start-navigation`, not same-document) clears a window record's
`listening`, so a session focus or Settings › Project request made while the renderer reloads is held for it, not sent to a
document with no listener. `05-state-ownership.md` (the window-requests row).

**A notice action reaches a window whose store was refused (fin45, `fin45-optional-findings`;
`../../defects/fixed/a-notice-action-reaching-a-window-whose-store-was-refused-answers-an-unreported-failure.md`).**
`MainWindows.reach`, after waiting on a holder's open, refuses only a window that is gone; one that stands with no workspace id
is reached, and the action's surface answers in it. `02-process-view.md` (`hooks.review`) and `06-sequences.md` (the readiness
paragraph and the notice-action section).

**A merged-document fault names the file that stated it (fin45, `fin45-config-and-terminal`;
`../../defects/fixed/a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md`).** `resolveMerged` attributes each
fault its typed section readers raise to the scope file stating the longest prefix of the fault's path (`statingFile`), not
to the workspace `agents.yaml` whatever file declared it (REQ-CONFIG-478). `03-runtime-view.md` §8.

**A quit from outside any window asks no close guard (fin45, `fin45-supervision-and-quit`; OQ-298, `PD-SHELL-009` revision 2).**
`before-quit` feeds `closeThroughGuards` with `quitGuardsOutsideAnyWindow`'s guards (`main/exit.ts`): each open main window's own
`confirm` and `close`, an `ask` that allows at once, and one more log line. `02-process-view.md` (the quit paragraph and the
person's-close paragraph) and `03-runtime-view.md` (the application's end).

**A parent's silent wait on its children is no stuck report (fin45, `fin45-supervision-and-quit`; PD-ORCH-009 revision 5,
OQ-296; `../../defects/fixed/a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn.md`).**
`IterationChildren.runWithChildren` withdraws a pending `stuck` trigger as it takes a parent into the wait on its pending or
unobserved children, so the reports are the one message the run adds for that turn. `03-runtime-view.md` §3 (the fourth
`withdrawStuck` caller) and §2 (`part-h-proof`'s `silent-wait` launch).

**A packaged build answers none of the scripted model client's variables (ADR-0056's seam check; fin45,
`fin45-seams-ui-and-live`).** The run host reads the dialect switch (`scriptedDialect`, `run-host/configuration.ts`) and every
script variable of `run-host/scripted-client.ts` behind `__ROTARIS_SEAMS__`; without it the client's orchestrator takes
`PACKAGED_SCRIPT`. `scripts/lib/seam-check.mjs` names them all. The **process view**'s run-host row says so. No package, edge,
process, channel, command or store column changed.

**The agent pop-out, terminal auto-open and pane-layout preferences are stored under their registered keys (fin45,
`fin45-retro-and-record`; `../../defects/fixed/the-agent-pop-out-terminal-auto-open-and-pane-layout-preferences-are-stored-under-unregistered-keys.md`).**
`interface/agentPopOut` became `interface/agentPopout` and `terminal/autoOpen` became `interface/terminalPopout` (REQ-CONFIG-405,
REQ-SHELL-006); each pane layout, one object under `panels/<view>` until now, is stored across the table's `panels/version`,
`panels/{view-key}/state` and `panels/{view-key}/panes` by `PreferenceStore.readLayout` / `writeLayout`, and named on the wire
by its state key. `PreferenceStore` carries a value stored under any old name over once. `02-process-view.md` (the renderer's
preference keys, the terminal window's preference).

**The retrospective's authentication refusal names the retrospective (fin45, `fin45-retro-and-record`; `PD-LIBRARY-002`
revision 5, OQ-300).** `leaseOver` takes its refusal's detail from its caller, so `leasedSetup` refuses "before running a
retrospective" while a continuation keeps "before continuing this run"; main's `improvements.retrospective` posts
`session.provider-auth` as one error notice per gesture with the "Open Models settings" action, and the failure warning's
detail ends in a single period whatever its reason ends in. `02-process-view.md` (the retrospective pass's refusals).

**The tool-grouping preference is stored under its registered key (fin44, `fin44-hooks-and-config`;
`../../defects/fixed/the-tool-grouping-preference-is-stored-under-a-key-the-specification-does-not-register.md`).**
`display/groupTools` became `display/groupToolCalls` (REQ-CONFIG-405, REQ-SHELL-006) in the preference table, the command
contract, channel 4's display preferences and the renderer; `PreferenceStore` carries a value stored under the old name over
once. `02-process-view.md` (the renderer's preference keys, the display-preference broadcast) and `03-runtime-view.md` §8.

**The readers outside a run's load follow OQ-279 (fin44, `fin44-hooks-and-config`;
`../../defects/fixed/the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md`).** The run host's
`skills:` and instruction readers answer the fatal report, never the shipped defaults; the five `skills.*` requests refuse with
`config.fatal`; the requirements queue starts nothing on an unloaded configuration and re-reads the file at each claim.
`02-process-view.md` (the `skills.*` refusal) and `03-runtime-view.md` §8 (the readers under a fatal load).

**The unreviewed-hooks notice names its project, built alike at both sites (OQ-293; fin44, `fin44-hooks-and-config`;
`../../defects/fixed/the-unreviewed-hooks-notice-does-not-name-its-project.md`,
`../../defects/fixed/the-unreviewed-hooks-notice-folds-its-sentence-under-details-at-open.md`,
`../../defects/fixed/a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md`).** One composer,
`main/hooks-review-notice.ts`, for the open slot and the run's `notice.publish` (`main/run-notice.ts`); PD-WORKSPACE-005's naming
rule moved to `main/project-name.ts` and `recoveryFor` to `main/notice-recovery.ts`. No message changed: the run's notice names
the `workspaceRoot` the event already carried. `02-process-view.md` (`notice.publish`'s `workspaceRoot`) and `04-seams.md` §6
(a notice raised at two sites).

**A pass whose improvement collector failed reads as a failure (PD-LIBRARY-005, OQ-285; fin44, `fin44-improvement-failures`;
`../../defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md`).** Main's `stored` chooses an
empty artifact's notice through `emptyArtifactNotice`, which replaces `zeroProposalDetail`. A crashed or unparseable collector is
the pass's failure warning, and a timed-out retrospective's detail states its limit; the note prefixes are exported by
`@rotaris/contracts`. `03-runtime-view.md` (the post-run improvement state, a new paragraph on the notices).

**A window's boot read of the display preferences leaves alone what an announcement set meanwhile (REQ-CHAT-167,
REQ-CONFIG-403, PD-CONFIG-004; fin44, `fin44-optional-findings`;
`../../defects/fixed/a-windows-boot-read-of-the-display-preferences-can-overwrite-a-newer-announcement.md`).** No channel,
command or store column changed. The renderer's display store and its three writers moved from `renderer/shell.ts` into
`renderer/display-prefs.ts` (`createDisplayPrefs`); `02-process-view.md`'s channel-14 paragraph says the boot read yields to it.

**A rename's warm-up search is sent quietly (PD-MCP-004 clause 3; fin44, `fin44-optional-findings`;
`../../defects/fixed/a-rename-warm-up-that-loses-its-connection-raises-the-servers-unreachable-notice.md`).** No channel or
store column changed: `SessionConnections.call` gained an optional `{ quiet }`, which the MCP executor passes for the search
alone. `03-runtime-view.md`'s paragraph on the warm-up says a transport the search loses raises no unreachable notice.

**The cut-restore notice names a kept copy only when the open finds it (fin44, `fin44-optional-findings`;
`../../defects/fixed/the-cut-restore-notice-says-the-prepared-copy-is-kept-without-looking.md`).** One channel field changed:
`workspace.opened`'s `cutRestore.staging` is nullable, `null` when the prepared copy is not there at the open.
`02-process-view.md` says so where it names the field; the notice's wording stays decided in `main/store-notice.ts`
(`04-seams.md` §6, unchanged).

**A restore's step-9a origin write that fails returns through OQ-265's discard (fin44, `fin44-optional-findings`;
`../../defects/fixed/a-restores-origin-write-that-fails-rejects-with-the-staging-copy-left-behind.md`).** No command,
channel or store column changed. `03-runtime-view.md` §7's restore paragraph names the failed `origin.txt` write among the
failures that leave the store as it was and delete the staging copy.

**A packaged build answers the probe's three capture variables alone (ADR-0056's seam check; fin44).** `capture/probe.ts` reads
`_WAIT`, `_WAIT_MS`, `_END_VIEW`, `_END_VIEW_MS`, `_PROBE` and `_PROMPT_MS` behind `__ROTARIS_SEAMS__`, and the run host and the
workspace service read `_SKILLS_HOME` and `_INSTRUCTIONS_HOME` behind it; `scripts/lib/seam-check.mjs` names all eight. The
**process view**'s main row says so in place of the open note it named. No package, edge, process, channel, command or store
column changed.

**A renderer that is alive but does not answer cannot answer its close guard (PD-SHELL-010, OQ-297, the consortium's HR1;
fin44).** `askRendererGuard` (`main/main-windows.ts`) takes the main-window timers port and a `warn`, sends main's liveness probe
beside the guard's question every `RENDERER_LIVENESS_BOUND_MS` (5 000 ms), listens for `unresponsive`, and rejects "cannot
answer: unresponsive" on a probe unanswered at its bound or on that event; both callers (`createElectronMainWindowAdapter`'s
`guardClose` and `closeGuard` in `main/index.ts`, REQ-SHELL-021's gate 1) pass them. The driver gains `closeWindow`
(`BrowserWindow.close()`, the host's close). The **process view**'s quit paragraph and the **runtime view**'s application's-end
paragraph say so. No package, edge, process, channel, command or store column changed.

**A window built after a notice's publication shows it (fin44, `fin44-notice-reach`;
`../../defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md`).** A new renderer → main command,
`notice.current`, asked once at boot; the renderer's notice store gains `seed`. `02-process-view.md` (the command, channel 4)
and `05-state-ownership.md` (each renderer's copy of the notice).

**A project-setup banner for a project no window holds adds its window (PD-WORKSPACE-005 revision 3, OQ-294; fin44,
`fin44-notice-reach`).** `projectInit.open` reaches the workspace (`MainWindows.reach`) and asks for Settings › Project through
`MainWindows.openProjectInit`, held until the window's new `projectInit.ready`; `surfaceHolding` and `PROJECT_NOT_OPEN` are
gone. `02-process-view.md` (the renderer → main list, channel 15) and `04-seams.md` §2 (the fifteenth channel's paragraph).

**`focus-session` reaches the session where it lives (PD-SHELL-001 revision 3, OQ-292; fin44, `fin44-notice-reach`).** The
member carries `{sessionId, workspace}`; the run host stamps `run.result` and `notice.publish` with the session's recorded root
(`withSessionRoot`); main's `session.focusFromNotice` reaches the workspace and sends the reached window channel 16
(`session:focus`), held on a window still loading until its renderer's `session.focusReady`; `session.resume`'s `fromNotice`
is gone. `02-process-view.md` (the renderer → main list, the run host's events, channel 16), `03-runtime-view.md` (the
unfocused notices' action), `04-seams.md` §2 (sixteen channels, the hold-until-listening hand-off), `05-state-ownership.md`
(the per-window requests, `sessionRoots`), `06-sequences.md` (a notice action that names a workspace, with its sequence).

**A notice action's reach waits for a window still opening its workspace (fin44, `fin44-notice-reach`;
`../../defects/fixed/a-notice-action-reaching-a-window-still-opening-its-workspace-is-refused.md`).** A main window's
readiness (`workspaceReady`) is pending from `MainWindows.build` until its first open settles, and `MainWindows.reach` waits on
it for a holder with no workspace id. `02-process-view.md` (`hooks.review {workspace?}`) and `06-sequences.md` (the window
paints before the workspace opens) say so.

**Level 3 reads a blank line by having no visible character (PD-TOOLS-020, PD-TOOLS-014 and PD-TOOLS-016 revision 4, OQ-295;
fin44).** `matchEdit`'s level 3 measures the prefix on `old_string`'s first visible line and compares blank lines as blank;
`carryWindow` gains the `new_string` as given and writes a paired blank line as the window's own at level 3; `nearMissMessage`'s
level-3 sentence names the lines that hold a visible character when the window holds a blank one. The **runtime view**'s edit
paragraph says so. No package, edge, process, channel, command or store column changed.

**The run's own follow-up is the only message it adds for the turn it follows (PD-ORCH-009 revision 4, OQ-283 and OQ-284;
REQ-ORCH-105; fin44).** `withdrawStuck()` gains two callers: `IterationChildren.execute` before a delegated child's REQ-ORCH-095
re-prompt and `Run.turn`'s `correction()` before a plan correction, which also calls `noteUserInstruction()` (REQ-ORCH-105). The
**runtime view**'s turn paragraph names the three follow-ups and the root resumed with a child's report as unchanged (OQ-296),
and its answer re-prompt paragraph names `part-h-proof`'s `silent-correction` and `silent-child` launches. No package, edge,
process, channel, command or store column changed.

**A first store is made beside its place and renamed in; refusals in a refused workspace tell the truth (OQ-281, REQ-SESSION-089;
fin44).** The **runtime view**'s store-open paragraph gains `installFirstStore` (`.<identifier>.new`, the bounded rename, the
sweep of a stray sibling at the identifier's next open, dot-prefixed entries skipped) and the held refusal every command answers in such a window (the checkpoints'
`checkpoint.no-workspace` included); the **process view** says the
other workspace-scoped commands answer it. No package, edge, process, channel, command or store column changed.

**A store place holding no store is resolved in Settings › Project (OQ-281, ruled 2026-10-14 under R-072; fin44).** The **process
view**'s main ↔ workspace service paragraph gains `workspace.store.establish.assess/perform` and their two answers, the restore
admitted while `workspace.store-missing` is held (no `runs.active`; `RestoreAssessment.target.placeEmpty`), and the notice's
`open-settings`/`project` action withdrawn by the next open that succeeds. The **runtime view**'s store-open section gains the
resolution paragraph (`main/store-resolution.ts`, `packages/store/src/establish.ts`). New command `workspace.establishStore`; no
package, edge, process or store column changed.

**A retrospective leases and completes its setup as a run does (PD-LIBRARY-002, ADR-0065 decision 5; the live run at `ce5f952`,
F2; fin43).** `leasedSetup` (`run-host/launch.ts`) prepares the configuration, leases the providers it names and completes the
setup over those bearers; the run host's `retrospectiveSetup` calls it at `retrospective.capture` and again at a retrospective's
`improvement.analyze`, where both read the cached `configuredFor` setup before. The **process view**'s retrospective paragraph
says so. No package, edge, process, channel, command or store column changed.

**The answer re-prompt is the root's only message for the turn it answers (PD-ORCH-009 revision 3, OQ-282; fin43).**
`LoopSupervisor.withdrawStuck()` clears a pending `stuck` trigger and nothing else; `Run.turn`'s `correction()` calls it on the
root's supervisor before it returns `ANSWER_REPROMPT`. The **runtime view**'s turn paragraph says the root's re-prompted empty turn
is no stuck report, and names OQ-283 (a child's re-prompt) and OQ-284 (a pending trigger after a plan correction). No package,
edge, process, channel, command or store column changed.

**A notice's reach ruled; a `focus-session` press for another workspace's session not dispatched; one approvals list per
session (fin43, `fin43-notices-and-config`; OQ-267 ruled 2026-10-13 under R-072).** The **process view**'s hook-review
paragraph cites `PD-SHELL-001` revision 2 (OQ-267, ruled 2026-10-13 under R-072) where it called the add provisional. `session.resume` gains
`fromNotice`: main answers a notice's load of a session the window's store does not hold by logging it and raising no notice,
and the run host records a session's workspace only after the engine has loaded it. The approvals column is written from the
run's list over every port (`Run.pendingApprovals`). No package, edge, process, channel or store column changed. *(Added
2026-10-14 by fin44: one command did — `session.resume` gained `fromNotice`, as this entry's own text says.)*

**Project-setup banners act; a fatal configuration load is said at the open; the setup statement names what the build carries
(fin43, `fin43-notices-and-config`; OQ-262, OQ-279, OQ-261 ruled 2026-10-13 under R-072).** The **process view** gains the
`projectInit.open {workspace}` command, channel 15 `project-init:open` in its diagram and its main → renderer paragraph
(PD-WORKSPACE-005 revision 2), and the About disclosure's citation moves from OQ-261 to PD-STARTUP-006 with the first-use
fetches it now describes. The **seams view**'s channel count reads fifteen, with the reason this one was added. The **runtime
view**'s configuration section and the **sequences view**'s launch diagram carry the open-time fatal-load notice (OQ-279,
`main/config-fatal-notice.ts`). No package, edge, process or store column changed.

**The question mirror writes nothing after its port closed (fin43, REQ-SESSION-094).** `mirrorQuestions`
(`apps/desktop/src/run-host/tools.ts`) reads the approvals sink's `closed`, so a question that ends after its run's end
closed the port leaves `pending_questions` alone. The **runtime view**'s `sessions` row says so. No package, edge, process,
channel, command or store column changed.

**The artifact inspector shows the frontmatter read-only and a save writes the record's frontmatter (PD-LIBRARY-003 revision 2,
OQ-272; fin43).** `ArtifactInspector` holds a document's leading block apart from the editor (`artifact-frontmatter`, a bounded
read-only region above it) and sends it back unchanged in front of the edited text; `ArtifactStore.editBody` writes the record's
frontmatter, with the new `edited_at`, in its place, through the same `withRecordFrontmatter` as `rerender`. An acknowledgement
takes the pointer only at its close control and its action (REQ-NOTIFY-020), so a press on its text reaches the inspector's Save
it stands over. The **process view**'s artifact-store paragraph and the **runtime view**'s `artifacts` row say so. No package,
edge, process, channel, command or store column changed.

**A retrospective's artifact stays out of a later run's analysis history (PD-LIBRARY-002 revision 3 (h), OQ-271; fin43).**
`captureImprovementJob` (`engine/src/improvements/capture.ts`) drops every prior artifact whose `source_kind` is `retrospective`
before REQ-LIBRARY-034's bound of five, so every artifact supplied has a source session and `considered_session_ids` names each.
The **process view**'s post-run analyst paragraph says so where it said a retrospective's artifact was history naming no session
and that OQ-271 asked. No package, edge, process, channel, command or store column changed.

**Main's two seams not named `ROTARIS_CAPTURE_*` are read behind `__ROTARIS_SEAMS__` too (ADR-0056; fin43's review).**
`ROTARIS_ROWS_PROOF` and `ROTARIS_INIT_TEST_TASK` (`main/index.ts`) gain the flag on their line and join the seam check's
`forbidden` list. The **process view**'s main row names them. No package, edge, process, channel, command or store column
changed.

**Main's remaining capture seams are read behind `__ROTARIS_SEAMS__` (ADR-0056, REQ-HOOKS-104; fin43).** Twenty-two reads in
`main/index.ts`, `main-windows.ts` and three command facets gain the flag on their own line; the seam check's lists move to
`scripts/lib/seam-check.mjs` and name them. The **process view**'s main row says so and names the probe's and the children's
variables still answered by a packaged build. No package, edge, process, channel, command or store column changed.

**A main window whose renderer is gone no longer holds its close or the application's quit (REQ-SHELL-119, PD-ORCH-005
clause 9; fin43).** The renderer's close guard is asked through `askRendererGuard` (`main/main-windows.ts`), which rejects —
so the guard allows — when the renderer has crashed or its contents are destroyed, and when either happens while it is asked.
The **process view**'s quit paragraph says so and names the hung renderer it does not cover. No package, edge, process,
channel, command or store column changed.

**Channel 14, `display:changed`: every window follows a stored display preference (fin43, REQ-CHAT-167, REQ-CONFIG-403).**
`prefs.set` announces each of the three transcript display preferences it stores to every live window
(`announceDisplayPreference`, `main/commands/shell.ts`); each renderer folds it into `displayPrefs` (`displayPreferencePatch`,
`packages/ui/src/display-host.ts`), so a persona window already open follows a change made in the main window. The **process
view** gains the channel in its diagram and its main → renderer paragraph; the **seams view**'s channel count reads fourteen,
with the reason this one was added rather than carried. No package, edge, process, command or store column changed.

**The transcript search panel holds its Escape slot, and the toolbar has a search control (fin43, REQ-SHELL-055, REQ-CHAT-074).**
The pane registers the `searchPanel` closer in `shell-state` while its panel is open (`searchPanelCloser`, `transcript/search.ts`),
so window-level Escape closes the panel and refocuses the composer before the drawers; the walk over the slots is
`resolveWorkspaceEscape` (`commands/useCommandShortcuts.ts`). The transcript toolbar gains `TranscriptSearchControl`, which
runs the registry's "Search transcript". The **state-ownership view**'s shell-state row and the **component view**'s
`search.ts` entry say both. No package, edge, process, channel, command or store column changed.

**OQ-263 ruled: a session storage directory that contains the requirement checkout container loads (fin43, R-072).** The
**runtime view**'s `worktree_storage_subpath` sentence names the ruling (confirmed as built) where it said the question was
open. No behaviour, package, edge, process, channel, command or store column changed.

**Match level 3 compares each line without its carriage return (PD-TOOLS-019, PD-TOOLS-014 revision 3, OQ-280; fin43).**
`matchEdit`'s level 3 sets one trailing `\r` aside on both sides, and the level-3 near miss names differing line endings. The
**runtime view**'s file-tools paragraph says both. No package, edge, process, channel, command or store column changed.

**A symbol rename is preceded by a reference search of the same symbol (PD-MCP-004, OQ-273; fin43).** The binding manifest gains
`warmUps` (the rename warmed by the referencing-symbol search, with `name_path` and `relative_path`), refused by the generator
unless the server lists both tools with both arguments; `codeIntelligenceWarmUp` reads it, and the run host's MCP executor sends
the search before every rename to the bundled server, inside the rename's one allowance, writing no record. The **component
view** names the field and the check, the **runtime view**'s code-intelligence paragraph the send and its allowance, and the
**seams view** an invariant for a request the run host sends a server on its own. No package, edge, process, channel, command
or store column changed.

**The store notices' words move into `main/store-notice.ts` (OQ-266, REQ-SESSION-202; fin43's review).** The cut-restore info
notice and the held store refusal were composed inline in `openWorkspaceInner`, untested; they are decided in a pure module
beside main's other notice modules, with a test. The **seams** view's notice section names it. No package, edge, process,
channel, command or store column changed.

**A restore cut between its renames is reversed at the next open; a store place with no database is refused (OQ-266, ruled
2026-10-13 under R-072; REQ-SESSION-201, REQ-SESSION-202, W-31; fin43).** The restore writes `<identifier>.restore-pending`
before step 8; `openWorkspaceStore` reverses a cut restore from it and refuses a place that holds no store, both before
anything is created; `workspace.opened` gains the optional `cutRestore`. The **process view** names the journal on disk, the
new field and the three refusals; the **runtime view**'s §7 gains the store open; the **state ownership** view gains the
journal's row; the **seams** view's notice section says how main raises a store notice from the open's answer. No package,
edge, process, channel, command or store column changed.

**A restore that fails safely deletes its own staging copy (OQ-265, ruled 2026-10-13 under R-072; REQ-SESSION-201; fin43).**
`restoreStore` deletes `<identifier>.restoring-<n>` on every failure that returns with the store as it was, and lists it in
`leftovers` only after a failed reversal or a failed delete. The **process view**'s files-on-disk row says who deletes the
staging copy; the **runtime view**'s §7 gains a paragraph on the whole-store restore around the store. No package, edge,
process, channel, command or store column changed.

Last reconciled with the code: **2026-10-13**

**The requirement coverage report, a report-time tool (fin42, N90).** `tools/requirement-coverage/` (`pnpm req-coverage`) lists
every live shipping requirement's implementation, test and proof citations. The **component view** gains its section beside
the notices generator and the build-identifier writer. No package, edge, process, channel, command or store column changed.

**A hook-review notice reaches the workspace it names; `shell.switchView` is gone (ESC-34, REQ-NOTIFY-044; fin41, N86).**
`hooks.review` carries an optional `workspace`; the renderer's `open-hook-review` case sends the action's workspace instead of
comparing it with its own and opening nothing, and main's `openHookReview` reaches it through `MainWindows.reach` (the
holder surfaced, else a window added with no gate and no close, OQ-267) and parents the dialog to that window;
`hooks.reviewDecide` stores the decision against the dialog's own workspace id rather than the active window's. The
contract's dead `shell.switchView` member and main's `command.unimplemented` stub are deleted. The **process view**'s
command list says both. No package, edge, process, channel or store column changed.

**The scripted client calls any tool by key (fin42, N52).** The step `tool:<key>` takes `{ name, args }` from
`ROTARIS_SCRIPT_TOOL_ARGS`, an argument `@content_hash` filled from the newest hash a tool result carried
(`run-host/scripted-client.ts`, `withLatestHash`), which `edits-proof` drives `write_file`'s edit and insert and `haet_edit`
through on a generated CRLF fixture. The **process view**'s MCP-arguments sentence says so. Verification only: no package,
edge, process, channel, command or store column changed.

**A call the run cancels, driven in the built app (PD-TOOLS-013 revision 2; fin42, N51).** The run host reads one more seam
under `__ROTARIS_SEAMS__`, `ROTARIS_CAPTURE_THROW_ON_ABORT` (`run-host/throw-on-abort.ts`, applied where `tools.ts` builds the
native executors and where an MCP executor joins the callable map): a named tool's executor rejects once its call's signal
aborts, so `mcp-proof`'s `cancel-throw` launch reaches the gate's catch through the run host; `scripts/package.mjs`'s seam check
names it. The **process view**'s main row says so. No package, edge, process, channel, command or store column changed.

**A pending question is mirrored to the store for a crash's record and the listing (PD-ORCH-005 clause 9, REQ-SESSION-031;
fin41).** `sessions` gains `pending_questions` (v35), written by the run host each time a prompt is put or ends, read by
`recordCrash` (one `question_withdrawn` each) and the listing's `awaitingInput`, never back into the record. The **runtime view**'s
`sessions` row says so. No package, edge, process, channel or command changed.

**A restore is refused before its first step where a store it would create sits past the engine's path limit (ADR-0058
consequence 18, D11; REQ-SESSION-201; fin41).** `RestoreAssessmentSchema`'s refusal gains `path-too-long`; `restoreStore` answers
step `0-path-too-long` without asking the run host anything. The **process view**'s row for the restore's names says so. No
package, edge, process, channel, command or store column changed.

**A scripted root can end its turn with nothing (PD-ORCH-009; fin42).** The scripted client gains the verification-only step
`silent`, a call that ends `stop` with neither text nor a tool call (`run-host/scripted-client.ts`), which `part-h-proof`'s
`answerless` and `answer-when-asked` launches take to meet the answer re-prompt in the built app. The **runtime view**'s
re-prompt paragraph says so. No package, edge, process, channel, command or store column changed.

**The restore's assessment leaves the target's directory holding the files it found (ADR-0058 consequence 18, D8; REQ-SESSION-201;
fin41).** `assessRestore` opens the target through `openStoreForInspection` (`store/src/open.ts`): read-write where no `-wal`/`-shm`
is there, so its own close removes the two its open created, read-only where both are. The **process view**'s files-on-disk table
gains a row for the restore's names beside the live store (`.restoring-`, `.displaced-`, `.obstruction-`, `.assess-`). No package,
edge, process, channel, command or store column changed.

**A run's proposed technical requirement is accepted from the review (REQ-TRACE-427..433; fin41).** `accept-proposal` is a
record admitted in `review` (`decide`, `workspace/src/delivery/transition.ts`), its write made in the delivery service's
`beforeCommit` (`acceptProposal`, `workspace-service/delivery.ts`) through `requirements.source.write`'s units.
`BeforeCommitOutcome` gained `reason`, `ReviewPayload`'s proposals gained `acceptedAs` and `origin` (the link the write makes, which the review names), and the review pane draws one accept
control per proposal (`ProposalOffer`, `ui/src/requirements/panes/`). `accept-change-work`'s refusal names REQ-TRACE-411/412
in place of OQ-45. The **sequences view**'s board section says so. No package, edge, process, channel, command or store
column changed.

**A configured `worktree_storage_subpath` places session worktrees, and one inside the requirement checkout directory fails the
load (REQ-GIT-073, REQ-CONFIG-068, REQ-GIT-138; fin41).** An isolated start in main asks the workspace service `config.read` and
sends the snapshot's new `worktreeStorageSubpath` on `worktree.create`'s session target; a snapshot that did not load refuses the
start before anything is created. `worktreeStorageCollision` (`config/src/sections/requirements.ts`) is REQ-GIT-138's directory
half at load. The **process view**'s Git paragraph and the **runtime view**'s run-start sequence and `requirements:` passage say
so. No package, edge or process changed; the `ConfigSnapshot` contract gained one field and main one request at an isolated start.

**A run's analysis is captured beside a retrospective's artifact (REQ-LIBRARY-025/034, PD-LIBRARY-002; fin42).**
`captureImprovementJob` (`engine/src/improvements/capture.ts`) names in `considered_session_ids` the source session of each prior
artifact that has one, so a retrospective's artifact, which has none, stays in a later run's history and names no session; until
then its null made the job's parse throw and no later run's analysis was captured. The **process view**'s post-run analyst
paragraph says so (OQ-271 asks whether such an artifact belongs there; *ruled 2026-10-13 under R-072 and built 2026-10-14 by
fin43: the history holds post-run artifacts only, PD-LIBRARY-002 revision 3 (h), entry at the top*). No package, edge, process,
channel, command or store column changed.

**A scripted root can take up a continuation offer (PD-ORCH-004 revisions 3 and 4; fin42).** The scripted client gains the
step `continue:<persona>:<name>`, a `delegate` whose `continuation_of` names the newest offer its conversation was told
(`offeredTaskId`, `run-host/scripted-client.ts`, reading with the engine's `offersToldIn`), which `continuation-proof` drives
for a later iteration's root and a later run's. The **runtime view**'s Continuations paragraph says so. Verification only: no
package, edge, process, channel, command or store column changed.

**The approval dialog's scripted answer is a build-time seam, and answers by tool (fin42).** `presentNext` reads
`ROTARIS_CAPTURE_APPROVAL`, `_APPROVAL_MS` and `ROTARIS_CAPTURE_DIALOG_PNG` behind `__ROTARIS_SEAMS__`, parsed by
`main/capture/approval-answers.ts` (`<tool>=<answer>[,<answer>…]`, `none` leaving a dialog to its timeout), and
`scripts/package.mjs` refuses an artifact that keeps them
(`docs/defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md`). The **process view**'s main row says
so, and names the grip drag `capture/seams.ts` gained the same day (`ROTARIS_CAPTURE_GRIP_DRAG`, a real pointer drag of a
resize grip, read by `plan-gate-proof`). No package, edge, process, channel, command or store column changed.

**The iteration's checkpoint is captured after its `iteration_end` hooks (REQ-HOOKS-082; fin41, N68).** The **runtime
view**'s iteration-close flowchart and its "checkpoint at iteration close" paragraph put the hooks first and the capture
after them, in a `finally`; the old order and ADR-0039's falsified reason for it are kept beside the correction. No
package, edge, process, channel, command or store column changed; one run-loop step moved.

**Ctrl+F and the reasoning toggle join the one action vocabulary (REQ-SHELL-049, REQ-CHAT-167; fin41, N71).** The
**state-ownership view**'s shell-state row names the transcript search panel's opener the pane now registers, which the
registry's "Search transcript" calls after the switch to Workspace; the pane binds no chord of its own. The **process
view**'s `prefs.set` paragraph names the first writers of `display/showReasoning`: the palette entry, its slash mirror and
Settings → Display, through the renderer's `writeDisplayPref`. No package, edge, process, channel, command or store column
changed (`prefs.set` already accepted the key).

**The artifact inspector's Preview links open (ADR-0051 decision 4; fin41).** Both `<ArtifactInspector>` mounts
(`renderer/main.tsx`'s Library, `renderer/windows.tsx`'s persona window) pass the window's `openLink`, so a Preview link asks
for `shell.openExternal` as a transcript link does. The **process view**'s `shell.openExternal` paragraph names every surface
that asks for it. No package, edge, process, channel, command or store column changed.

**About & Legal carries REQ-STARTUP-160's network-activity disclosure (fin41).** A fourth section of `AboutSettings`, three
statements held as constants in the renderer bundle, so it draws with no fact from main and no network. The **process view**'s
About paragraph says it crosses no boundary. No package, edge, process, channel, command or store column changed.

**The scripted client's capture records the delegate catalogue and the first user message (fin42, N57).** The **process
view**'s row for the file `ROTARIS_CAPTURE_MODEL_REQUESTS` names now lists every field a line carries — `images` and `tools`
were already written and unlisted — and the two added: `delegateDescription` (the `delegate` tool's description as offered,
read by `delegation-proof` for OQ-229's narrowing) and `firstUser` (the call's first user message, read by `artifacts-proof`
launch 9 for PD-LIBRARY-003 (e)'s handoff), with the proofs that read it. The scripted client also gains the steps
`writeinfer` (PD-TOOLS-007) and `delegate:<persona>:<name>:followup` (a `session_id` follow-up). Verification only; no package,
edge, process, channel, command or store column changed.

**Windows-owed checks no longer cite IC-3 as their reason (fin41, record only).** The **process view**'s portable
update row and the **sequences view**'s update sequence said a real-artifact run was owed to the next Windows package
"(IC-3)"; IC-3 binds Linux and macOS artifacts, and what holds these back is a Windows x64 host and the pipeline R-071
deferred. Each keeps its tag with the correction beside it. No package, edge, process, channel, command or store column
changed. *(This is the first entry written here rather than in `README.md`.)*

**A snapshot reads a directory's file statuses in batches (OQ-245; fin39, from fin38's review).** `snapshotTree`
(`agent-tools/src/tools/observe.ts`) reads at most `SNAPSHOT_STAT_BATCH` (256) statuses at once and checks the file limit after
each batch, so a directory past the limit stops within one batch of it. The **runtime view**'s cut-off passage says so. No
package, edge, process, channel, command or store column changed.

**A window edit that lands on the file's own bytes is refused, and an insert keeps a CRLF file's line endings (PD-TOOLS-016
revision 3, OQ-260; PD-TOOLS-018, OQ-259; fin39).** `writeFileTool`'s edit branch compares the window path's result with the file
before `commit` and refuses an equal one through `windowNoOpMessage`; its insert branch goes through `carryInsert`
(`agent-tools/src/tools/files.ts`), which reads the shared `crlfLines`. The **runtime view**'s file-tools paragraph says so. No
package, edge, process, channel, command or store column changed.

**The Mission table's persona cell is bounded (REQ-MONITOR-274; fin38).** `.agent-table__persona` keeps one line and is cut
at `24ch` with an ellipsis, its `title` the whole name, so a long configured persona no longer widens the table. The **seams
view**'s timed-out-tag passage says so. Nothing else moved.

**A window that opens a workspace is told the improvement activity at once (PD-LIBRARY-002 revision 2 (e), OQ-236; fin38).**
`MainWindows.open` calls a new `workspaceOpened` dependency once the window's workspace id is set, and main sends that window
`ImprovementCoordinator.current()` with its own workspace's `retrospective_pending` (`sendImprovementActivity`,
`main/index.ts`), the publication's per-window rule. The **process view**'s improvement paragraph says so. No package, edge,
process, channel or store column changed: the snapshot rides the existing `improvement:activity` channel. **One command was
added by fin38's review**: `improvements.activity`, which the main window sends once as it mounts, after subscribing, because
the push alone could reach a renderer that had not subscribed yet; this entry said "no command" until then.

**A cross-file EDIT call's tree walk no longer blocks the run host (OQ-245; fin38).** `snapshotTree`
(`agent-tools/src/tools/observe.ts`) reads the tree through `node:fs/promises` and is awaited by `observeReach`, so other
agents' streams and results move while a project-wide call is observed. The **runtime view**'s cut-off passage says so. No
package, edge, process, channel, command or store column changed.

**A renamed code-intelligence EDIT tool is read as a write (REQ-MCP-005, REQ-MCP-015, REQ-ORCH-109; fin38).** `grantEvidence`
(`run-host/mcp.ts`) records, beside each server's granted callables, the reported name of every one that differs
(`McpGrantEvidence.renamed`, also stored in `children.granted_mcp`), and `editTierNamesOf` maps each code-intelligence callable
to that name, so `writeReadingOf` asks the manifest by it. The **runtime view**'s cut-off passage and its `children` row say so.
No package, edge, process, channel, command or store column changed.

**A sibling's whole answer reaches the next child, and `delegate`'s write-scope sentence ties file work to a writer
(PD-TOOLS-006 revision 9, OQ-256 and OQ-257; fin38).** `inheritedContext` and `priorAgentContextParts` (`engine/src/children/notify.ts`)
render both hand-off blocks under one 100,000-character budget per block (`HAND_OFF_BUDGET`, a new `kernel` export read by the
engine and by `agent-tools`), a cut answer ending in `handOffMarker`; `Spawned.inheritedCuts` and `DelegateOutcome.handOff` carry
the cuts to `handOffWarnings`. `delegate`'s description carries `WRITE_SCOPE_SENTENCE` and `HAND_OFF_SENTENCE`, and the
`write_scope` field `WRITE_SCOPE_FIELD_SENTENCE`. The **runtime view**'s delegate-description and inherited-context paragraphs and
the **state ownership view**'s inherited-block row say so. No package, edge, process, channel, command or store column changed.

**An exact or replace-all edit keeps a CRLF file's line endings (PD-TOOLS-017, OQ-254; fin38).** `carryExact`
(`agent-tools/src/tools/files.ts`) carries each level-1 or `replace_all` occurrence through `write_file` and `haet_edit`/`haet`,
reading `PD-TOOLS-016`'s test (`crlfLines`, now shared with `carryWindow`) on the lines the span touches; a carried result equal
to the file is refused; `replaceAllMessage` counts the written replacements; `applyMatch` became `applyWindow`, levels 2 to 4
only. The **runtime view**'s file-tools paragraph says so. No package, edge, process, channel, command or store column changed.

**The hand-over endpoint is part of the instance record (OQ-248 ruled under R-072; REQ-STARTUP-161, REQ-STARTUP-164; fin36).**
Below a temporary directory each claim attempt makes its own private socket directory (`placeSocket`, `mkdtemp`,
`platform/instance.ts`), removed with the socket by `closeEndpoint` when the attempt loses or the instance closes; a reclaim
removes a dead recorded process's socket with its record (`removeDeadEndpoint`). The **process view**'s instance-claim row and
the **sequences view**'s launch diagram (the handed-over branch) say so. No package, edge, process, channel, command or store
column changed.

**A window-match `write_file` edit keeps the file's line endings and unchanged lines (PD-TOOLS-016, OQ-246); a near-miss quote
whose text recurs is flagged (PD-TOOLS-014 revision 2, OQ-252; fin36).** `carryWindow` (`agent-tools/src/tools/files.ts`) runs
after `shiftNewString` for every single-window match above level 1, pairing at level 2 through `linePairs`, which
`diff.ts` now shares with `lcsChanges` (`commonEnds`, `tableWalk`); `nearMissMessage` counts each quoted window's level-1
occurrences (`levelOneLines`). `live-run.mjs`'s near-miss NOTE counts retries refused "Found N occurrences"
(`lib/near-miss-edits.mjs`). The **runtime view**'s file-tools paragraph says so. No package, edge, process, channel, command or
store column changed.

**The EDIT tier is the code-intelligence server's, in every reader (REQ-MCP-015, REQ-ORCH-109; fin36).** The run host's MCP
executor asks `codeIntelligenceEdit` only of a tool of the server named `code_intelligence`, by the name the runtime reports;
`writeReadingOf`, the report's edited files and facts (`ReportInput.editTier`) and `ProgressLog` are given the callables the
child's grant gives that server (`editTierNamesOf` in `engine/src/children/report.ts`, read from `ToolPort.grant()`), and a call
of another name is no EDIT call; before the grant is known the name alone decides, as before. The **runtime view**'s cut-off
passage and the **state ownership view**'s observation row say so. No package, edge, process, channel, command or store
column changed.

**The Mission table's persona cell does not wrap (fin36).** `shell.css` gives `.agent-table__persona` `white-space: nowrap`,
and `pnpm mission-proof` item 1f reads it on one line; the **seams view**'s timed-out-tag passage says so. Nothing else moved.

**A cross-file code-intelligence EDIT call lists every file it changed (OQ-245, XE1 ruled under R-072; PD-ORCH-004,
REQ-ORCH-108, REQ-ORCH-109; fin35).** The manifest's `editArguments` carry a `scope` (`argument`, or `reach` with `project` or
`path`); `codeIntelligenceEdit` (`config/src/mcp/code-intelligence.ts`) returns a reach call's base; the run host's MCP
executor runs such a call inside `observeReach` (`agent-tools/src/tools/observe.ts`), which snapshots what it can reach before
and after and leaves out what the `McpHost.writes` journal says other agents' native writes touched meanwhile (`tools.ts`
notes each); the result carries `observedPaths` through `Observation`, `PortToolResult` and the tool-result part, which the
model client never sends; `writeReadingOf` (`engine/src/children/report.ts`) and `ProgressLog` read it, and a call with none
is said ("may have changed files the record cannot name"). A walk that cannot be completed marks the result `unobserved`
(the same three carriers), so a call that erred unobserved is said too, never read as refused (the fin35 review). The **component view**'s manifest paragraph, the **runtime
view**'s cut-off and report-facts passages and the **state ownership view**'s progress-log row say so. No package, edge,
process, channel, command or store column changed; a tool-result part gained an optional field.

**Every call its run cancels reads `interrupted` and files no issue (PD-TOOLS-013 revision 2; OQ-238, GC1, fin34).** The
gate's catch, fetch's `transportFailure` and the MCP executor's catch record a call the run's signal cut off with failure kind
`interrupted`, each after its own deadline or allowance test, and REQ-SESSION-139's histogram derives such a record with no
`outcome_kind` to `interrupted` (`outcomeOf`). The runtime view's run-flow and `summary.md` passages carry it.

**The retrospective's start gesture rests only while a retrospective is pending in its workspace (PD-LIBRARY-002
revision 2 (e); OQ-236, fin34).** `ImprovementActivitySchema` gains `retrospective_pending`; the coordinator
(`main/improvements.ts`) answers `retrospectivePending(workspaceId)` from its queue and active job, and main's broadcast
sends each main window its own workspace's answer; `improvements.retrospective` refuses with one info notice while it holds
or while a capture is in flight; the Library tab and the Overview card draw one `RetrospectiveGesture` that reads it in place
of `active`. The **process view**'s retrospective paragraph and the **state-ownership view**'s queue row say so. No package,
edge, process, channel or store column changed; the channel's payload gained a field with a default.

**The retrospective reads the workspace root's instruction files only (PD-LIBRARY-002 revision 2; OQ-235, fin34).**
`SkillHost.retrospectiveInstructionFiles` (`run-host/skills.ts`) keeps the `workspace:` entries of the enabled set the one
computation decides, and `dispatch`'s `retrospective.capture` passes it where it passed `instructionFiles` whole. The
**process view**'s retrospective paragraph and the **runtime view**'s context-unit paragraph say so. No package, edge,
process, channel, command or store column changed.

**A level-3 `write_file` edit carries the window's shift into `new_string`, writes it as given, or refuses (PD-TOOLS-015;
OQ-233 ruled under R-072; fin35).** `shiftNewString` (`agent-tools/src/tools/files.ts`) decides a single level-3 window's
replacement from the indentation of `new_string`'s first visible line, reading `EditMatch.shifts`; `writeFileTool`'s edit
branch applies the result or refuses through `nearMissMessage`, which now takes the tool's wording (`NearMissVoice`; `haet_edit`'s
replies are unchanged). The **runtime view**'s file-tools paragraph says so. No package, edge, process, channel, command or
store column changed.

**The loop-classification call is capped at the activation budget (REQ-CONFIG-467, REQ-NOTIFY-100, REQ-NOTIFY-106; fin35).**
`LoopSupervisor.classifyWithinBound` arms its timer at the smaller of `runtime.loop_classification_timeout` and what remains of
`LOOP_ACTIVATION_BUDGET_MS` (2,000 ms) counted from the `observe` that armed the trigger (the supervisor now takes the monotonic
clock beside the timers, `SupervisorRegistry(…, clocks)`); with nothing left it dispatches no call and the fallback decides.
The run host hands the classifier's model request the 2 s ceiling; the runtime view's §3 says so. Pinned by
`supervisor.test.ts` and `pnpm part-h-proof`'s `raw-count-long-bound` launch.

**REQ-ORCH-089's stalled tag takes a line of its own in the narrow rows (fin35).** A tree row's meta label is
`.agent-row__meta--stacked` while the agent is stalled as well as when it timed out, and the Mission table's state cell puts
the stalled tag under the state as it does the timed-out tag; beside the state the tag squeezed the 235 px sidebar row's
persona to 41 px and two lines and scrolled the Mission card 32 px sideways. The seams view §8 says so; `agent-clock.test.ts`
and `pnpm mission-proof` item 1f pin it.

**A delegated agent cut off at its per-agent timeout says so where its failure shows, and names the control (PD-CONFIG-003
revision 3, REQ-MONITOR-040, REQ-MONITOR-044, REQ-MONITOR-052, REQ-MONITOR-069; OQ-234 ruled under R-072, fin33).**
`AgentRecord` gains `timedOut` (`{ limitSeconds, makingProgress } | null`), which `toAgentRecord` derives from the stored
report (`timedOutOf` in `packages/engine/src/children/cut-off.ts`, reading the error the settle now writes through
`childTimedOutMessage`); the tree and Mission-table rows draw a `tag-fail` "timed out" on a line of its own under the state
(`.agent-row__meta--stacked`, measured so the sidebar's persona keeps its width), and the inspector and the persona window's
instance tab the line `timeoutLine` (`packages/ui/src/agents.ts`) words, drawn by `TimeoutLine.tsx` with the control's path on
one line, whose path is built from the labels Settings renders (`RUNTIME_CATEGORY_LABEL`, `PER_AGENT_TIMEOUT_LABEL` in
`settings/config-state.ts`, and the rail's `Settings`); `pnpm mission-proof` item 1d shows it. The
**runtime view**'s agent-record paragraph, the **state ownership view**'s cut-off row and the **seams view** §8 say so. One
field on the existing session-record channel; no package, edge, process, command or store column changed.

**The raw-count fallback reads four consecutive calls as evidence only when they are the same action (PD-ORCH-016; OQ-232,
the a68f121 duress run's D6, fin32).** `rawFallbackHasEvidence` (`engine/src/run/supervisor.ts`) compares the last four tool
events by `fingerprint` (the name and the whole arguments) where it compared the name. The scripted client gains a
verification step, `reads4`, which `part-h-proof` drives. The **runtime view**'s turn-loop paragraph says so. No package,
edge, process, channel, command or store column changed.

**A failed child's Outcome line says whose outcome it is (OQ-217; the a68f121 duress run's D9, fin32).** `outcomeLine`
(`engine/src/children/report.ts`) heads the line "Outcome of this agent, not of the session:", and the summarising ask names
the agent and forbids a first sentence about the run or the session failing. The **runtime view**'s report paragraph says
so. No package, edge, process, channel, command or store column changed.

**A child's code-intelligence EDIT-tier writes are file-writing calls (PD-ORCH-004, REQ-MCP-015, REQ-ORCH-109; the a68f121
duress run's D1, fin32).** `writtenPathsOf` (`engine/src/children/report.ts`) is the one reading of the paths a call writes:
the three native file tools by `path`/`file_path`, and the binding manifest's `edit` tier by the argument its new
`editArguments` names (`codeIntelligenceEditPaths`, `config/src/mcp/code-intelligence.ts`; a `dry_run` preview names none).
`ProgressLog.completed` (the cut-off's changed paths) and `editedFilesFrom` (the report's edited files, its facts, the
fallback's "Files touched") both read it; `write-scope.ts` keeps PD-TOOLS-006's fence on the native tools
(`isNativeFileWritingTool`). The **runtime view**'s REQ-ORCH-088 and report paragraphs and the **component view**'s
code-intelligence manifest paragraph say so. No package, edge, process, channel, command or store column changed.

**Each closed iteration writes its `iteration_end` timeline entry, which the follow-up payload's "Recent iterations" reads
(REQ-SESSION-115, REQ-ORCH-139, REQ-ORCH-067; live-run finding P4, fin31).** `Run.iterate` appends it after
`writer.endIteration` with the iteration's number, task title, outcome and summary; `buildContinuationPayload` already read
the last five, and found none. The **runtime view**'s loop diagram and its continuation paragraph say so. No package, edge,
process, channel, command or store column changed.

**A root that answers with its plan open is corrected in its own conversation; a held answer is carried and announced
(PD-ORCH-015, PD-ORCH-009 revision 2, REQ-ORCH-075, REQ-ORCH-078; OQ-225 ruled under R-072, fin31).** `Run.turn`'s correction
closure counts to `max(1, RunConfig.validationRetries)`, keeps the execution's `answer` (the re-prompt now fires only while it
is empty) and reports it when the correction's turn writes less; `planCorrectionText(open, answered)` asks for each item's
true state. `Run.iterate`'s plan-open branch stores `Task.heldAnswer` (6,000 characters) beside `planLeftOpen`, writes a
`system` row (`planHeldRowText`) and hands the answer to the task's next fresh root (`planCarryText(open, heldAnswer)`). The
**runtime view**'s loop diagram and its two paragraphs say so. No package, edge, process, channel, command or store column
changed (the planner todo's JSON gains one optional task field inside the existing column).

**A terminal call its run cancels reads `interrupted` (PD-TOOLS-013, REQ-TOOLS-100, REQ-TOOLS-112, REQ-SESSION-136; OQ-226
ruled under R-072, fin31).** `ForegroundResult` gains `cancelled` (`'before'`, `'during'`); both abort branches of
`ForegroundSession.run` return no exit code and `timedOut: false`, and `terminal/index.ts` assigns the failure kind
`interrupted` (`INTERRUPTED_FAILURE_KIND`), `InterruptedError`, `is_error` true at severity `warning`, and a detail that the
run cancelled the call; `classify.ts` adds the kind to both vocabularies. The gate's existing `interrupted` branch marks the
result interrupted and files no issue, and the metrics count it under `interrupted`, not Timeouts. The **runtime view**'s
rest paragraph says so. No package, edge, process, channel, command or store column changed.

**Every agent is told what the product's own workspace directories are (PD-TOOLS-012 revision 2, OQ-230; finding D4 of the
final duress run at `a68f121`; fin32).** `PRODUCT_DIRECTORIES_UNIT` (`config/src/product-directories.ts`, built from
`WORKSPACE_SCOPE_DIR` and `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]`) is the fifth always-active context unit: `SkillHost.contextUnits`
(`run-host/skills.ts`) pushes it last on every call, so every session-start path (`host.ts`'s `configure`, `dispatch.ts`'s
start) hands it to the entry agent and every child. The **runtime view**'s prompt-composition paragraph says so. No package,
edge, process, channel, command or store column changed; `@rotaris/config` gains one export.

**A `haet_edit` near miss names its level and quotes the file's lines (PD-TOOLS-014, OQ-231; finding D5 of the final duress run at `a68f121`; fin32).** `matchEdit` (`agent-tools/src/tools/files.ts`) returns an `EditMatch` whose level-3 result carries each window's `shifts` (the prefix, and whether the file carries it in addition to `old_string`'s); `haetEditTool`'s miss branch answers a single level-2 or level-3 window through `nearMissMessage` and leaves REQ-TOOLS-189's reply to a level-4 match or none. Nothing is written on either path. `live-run.mjs` counts the near misses and the terminal probes after them (`lib/near-miss-edits.mjs`). The **runtime view**'s file-tools paragraph says so. No package, edge, process, channel, command or store column changed.

**An empty or relative per-user variable takes its default (REQ-STARTUP-145, REQ-CONFIG-001; finacc3 A2-06, A2-07; fin30).**
`xdgBaseDirectory` (`platform/dirs.ts`) now also ignores a relative `XDG_CONFIG_HOME` or `XDG_DATA_HOME`, as the XDG Base
Directory Specification says, and `localAppDataDirectory` beside it is the one reading of `LOCALAPPDATA`: unset, empty or
relative takes `<home>\AppData\Local`. `resolveUserDirs` and `resolvePreferenceRoot` read both through them, so neither can
answer a directory relative to the working directory. The proof harness's `proofIsolationEnv` refuses a POSIX launch whose
profile is not an absolute POSIX path. The **process view**'s configuration-files row and the **state-ownership view**'s
`preferences.json` row say so. No package, edge, process, channel, command or store column changed.

**The hand-over socket lives where a unix socket fits, and never relative to the working directory (REQ-STARTUP-145,
REQ-STARTUP-161, REQ-STARTUP-164; finacc3 A2-04, A2-05; fin30).** `socketDirectoryCandidates` (`platform/instance.ts`) orders
`XDG_RUNTIME_DIR`, the data directory and a private `rotaris-<uid>` below the temporary directory or `/tmp`, keeping each only
where it is absolute and the socket's path fits the platform's address (107 bytes on Linux, 103 on macOS); the claim listens in
the first that can hold a file, and a claim whose listen fails gives its record back and is refused rather than rejected unhandled.
The **process view**'s instance-claim row and the **sequences view**'s launch diagram (the refused branch) say so. No package,
edge, process, channel, command or store column changed.

**A proof's launch ends with its whole process group (finacc3 A2-19; fin30).** A driven launch leads a process group of its
own, and `spawnBounded`, `stopApp` and the new `endLaunch` drain the group once the main process has exited (`drainGroup`:
three seconds, then SIGKILL, each straggler named). The **component view**'s scripts paragraph says so. Harness only: no
package, edge, process, channel, command or store column changed.

**A timeout's issue names the call that ran out of time, and summary.md's terminal counts flag the cap (REQ-SESSION-136,
REQ-SESSION-133, REQ-SESSION-140; finacc3 A2-08 and A2-09, fin30).** `outcomeIssues` (`packages/agent-tools/src/gate.ts`)
files `terminal_timeout` for every timeout as before, but says "A terminal command exceeded its timeout." only where the
observation carries the terminal's `outcome_kind: 'timeout'`; an MCP call or a fetch, which settle with
`failure_kind: 'timeout'` alone, read "The '<tool>' call did not complete within its time allowance.". `warningLines`
(`run/summary.ts`) prints Terminal failures, Terminal suspicious successes and Timeouts as `at least N`, naming what each ring
dropped, once both the tool-call record and the issues record have dropped rows. The **runtime view**'s rings row and its
`summary.md` paragraph say so. No package, edge, process, channel, command or store column changed.

**The workspace `.gitignore` reader answers in git's order (REQ-WORKSPACE-100, REQ-TOOLS-139; fin30).** A rule matches the
path itself and nothing beneath it, and `ignoredBy` asks every proper directory prefix first, so a directory re-included
under an ignored glob (`gen/*` then `!gen/keep/`) keeps what it holds for the search tools and the contains-code walk; the
pruning walks ask an entry's own verdict (`ignoredHere`). The **runtime view**'s search-tools and setup paragraphs say so.
No package, edge, process, channel, command or store column changed.

**A delegation names the todo item it serves (PD-TOOLS-006 revision 6, REQ-ORCH-028/029; OQ-220 ruled under R-072, fin29).**
Store **v34** appends `children.todo_item`; `delegate` gains `todo_item` (`DelegateRequest.todoItem`); `IterationChildren.delegate`
admits it before the spawn (`admitTodoItem`, `children/todo-item.ts`) over the caller's plan (`ChildrenDeps.todoPlanFor`,
`Run.todoPlanFor`) and the host's implementation reading (`SessionsDeps.implementationRole`, `implementationRole` in
`run-host/tools.ts`). The **runtime view**'s delegation section and store table, and the **seams view**'s tool invariants, say so.
One store column; no package, edge, process, channel or command changed.

**A delegated child's attached artifacts: 100,000 characters, skip-and-continue, and an observation that names what the child is
given (PD-TOOLS-006 revision 5, REQ-TOOLS-152/153, REQ-LIBRARY-098; OQ-221 ruled under R-072, fin29).** `selectAttachments`
(`children/orchestration.ts`) is the one selection both the delegate observation at acceptance and the payload's block read;
`AttachmentOutcome` carries `given`, `elidedForSize`, `unresolved`, `unreadable` and `budget`, rendered by `attachmentWarnings`
(`agent-tools/tools/delegation.ts`); `FULL_CONTEXT_BUDGET` is 100,000. The **runtime view**'s delegation section says so. No
package, edge, process, channel, command or store column changed.

**Settings presents the per-agent timeout as a third delegation limit, in minutes (PD-CONFIG-003, REQ-MONITOR-286; OQ-218
ruled under R-072, fin28).** `RuntimeViewSchema` and the snapshot carry `child_timeout` (seconds); `PendingSettings.runtime`
holds it, the Runtime category's Delegation limits draws it in whole minutes (1–240), and it is saved by the desktop save
and laid on a run start by Tier B (`TIER_B_RUNTIME_KEYS`). The **seams view**'s configuration-key section and the **runtime
view**'s Tier B paragraph say so. No package, edge, process, channel, command or store column changed.

**A later cycle's "You asked for" line is capped like the implied todo (PD-ORCH-002 revision 3, REQ-ORCH-153; OQ-204 ruled
under R-072, fin28).** `.plan-gate__prior` (`packages/ui/src/shell.css`) takes `max-height: var(--rt-space-16)`, scrolls inside
itself and wraps with `overflow-wrap: anywhere`; a revision field dragged taller keeps its height. The **runtime view**'s plan
gate paragraph says so. No package, edge, process, channel, command or store column changed.

**Closing one of several main windows ends its own project's runs, asking first (PD-SHELL-009, REQ-STARTUP-046, REQ-SHELL-119,
REQ-SHELL-122; OQ-206 ruled under R-072, fin28).** The run host's `runs.active` counts the named workspace's runs (the session
row's `workspace_root`, `Sessions.activeRunCount(workspaceRoot?)`) and the empty id the instance's (which `session.start`'s
REQ-GIT-120 forced isolation still asks, since that rule counts any run — *replaced the same day by PD-GIT-001: it asks
`scope: 'sharing'` for the window's workspace, see below*); a new request
`runs.stopWorkspace` → `runs.stopped` stops a workspace's active runs as the stop control does (`Sessions.stopActiveIn`).
`confirmActiveRunClose` asks `windowCloseBox` at a close that leaves another main window open, and its Yes awaits the stop
before the close is confirmed; `QuitState.stoppedByClose` withdraws the stopped sessions' approval dialogs, queued approvals
and question-dock cancellations and holds back their notices until their rest. The **process view**'s close paragraph and the
**runtime view**'s control table say so. One request and one reply kind on the main ↔ run host channel; no package, edge,
process, command or store column changed.

**The improvement analysis timeout control is complete, and the save's runtime keys are a closed list (PD-CONFIG-003
revision 2, REQ-CONFIG-256, REQ-CONFIG-262, REQ-NOTIFY-100; OQ-223 ruled under R-072, fin29).** `DESKTOP_SAVE_RUNTIME_KEYS`
(`@rotaris/contracts`) closes `DesktopSaveSchema.runtime`; `TIER_B_RUNTIME_KEYS` gains `improvement_collector_timeout`; the
control is clamped 10–600 s with a seconds suffix and a stored-value line; and the zero-proposal notice's detail says when a
post-run analysis reached its limit (`zeroProposalDetail`, `apps/desktop/src/main/improvement-notice.ts`). The **seams view**
§5 and the **runtime view**'s Tier B list say so. No package, edge, process, channel, command or store column changed.

**Isolation counts the runs that could share the launch's tree (PD-GIT-001, REQ-GIT-119, REQ-GIT-120, REQ-MONITOR-251; OQ-224
ruled under R-072, fin29).** `runs.active` gains `scope: 'sharing'` (`Sessions.activeRunsSharing`: the workspace's own runs and
any whose tree overlaps its folder, compared by whole components); `session.newId` answers `isolationRequired` from it and
the launch dialog shows that answer (`isolationRequiredOf`, `@rotaris/ui`) in place of its own session-list test;
`session.start` forces on the same count, an unreadable count forcing, and raises an informational notice when it does
(REQ-GIT-119's hint, now `ISOLATION_REQUIRED_HINT` in `@rotaris/contracts`); and the engine refuses a base-tree continue
beside such a run (`BASE_TREE_BUSY_REFUSAL`). The **process view**'s close paragraph says so. One optional value on an
existing request and one field on an existing reply; no package, edge, process, command or store column changed.

**The window close's follow-ups, and the Windows session's end (PD-SHELL-009, REQ-STARTUP-046, REQ-SHELL-121; fin29).** The
close of one of several main windows counts with the stop's own predicate (`runs.active` gains `scope: 'stoppable'`,
`Sessions.stoppableRunCount`); `QuitState` holds a stopped session's notices until that run's own `run.result`, whose outcome
notice it holds too, rather than following published statuses; and each main window's `session-end` (Windows only) starts the
orderly shutdown `window-all-closed` runs, now memoized (`SessionEndShutdown`). The **process view**'s quit and close
paragraphs say so. One optional field on an existing request; no package, edge, process, command or store column changed.

**`can_publish_artifacts` gates `artifact_write` (REQ-CONFIG-106, REQ-TOOLS-004, REQ-TOOLS-150; OQ-212 ruled under R-072).**
`Persona` gains `canPublishArtifacts`, false for every built-in role and carried from a role's configuration by
`personaResolverFor`; `createToolPort` passes it to the registry's prerequisites, which removes a declared `artifact_write`
without it as `artifact_publish_not_granted`. The **seams view**'s tool invariants say so. No package, edge, process, channel,
command or store column changed.

**An artifact's body is its document, and a person's edit of it survives and travels (PD-LIBRARY-003, OQ-210 ruled under
R-072).** `ArtifactStore.rerender` rewrites only the leading frontmatter (`renderFrontmatter`, `splitFrontmatter` in
`@rotaris/contracts`) of a document a person edited, on supersession and on re-materialisation; `latestArtifactText` and
`buildContinuationPayload` take the session's `ArtifactStore` and carry an edited artifact's document marked `edited`; the
inspector's Preview renders from below the frontmatter (`previewSource`). The **runtime view**'s `artifacts` row and its
continuation paragraph say so. No package, edge, process, channel, command or store column changed.

**An error-path record's arguments are `PD-SESSION-003`'s, and `delegate`'s id lists are never cut (REQ-SESSION-136,
REQ-SESSION-194; OQ-209 ruled 2026-10-07 under R-072; fin28).** The reading `cutArguments` (`run/cut.ts`) was built under is
confirmed and minted as `PD-SESSION-003`; `WHOLE_KEYS` gains `inherited_context` and `attach_artifacts`, and `cut.test.ts`
classifies every argument key of every built-in tool. The **seams view**'s tool path gains its sixth row (`WHOLE_KEYS`, when
a key holds identifiers its last word does not name), and the **runtime view**'s store table cites the directive. No package,
edge, process, channel, command or store column changed.

**MCP and fetch call records carry no `outcome_kind` (REQ-SESSION-136, REQ-SESSION-139; OQ-208 ruled 2026-10-07 under
R-072; fin28).** The run host's MCP executors (`run-host/mcp.ts`) and the fetch tool (`agent-tools/tools/fetch.ts`) no longer
set `outcomeKind` (`mcp`, `fetch`); each keeps its `failureKind`, so REQ-SESSION-139's histogram derives the call's bucket,
`success` or `tool_error`, from `status` and `is_error`, and `summary.md`'s Tool outcomes line and the metrics document show
no `mcp` or `fetch` bucket; the live run's reader (`lib/summary-sections.mjs`) refuses one. Records already stored keep
what they hold. The **runtime view**'s `summary.md` paragraph says
so. No package, edge, process, channel, command or store column changed.

**`summary.md`'s mostly-elided artifacts are counted (`PD-SESSION-002`, REQ-SESSION-140, REQ-LIBRARY-098; OQ-207 ruled
2026-10-07 under R-072; fin28).** `summaryFactsOf` (`run/summary.ts`) reads each `context_selection` timeline entry's
`task_id` and `attached_elided` through the new `StoreDal.elidedAttachmentRowsOf`, a statement over the timeline's primary
key in the same read transaction, and `elidedAttachmentsOf` counts the distinct agent-and-artifact pairs; `warningLines`
writes the count, `0` when none, where the line read `n/a`. The live run's reader (`lib/summary-sections.mjs`) refuses an
`n/a` line. The **runtime view**'s `summary.md` paragraph says so. No package, edge, process, channel, command or store column
changed.

**The coordinator keeps its own todo list on multi-step work, held at dispatch (REQ-ORCH-029, REQ-ORCH-059; OQ-213, fin27).**
The entry port's gate refuses the call that would start a task's second work item while the coordinating entry role has written
no todo list of its own for it (`GateDeps.todoList`, `isWorkItem` in `packages/agent-tools/src/todo-list-gate.ts`;
`Run.todoListOwed`, `workItemStarted`, `todoListUnavailable`; `Task.workItems`, `Task.listWritten` in the stored todo), and
`completionNotification` appends REQ-ORCH-059's open-todo reminder lines. The **runtime view** (§2) and the **seams view**
(§4, the gate's order) say so. One module joins `@rotaris/agent-tools`; no edge, process, channel, command or store column
changed (the two task facts ride in the existing `sessions.todo` document).

**The report's pass is told how a failed child ended, and cannot raise its status (OQ-217, REQ-ORCH-108, REQ-ORCH-110,
REQ-ORCH-088, R-072).** `reportFacts` opens a non-succeeded child's facts with `outcomeLine`'s Outcome line (status, end
reasons, PD-ORCH-004's statement, which `IterationChildren` now passes as `ReportInput.cutOffStatement`), ahead of the edited
files so OQ-120's head-keeping cut keeps it; `produceReport`'s ask adds the three sentences that line calls for; `shape` keeps
a non-succeeded child's status whatever the pass returns. The **runtime view**'s children paragraph says so. No package,
edge, process, channel, command or store column changed.

**`delegate`'s description names what each persona's child would be granted (PD-TOOLS-006 revision 4, OQ-216, R-072).**
`createToolPort` builds each agent's `delegate` with a catalogue `delegateCatalogue` resolves through `resolveAgentGrant`, the
one declared-to-granted function the agent's own port now applies, and `renderDelegateCatalogue` (`agent-tools`) states each
persona's REQ-TOOLS-001 facets in place of the fixed list of built-in names. The coordinator's routing table regains
REQ-ORCH-028's two capability clauses. The **runtime view**'s write-scopes section and the **seams view**'s tool seam say so.
No package, edge, process, channel, command or store column changed.

**A tool call's streamed arguments are model events (REQ-ORCH-089, REQ-ORCH-090, REQ-NOTIFY-112, REQ-CHAT-164; finacc3 F02).**
`StreamPart` gains `tool-input`, which `AiSdkModelClient.stream` yields for the SDK's `tool-input-start` and `tool-input-delta`
parts; the call still arrives once, whole, as `tool-call`. The stall watch counts it as output (`OUTPUT_EVENTS`), the first one
disarms REQ-ORCH-090's watchdog, and `step`'s sink clears REQ-CHAT-164's row mark on it. The **runtime view**'s model-step,
unresponsive-model and stall-watch paragraphs say so. No package, edge, process, channel, command or store column changed.

**`summary.md`'s counts over a capped ring read as a lower bound past the cap (REQ-SESSION-133, REQ-SESSION-140; finacc3 F10).**
`warningLines` and `metricsLines` (`run/summary.ts`) print Permission denials, Tool errors, Permission decisions and Issues as
`at least N`, with how many rows the cap dropped, once the permission audit or the issues record has dropped rows
(`records_kept`); a whole ring's count reads plain. The live run's reader (`lib/summary-sections.mjs`) reads either form. The
**runtime view**'s `summary.md` paragraph says so. No package, edge, process, channel, command or store column changed.

**No control accepted after the run's end is written writes over it (REQ-SESSION-186, REQ-SESSION-094, OQ-165; finacc3 F05).**
`Run.endWritten` (`ended`; `cancelWindowClosed`, set just before the teardown's terminal transaction with nothing awaited
between; or `restWritten`, set straight after the message-limit pause's or the plan gate's park's rest transaction) refuses
the stop (`acceptsStop`, which `Sessions.control`'s `cancel` reads before raising it), the root's explicit cancel, the pause,
the mode change and the todo edits, and `saveRunning` writes nothing from there; a stop accepted while the teardown forwarded
the terminal pair or ran the hooks advisory, or while a rest was forwarded or its `session_end` hooks ran, had saved
`cancelling` over the run's end or rest. The **runtime view**'s control table says so. No package,
edge, process, channel, command or store column changed.

**An empty XDG variable takes its default (REQ-CONFIG-001, REQ-STARTUP-145; finacc3 F06).** `xdgBaseDirectory`
(`platform/dirs.ts`) is the one reading of `XDG_CONFIG_HOME` and `XDG_DATA_HOME`: unset or empty answers the default, as
the XDG Base Directory Specification says (a relative value is still used as it stands, an open note). `resolveUserDirs` and `resolvePreferenceRoot` both read through it,
where the first read `??` and the second `||` and an empty `XDG_CONFIG_HOME` parted them. The **process view**'s files row and
the **state-ownership view**'s `preferences.json` row say so. No package, edge, process, channel, command or store column
changed.

**Undoing a `write_file` create removes only the file it made (REQ-TOOLS-132, REQ-TOOLS-135; fin26).** A create's `UndoEntry`
keeps the SHA-256 of what it wrote, and its undo removes the file only while the file's bytes still have that digest; a file
another writer rewrote since is left in place and the undo refused, its entry kept. The **runtime view**'s file-tools
paragraph says so. No package, edge, process, channel, command or store column changed.

**An error-path tool record marks the cut it makes (REQ-SESSION-194, REQ-SESSION-136; fin23, live-run M3).**
`SessionWriter.settleToolCall` cuts an error's `args` and `result` with `run/cut.ts`, so a cut value ends with `...` inside
its 2,000 characters where it was a bare `slice`; the arguments keep their shape (`cutArguments`: only free-text values cut,
a path, identifier, count or timestamp never; OQ-209, ruled 2026-10-07 as `PD-SESSION-003`, above). The **runtime view**'s store table says so. No package, edge, process,
channel, command or store column changed.

**A terminal command too long for one PTY line is staged in a script (REQ-TOOLS-096, ADR-0020; fin23, live-run M1).** A POSIX
wrapper longer than `POSIX_LINE_BYTES` reached the shell cut at the PTY's canonical line cap; `ForegroundSession.carry` now
writes such a command to `<os temp>/rotaris-command-<random>/<n>.sh` and wraps `. '<script>'` instead. The **process view**'s
files-on-disk table carries the staging directory, what a killed run host leaves of it, and that a staging which fails is
the call's `execution_error`. No package, edge, process, channel, command or store column changed.

**Undoing a `write_file` create removes the file it made (REQ-TOOLS-132, REQ-TOOLS-135; fin24).** `FileToolState`'s undo
stack holds an `UndoEntry` per write (the previous content, or none for a create with the first directory it made), and
`write_file`'s `undo` of a create removes the file and the empty directories the create made, where it wrote an empty file.
The **runtime view**'s file-tools paragraph says so. No package, edge, process, channel, command or store column changed.

**`summary.md`'s Tool errors line is the issues record's (REQ-SESSION-140, REQ-SESSION-136; fin23).** `warningLines`
(`run/summary.ts`) reads `issues_by_kind.tool_error`, the figure the Metrics section's Issues line prints, where it read the
tool-outcomes histogram's `tool_error` bucket. The histogram is unchanged (REQ-SESSION-139; its `mcp` bucket was OQ-208's, ruled 2026-10-07, above).
The scripted client gains a `badterm` step, a terminal call its schema refuses, which `sessions-proof`'s seed launch takes.
The **runtime view**'s repair paragraph says so. No package, edge, process, channel, command or store column changed.

**A stop's saved `cancelling` holds until the run rests (REQ-SESSION-186, OQ-165's reading, ruled 2026-10-06 by R-071; fin22).** The stop control
(`op: 'cancel'`) saves the status through `Run.stopAccepted`, which sets the flag `saveRunning` keeps for the explicit cancel,
so the run's later saves on the way to rest no longer write `running` again. The **runtime view**'s control table says so. No
package, edge, process, channel, command or store column changed.

**A child's unfinished calls are counted per attempt (`PD-ORCH-008`; fin22).** `IterationChildren.execute`'s settle counts
each attempt's calls started and never completed (`unfinished`: every call the attempt's turns counted, a replay included,
told by the new `TurnDeps.onToolCounted`, less those it completed, with or without an outcome), so an attempt REQ-ORCH-088's
fallback replaced no longer hides the retry's, and a re-prompt that raised loses none of its own.
The **runtime view**'s `entryToolCalls` paragraph says so. No package, edge, process, channel, command or store column
changed.

**`summary.md` carries REQ-SESSION-140's sections (fin22).** `renderSummary` renders `SummaryFacts`, read by `summaryFactsOf`
(`run/summary.ts`) in one read transaction: the task line from `StoreDal.firstPromptRow`, the stop reason only where one is
recorded, Metrics with `n/a` for what is unavailable, Warnings (mostly-elided artifacts read `n/a` while OQ-207 was open, its note left open — a count since `PD-SESSION-002`, above; the denials name the permission audit on every count, and `timeouts` is labelled as every tool call that timed out), Agents, Slowest
Tools and the inspection note; the counts are `sessionMetrics` (`export.ts`, which the metrics document now wraps), over
`StoreDal.toolCallDigestOf` and `auditDigestOf`, two new statements over the existing tables. `SummaryWriter.rebuild` guards
every read and skips a superseded rebuild; `costLabelOf` moved to `run/cost-label.ts` and is re-exported where it was. The
**runtime view**'s repair paragraph says so. In repair round 2 a plan cycle's root's Agents line stopped reading the capped
tool-call record: store **v33** adds `plan_roots.tool_calls`, raised by `SessionWriter.countToolCalls` with the total, and a
line with no count kept reads `n/a` once the ring has dropped any. The **runtime view**'s repair paragraph, its §7 heading
(v33) and `plan_roots` row, and the **state-ownership view**'s plan-cycle-root row say so. No package, edge, process,
channel or command changed.

**The timeline's vocabulary names every name the product writes (PD-ORCH-014, PD-CHAT-009, PD-TOOLS-011; OQ-157 with
OQ-53, OQ-54, OQ-76 and OQ-127; fin20).** `tools/check-timeline-vocabulary.mjs`'s `AWAITING` is empty, every name it held
a word cited to its directive. `UserPresence` writes `user_away` and `user_returned` through the session's writer
(`UserPresenceDeps.writer`), and the terminal's audit entry takes `user-input` and `user` from the audit's own vocabularies
(`AUDIT_DECISIONS`, `AUDIT_DECISION_SOURCES` in `contracts/tools.ts`). The **runtime view**'s away paragraph and `timeline`
row and the **state-ownership view**'s away-mark row say so. No package, edge, process, channel, command or store column
changed.

**The stall watch files one issue per throttled warning, and records its facts on the timeline (PD-MONITOR-005 revision 2,
OQ-127's ruling; fin20).** `stallRecords` and `recordCorrectiveMessage` (`engine/children/stall.ts`) are the one writer for
a child's watch and the root's: the `stall` issue beside each throttled warning only, `waiting_on_tools`, `stall_recovered`
and `corrective_message` timeline entries, and the intended states (the waits, the recovery, the children a user's rest
leaves paused) through the run's new `info` channel (`RunDeps.info`, `ChildrenDeps.info`, wired by `Sessions` to the session
log at `INFO`). The **runtime view**'s stall-watch paragraph and its `timeline` row say so, and the paragraph says how
REQ-MONITOR-120's "logged" is met when the session log keeps its default `WARNING` level. No package, edge, process,
channel, command or store column changed.

**A provider's shared-quota cap is a number its catalogue entry declares (PD-PROVIDER-001, REQ-MONITOR-021,
REQ-PROVIDER-049, REQ-CONFIG-057/095; fin22).** `CatalogueEntry.sharedQuotaCap` (`deepseek` 3, `claude-code` 2, the rest
none) replaces configuration's list of two names (`defaultMaxParallel`, removed): a `models:` entry's `max_parallel` is now
absent when unstated, main's `hello` hands the run host the declared caps, and `modelCapInForce` applies the entry's stated
cap or else its provider's. The **process view**'s main ↔ run host paragraph says so. The `hello` request gains one
optional field; no package, edge, process, channel, command or store column changed.

**The preference root reads the configuration home on Linux alone (REQ-UIBENCH-039; OQ-33 ruled by R-071, fin22).**
`resolvePreferenceRoot` reads `XDG_CONFIG_HOME` in its Linux branch, as `resolveUserDirs` does, rather than before the
platform branch. The **process view**'s files diagram and the **state-ownership view**'s `preferences.json` row say so. No
package, edge, process, channel, command or store column changed.

**An unborn or unreadable branch is the strip's empty branch item (REQ-WORKSPACE-020, REQ-GIT-161; fin22).**
`branchStripItem` answers state `empty` — no text, no tooltip, no description — where a repository's snapshot carries no
branch name and no detached HEAD, and `StatusStripItem` draws no `title` and no `aria-description` for an empty string; until
then the item drew the branch icon and a branch named `—`. The **seams view**'s status-strip item says so. No package,
edge, process, channel, command or store column changed.

**A person's close of the last main window asks the active-run confirmation (REQ-STARTUP-046, REQ-SHELL-119; OQ-206
raised, fin22).** `guardClose` takes a third guard, `confirmRunsAtClose`, asked after the renderer's unsaved-settings guard
allows; main answers it from the run host's `runs.active` and `activeRunCloseBox` (`main/close-confirmation.ts`) when no
other main window stays open. The application's quit asks the renderer's guards alone, as before. The **process view**'s
quit paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**The remaining confirm-as-built questions are ruled, and no code moved (R-071; fin20).** OQ-154 to OQ-203's
confirm-as-built rulings are written into their entries, with `PD-HOOKS-001`, `PD-ORCH-010` to `PD-ORCH-012`, `PD-ORCH-006`
revision 2, `PD-MONITOR-003` to `PD-MONITOR-005`, `PD-WORKSPACE-006` to `PD-WORKSPACE-008`, `PD-SHELL-007`, `PD-SHELL-008`,
`PD-SESSION-001`, `PD-CHAT-008` and `PD-CHAT-003` revision 2 where a ruling departs from a requirement. The **runtime
view**'s run-level agent paragraph now calls OQ-159 ruled (`PD-MONITOR-003`), and its stall-watch bullets cite `PD-MONITOR-005` for OQ-155 and OQ-173; the notes this log names as open for those
rulings (the cancel while `session_end` runs, OQ-154; the branch item's states, OQ-193) are closed in `docs/defects/fixed/`.
`slice-proof` expects the answer group alone for its question (`PD-ORCH-011`). No package, edge, process, channel, command
or store column changed.

**An entry role that wrote no answer is asked once more; a continuation's parent is told it starts with no memory; the
landing's 30 s is written down (OQ-199, OQ-114, OQ-196; `PD-ORCH-009` and `PD-ORCH-004` revision 5, R-071; fin20).**
`Run.turn`'s follow-up sends `ANSWER_REPROMPT` once to a root whose turn returned no text, and a root still silent is
reported in a `system` row and an `incomplete_execution` issue where what follows it is known (`Run.tellUnanswered`): the
run's end, or only that iteration's when the run goes on, parks or pauses. The continuation offer (`cutOffReport`) and `delegate`'s
description carry the no-memory sentence. `CHILD_LANDING_GRACE` is unchanged. The **runtime view**'s loop diagram, its
paragraph on the root's follow-up and its child-timeout paragraph say so. No package, edge, process, channel, command or
store column changed.

**A continue resumes the paused iteration with the intent and tools it started with, and the fingerprint is the persona's
(OQ-162, OQ-105; `PD-ORCH-005` revision 7, R-071; fin20).** The Continue action and a message-limit resolution hand the
pre-flight the intent in effect (`PreflightContext.intent`), which `runPreflight` resolves with no classification call; a
continue by message that resumes an open iteration runs it under the carried pre-flight (`RunDeps.resumedPreflight`,
`Run.preflightInEffect`, which the entry turn's grant-fitted instructions of `PD-ORCH-006` read too) and records its own
classification as in effect once that iteration closes (`nextIntentInEffect`).
`ConversationRecord.fingerprint` takes the persona's own definition (`personaDefinitionOf`) and replaces the row after a
stated change (`SessionWriter.replaceAgentFingerprint`, `StoreDal.replaceAgentFingerprint`, a statement over the v24 table).
The **runtime view**'s `Run.start()` order, its conversation-record paragraph and its §7 row, the **state-ownership** row and
the **sequences** view's continue say so. No package, edge, process, channel, command or store column changed.

**The code-intelligence manual tool carries the product's description; an isolated run's servers are handed its tree
(PD-MCP-001, PD-MCP-002, OQ-115, OQ-194; fin21).** The binding manifest gains `productDescriptions`, written by its
generator, and `filterServerTools` puts the usage-instruction tool's on the bundled server's tool. `mcpConfigurationForExecutionRoot`
rebinds REQ-MCP-035's fill-in and the default `cwd` with the project path, and `SessionConnections.connect` takes the root
REQ-MCP-070's `lsp_init` names, which the tool port now passes as the execution root. The **runtime view**'s
code-intelligence paragraph and the **component view**'s manifest paragraph say so. No package, edge, process, channel,
command or store column changed.

**A `write_file` call with no operation is read as a create when its file does not exist (PD-TOOLS-007, OQ-139; fin21).**
`ToolExecutor` gains an optional `inferArguments`, which `Gate.dispatch` asks only for a call its schema still refuses after
REQ-TOOLS-032's repairs; `write_file` answers it, and the gate dispatches the answer in the call's place and appends the
tool's sentence to the result. The **runtime view**'s `toolSpec` paragraph says so. No package, edge, process, channel,
command or store column changed.

**An advertised schema's `$async` is not honoured (REQ-TOOLS-032; fin21).** `advertisedSchemaCheck` drops ajv's own `$async`
keyword before compiling and reads the validator's answer as a boolean only, so a server schema carrying it is checked
synchronously and refuses an invalid call. The **runtime view**'s `toolSpec` paragraph says so. No package, edge, process,
channel, command or store column changed.

**A recovered session's readers present the correction entry (OQ-60, R-071; fin20).** `sessionOutcomeOf` (`run/summary.ts`)
is what a session's record carries as its `summary` and `summary.md` as its Outcome block: REQ-ORCH-082's columns, except
while the session is `interrupted`, when the latest `session.interrupted_recovered` entry stands in their place. The repair
rebuilds `summary.md`. The **runtime view**'s repair paragraph says so. No package, edge, process, channel, command or store
column changed.

**A tool call joins the saved totals as it completes (OQ-116; `PD-ORCH-008`, R-071; fin20).** The root's and each child's
`onToolCompleted` add the call to the run's aggregate and persist it with the agent's own count (`countRootCall`, `countCall`,
`SessionWriter.countToolCalls`); store **v32** appends `sessions.plan_root_tool_calls`, the plan cycle root's counted share,
which its release and its crash record subtract. The **runtime view**'s `entryToolCalls` paragraph and its `sessions` row and
the **state-ownership** row for the tool-call total say so. No package, edge, process, channel or command changed.

**The report summariser reads the child's whole task (OQ-119; `PD-ORCH-007`, R-071; fin20).** `reportTranscript` keeps the
task as given whole within REQ-ORCH-110's 12,000 total, exempt from the 2,000 per event; a task that alone fills the total keeps
its head. The **runtime view**'s children paragraph says so. No package, edge, process, channel, command or store column changed.

**A coordinator granted the direct-work bundle is told to do the work itself (OQ-202; `PD-ORCH-006`, R-071; fin20).**
`entryInstructionsFor` (`children/personas.ts`) fits the entry turn's instructions to the pre-flight's grant: the built-in
coordinating prompt becomes its direct-work form, a configured prompt gains the statement after it, and a turn the plan gate
holds keeps the persona's prompt (`Run`'s root turn). The **runtime view**'s system-prompt paragraph and its entry-port
sentence say so. No package, edge, process, channel, command or store column changed.

**A `swarm` run is told to delegate as widely as it can (REQ-ORCH-025; finacc3, finding F07).** `runOverrideLayer`
(`children/personas.ts`) builds `SWARM_INSTRUCTION` for the entry turn when the run override is `swarm`, the grant is not the
direct-work bundle and the entry role declares `delegate`, and `runTurn` appends it after everything else the prompt carries,
the MCP section included (`withRunOverrideLayer`, `TurnDeps.runOverrideLayer`). The text has its own heading, says it takes
precedence over the playbook's CHUNKING and BUDGET guidance where they differ, and is pointed at the plan while the plan gate
holds. `RuntimePosture.runOverride` reaches the run as `RunDeps.runOverride` beside `coordinating`, at the launch and at a
continuation. A run granted the bundle carries no `swarm` text: OQ-205's reading, confirmed as built on 2026-10-07 by
`PD-ORCH-006` revision 3 (R-072). The **runtime view** says so in its own
paragraph after the instruction files'; repair round 1 moved the layer from before the context units to after the MCP
section. No package, edge, process, channel, command or store column changed.

**A corrective message's timeline entry is a warning, as its line is (OQ-127's ruling; finacc3, finding F11).**
`recordCorrectiveMessage` (`engine/children/stall.ts`) writes the `corrective_message` entry at severity `warning`, the
`WARNING` its session-log line carries; it took the writer's default, `info`, before. The **runtime view**'s stall-watch
paragraph says so. No package, edge, process, channel, command or store column changed.

**A confirmed run cancel is saved `cancelling` by the engine (OQ-165 ruled 2026-10-06, R-071; fin21).** `Run.cancelAgent`
saves the accepted explicit cancel `cancelling` and `saveRunning` keeps it until the run's end, so every window reads it from
the record; the confirming window's run overlay hands over to the first record reading it (`witness`). The **runtime view**'s
`cancelAgent` row and the **state-ownership view**'s overlay row say so. No package, edge, process, channel, command or store
column changed.

**A setup banner names its project; every stop of a setup step gets 2 s (PD-WORKSPACE-005, PD-MCP-003; OQ-171, OQ-172
ruled 2026-10-06; fin21).** The initialization coordinator's two banners stay application notices and name the project they
concern (`namedBanner`: `{headline}: {the folder's name}`, the detail area opening on the folder). A setup step is
force-killed 2 s after any stop — Cancel, a switch's cancellation, an exhausted budget, the close — where a cancellation
and a budget had REQ-MCP-099's 5 s (`SETUP_TERMINATE_GRACE_MS`). The **process view**'s `mcp.setup` paragraph and the
**runtime view**'s application end say so. No package, edge, process, channel, command or store column changed.

**A parked run closes its tool ports (REQ-MONITOR-228, REQ-MONITOR-105, REQ-SESSION-129, REQ-ORCH-153, REQ-ORCH-087;
OQ-170 ruled by R-071, fin21).** `Run.pauseAtLimit` and the plan gate's park call `Run.closePorts`, as the teardown does, so
every tool call still open settles `failed` at the park and a parked run no longer holds back the crash record's ring
settle; `docs/defects/fixed/a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md` is closed. The **runtime
view**'s §2 crash paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A board run that stops at its iteration limit rests in Blocked (REQ-TRACE-477/482/463; OQ-180 ruled by R-071,
fin21).** Main's coordinator classifies `stopped` as `failed` (`outcomeOf`), so the card is held with a `run-failure`
blocker and automatic scheduling no longer restarts it; only `cancelling` ends `cancelled`. The **sequences view**'s board
passage says so. No package, edge, process, channel, command or store column changed.

**An update action that closes the windows asks the active-run confirmation first (REQ-STARTUP-046, REQ-STARTUP-119,
REQ-STARTUP-121; OQ-86 ruled by R-071, fin21).** `UpdaterDeps.confirmClose` is asked by `Restart now`, and by `Update now`
on the installer flavour, before anything starts; main answers it from the run host's `runs.active` and a message box whose
default is `Return to the window`; the count is read again immediately before the installer or the successor starts
(`UpdaterDeps.activeRuns`, `runInstall`'s `beforeApply`, `mustAskAtHandOff`), so a run started during the download is asked
about too (verification round 1). The **sequences view**'s `Update now` / `Restart now` diagram and prose say so. No
package, edge, process, channel, command or store column changed.

**After one unanswered approval, the question tool's own ask still prompts and the waits already outstanding end
(PD-TOOLS-005 revision 2; OQ-77 and OQ-78 ruled by R-071, fin21).** The gate's `broker` exempts the public `ask_questions`
call's own approval from the away state; every other brokered wait registers on `UserPresence.onAway` while outstanding, and
the away transition ends it through `PendingApprovals.endAway` (a new `away` outcome) resolved under the headless policy. The
**runtime view**'s away paragraph says so. No package, edge, process, channel, command or store column changed.

**An authentication restart re-sends the prompt's images (REQ-NOTIFY-070/074/076, REQ-CHAT-171; OQ-182 ruled by R-071,
fin21).** `Sessions.lastPromptOf` reads the last prompt's images back by path and digest (`readBackAttachments`, the retry's
read-back) and the restarts re-submit them with the text; an image that cannot be read back, or a restart model declaring no
image input, refuses the restart before anything is pinned; the automatic fallback's image refusal opens REQ-NOTIFY-072's
recovery dialog (`NO_USABLE_FALLBACK`). `AuthFallbackRestart` gains `images`. The **runtime view**'s
fallback paragraph says so. No package, edge, process, channel, command or store column changed.

**Helper model calls follow the session's override and stay off a pair held out of quota (PD-MONITOR-007; OQ-189, ruled
2026-10-06; plan fin21).** `helperChoiceOf` (`run/resilience.ts`) and `Run.helperModel` resolve a helper's configured model
through the session's memory at each call. `Sessions` passes the reader to the run host as `PreflightContext.helperModel`,
the `supervisor` factory's fourth argument and `onRunResult`'s third. The intent and loop classifiers make no call on an
excluded pair, the analyst is skipped (`postRunAnalystOf`), a configured compressor yields to the agent's own model, and the
summariser falls back to the child's (`ReportInput.agentModel`). The **runtime view**'s metered-requests paragraph and its
compression paragraph say so. No package, edge, process, channel, command, timeline name or store column changed.

**An explicit switch of the entry model wins, holds for its own run, and keep waiting retries an out-of-quota wait
(PD-ORCH-013, PD-MONITOR-006, PD-MONITOR-004 revision 2; OQ-177, OQ-185 and OQ-188, ruled 2026-10-06; plan fin21).** `Run.setEntryModel`
takes back an earlier wait's override of the pair chosen on the header path too (`takeBackOverrideOf`, now given where the
choice was made); the switch rows say the switch applies for the rest of this run and that the next run starts on the
composer's choice; the record's `wait` gains `modelKey` (`keyOfPair`), and the wait header's Keep waiting (`keepWaitingAction`)
sends `setModel` with it in the wait that never auto-resumes, marked `keepWaiting` with the wait's `agent` and `attempt` (since
the plan's repair round 1): `Run.keepWaiting` retries the agents parked on that pair alone (`WaitRegistry.retryOn`), persists
no override, and refuses a press for a wait no longer outstanding, so a double-click switches nothing. The **runtime view**'s `setModel` and *keep waiting* rows say
so. The snapshot channel's `SessionRecord.wait` gained the field; no package, edge, process, command, timeline name or store
column changed.

**Every run of an existing session clears its notice as a start does (REQ-NOTIFY-058, REQ-NOTIFY-029; fin21).** Main's
`session.prompt`, `session.retry`, a resumed `session.continue` and a relaunched `session.planDecision` call
`NoticeStore.clearForRunStart` once the run host has launched the run, and `AuthRecovery` gains `clearForRunStart` for the
recovery dialog's restarts. The **runtime view**'s focus-gate passage says so. No package, edge, process, channel, command or
store column changed.

**The run completes only when the coordinator's own plan agrees (REQ-ORCH-029, REQ-ORCH-075, REQ-ORCH-078; fin18).**
`Run.iterate` returns a task whose root answered `succeeded` with an item of its own plan open to the pending queue, once
REQ-ORCH-078's corrections into the root's own conversation are spent (`RunConfig.validationRetries`, default 0; a `followUp`
that `IterationChildren.runWithChildren` now takes). It names the open items in `iteration.end` and tells the same task's next
root (`Task.planLeftOpen`); a task answers only for items not already open at its first take-up (`Task.planExcused`, OQ-203),
which is the plan cycle that planned it where one did (`Run.planCycleTakeUp`), so a plan-mode run's plan is its task's own.
Both records live on the planner task in the stored todo, so a continue and a later run read them back. `RuntimePosture.runOverride`
reaches the run as `RunDeps.coordinating`, false under `single`. The **runtime view**'s loop diagram and its paragraph say
so. No package, edge, process, channel, command or store column changed (the planner todo's JSON gains two optional task
fields inside the existing column).

**A continuation's run starts at its `starting` save (REQ-CHAT-158, REQ-SESSION-154; fin18).** `Run.start()` reads the
row's `updated_at` back right after the `starting` save and writes that as `run_started_at` with the `running` save, where it
took the row's last `updated_at` at that save, which a continuation's "Intent classified" row had moved past its pre-flight.
The **runtime view**'s `Run.start()` sequence says so. No package, edge, process, channel, command or store column changed.

**The expanded plan gate keeps the plan its largest part when a notice shares the window (PD-ORCH-002 revision 2,
REQ-SHELL-022; finacc2's A2).** In `packages/ui/src/shell.css` the plan's text has a floor above the todo's cap (edit
mode's is the adopted `textarea.input` rule's), raised in both modes above the revision field while it is open, every
other part keeps its content height, and below the floor the gate scrolls with its answers pinned. The **runtime view**'s plan-gate passage says so. No package, edge, process, channel, command or store column changed.

**The window that starts a session shows it from the start, and the fallback restart clears the session's notice
(REQ-NOTIFY-032, REQ-NOTIFY-058; finacc2's A1).** `session.start` mints every start's id and marks it as the asking window's
start (`MainWindows.beginStart`, cleared by its subscription, unsubscribe, release or a refused start), and the focus test of
a run's ending is `MainWindows.showingSession`, so a run failing before the renderer's `session.subscribe` is the focused
session's failure. `RunFailurePublisher` gains `clearForRunStart`, called for REQ-NOTIFY-070's restart. The **runtime
view**'s focus-gate passage, the **process view**'s start passage and a **state ownership** row say so. No package, edge,
process, channel, command or store column changed.

**The instruction files close before whatever the prompt carries next (REQ-WORKSPACE-043, REQ-WORKSPACE-047, REQ-MCP-101;
fin19).** `contextUnits` builds the workspace-context unit with `instructionContextUnit` (`config/src/instructions.ts`): the
merged output unchanged, then `INSTRUCTION_FILES_END_COMMENT`. `runTurn` appends the MCP section through the exported
`withMcpSection`. The **runtime view**'s system-prompt paragraph says so. No package, edge, process, channel, command or
store column changed.

**A row committed below the last is published with every row after it (REQ-MONITOR-214, PD-CHAT-004; fin19).**
`ProjectionOwner.onCommitted` publishes the held rows from the committed row's index onward (`rowsFrom`, walking the
indices up to the new `highestHeld`), so an append or the last row's settle is still one row and a settle below it carries
what follows. The **runtime view**'s §9 opening says so. No package, edge, process, channel, command or store column
changed.

**An MCP call is checked against the input schema the model was handed (REQ-TOOLS-032, REQ-SESSION-136; fin18, live-run
finding G3).** `advertisedSchemaCheck` (`agent-tools/advertised-schema.ts`) gives the gate a zod schema that checks a JSON
Schema without rewriting the call, and `McpHost.executorsFor` uses it for every MCP executor's `schema` in place of
`z.record(z.string(), z.unknown())`; a schema it cannot compile keeps the object check and is said once at info. The gate's
array repair wraps a field only where the schema expects an array (`repairArrayFields`; repair round 1). Since repair round
2 the check is ajv 8.20.0 (the engine the MCP SDK bundles), declared by `agent-tools` and `apps/desktop`, in place of zod's
`z.fromJSONSchema`, whose reading of JSON Schema differed keyword by keyword (patterns, integers, `enum`/`const`, `oneOf`).
The **runtime view**'s `toolSpec` paragraph and the **component view**'s new `agent-tools` validator section say so. No
package, edge, process, channel, command or store column changed.

**Settings adopts a reload in one update of the whole form, and a permission mode written elsewhere wins (REQ-CONFIG-419,
REQ-CONFIG-423; fin13).** The Settings hook holds the saved and pending values as one form (`SettingsForm`) and folds each
`config:changed` through `adoptSnapshot`, so a second announcement in the same tick is rebased against what the first left;
`rebasePending` lets a changed permission mode displace an unsaved selection. The **runtime view**'s Tier A paragraph says
so. No package, edge, process, channel, command or store column changed.

**One MCP discovery failure is one record on one line (REQ-MCP-048, PD-MONITOR-002; fin13).** `ToolDiscovery`'s
REQ-MCP-048 warning carries the time, the project the run host launched (the new optional `DiscoverRequest.context`) and the
detail with its lines joined by ` | `; `McpHost.prepare` logs a success only. `restated-facts.mjs` knows the run host's old
line as a fifth restatement, and `code-intelligence-binding.mjs` reads a failure's project from the warning. The **process view**'s one-emitter passage says
so. No package, edge, process, channel, command or store column changed.

**An MCP server whose tool discovery failed is recorded dropped for that reason (REQ-MCP-114, REQ-MCP-042; fin13).**
`grantEvidence` (`run-host/mcp.ts`) records an active server flagged `discoveryFailed` as `fate: 'dropped'`,
`reason: 'discovery-failed'`, with no entry under `granted`; the persona surface still keeps it active, so the prompt lists it
bare (REQ-MCP-048, REQ-MCP-101). The inspector and the persona window print the recorded fate as they did. The **runtime
view**'s MCP surface paragraph and its `children` row say so. No package, edge, process, channel, command or store column
changed (`granted_mcp` is the existing JSON column).

**A failed project setup's banner carries its technical text in its Details area (REQ-NOTIFY-005, REQ-WORKSPACE-092/093/103).** The
initialization coordinator's `banner` dependency takes `(headline, message, detail)`: the task's summary is the message row,
and the detail is the task's `{reason}: {detail}` error followed by one line per finished step (`failureDetail`), or the
cause where the resolution or the run broke down. Main raises it as one `error` notice with all three parts.

**The status strip names an isolated worktree's branch with its own ahead count (REQ-WORKSPACE-020, REQ-SHELL-042; acceptance
repair F8).** `GitWorktreeRow` gains `upstreamAhead` (the tree's branch against its own upstream, one `for-each-ref` read in
`readGitView`), `branchStripItem` draws the worktree branch's ` ↑{n}` from it with the base checkout's sentences, and a strip
item gains an optional `description` for the accessible description alone. The **process view**'s Git-view paragraph and the
**seams view**'s status-strip item say so. No package, edge, process, channel, command or store column changed.

**A child moved by a fallback is drawn on the model it runs on (REQ-MONITOR-052, REQ-MONITOR-066, REQ-MONITOR-069,
REQ-MONITOR-049; finacc F7).** `resilience.forChild` takes the execution (`{ taskId, key }`), and the run keeps each child's
cell by task id (`Run.childCells`). `Run.childModel` names a moved cell's key by the run-level agent's rule (`Run.keyOfCell`)
and gives its model's maximum input, which `toAgentRecord` reads through `AgentFacts.liveModelFor`. REQ-ORCH-088's timeout
fallback republishes the record (`TurnResilience.moved`). The **process view**'s `SessionRecord` sentence and the **runtime
view**'s run-level agent paragraph say so. No package, edge, process, channel, command or store column changed.

**A run in an isolated working tree launches its MCP servers bound to that tree's root (REQ-MCP-034, REQ-MCP-050; fin12).**
`configurationForExecutionRoot` (`run-host/mcp.ts`, over `mcpConfigurationForExecutionRoot` in `config/src/mcp/index.ts`) is
what the tool port's `ready()` and `session.start`'s discovery ahead of the run hand the MCP host, memoised on the execution
root; the discovery and connected lines name the project the launch carried. The **runtime view**'s code-intelligence
paragraph says so. No package, edge, process, channel, command or store column changed.

**The starter agents.yaml is written at the workspace's open (REQ-CONFIG-025, REQ-CONFIG-028; finacc-accept1-3).** The
workspace service's `workspace.open` bootstraps `<workspace>/.rotaris/agents.yaml` once the store is open and before it
answers (`workspace-service/open-bootstrap.ts`), so initialization's first record, which main starts only after that
answer and which goes through the per-field writer that never bootstraps (REQ-CONFIG-030), lands in the starter rather
than creating the file without it. The **process view**'s main-to-service requests and the **sequences view**'s launch
say so. Initialization's marker writer (`serviceMarkerWriter` in `main/initialization.ts`) asks `config.bootstrap`
before each `config.setField`, so a file removed while the workspace is open is given the starter before the record
(REQ-WORKSPACE-040); the **process view**'s initialization paragraph and the **runtime view**'s `initialization:` block
say so. No package, edge, process, channel, command or store column changed.

**A child's closing scheduler pass cannot outlive its store (REQ-ORCH-053, REQ-ORCH-098; fin11).** `Scheduler.close`, called
through `IterationChildren.close` by `Run.turn` once the iteration's children are torn down, stops every later pass; every
unawaited pass after a child's end — `startOne`'s and a resumed child's in `resumePaused` — goes through `Scheduler.passAfter`,
which warns a raise instead of rejecting. The **runtime view**'s teardown paragraph says so. No
package, edge, process, channel, command or store column changed.

**A selector's shown excluded key can be chosen there (REQ-MONITOR-194; fin11).** `SearchableOption.rechoosable` and
`choiceFires` in the design system's searchable select; `annotatedModelOptions` marks each excluded key; the inspector's
guard lets the shown key through when it is excluded. The **process view**'s `SessionRecord` sentence says so. No package,
edge, process, channel, command or store column changed.

**The run-level agent's Model names the key its root runs on while the run is live (REQ-MONITOR-052, REQ-MONITOR-066,
REQ-MONITOR-069; fin11).** The record gains `entryModelKey` (the live run's `Run.entryModelKey`: the key the root's ladder cell
carries, `AgentResilienceCell.key`, set at every assignment of its model, when that is a configured non-copy key, else the
configured key for the cell's pair; null at rest), which `runLevelAgent` names through `runLevelModel`; `entryRole`, and with it the
composer's chip and the strip's model item, is unchanged. A ladder move republishes the record (`TurnResilience.moved` →
`ProjectionOwner.refreshRecord`), since it writes no row and saves nothing. The **process view**'s `SessionRecord` sentence and the **runtime
view**'s run-level agent paragraph say so. No package, edge, process, channel, command or store column changed.

**The status strip's path link and branch item are shortened from the middle against their measured width (REQ-WORKSPACE-149
rule 2; fin11).** `StatusStripItem` draws every strip item; one marked `middle` asks the row for its whole label and re-elides
on resize (seams §8, the status-strip item). The path link gives up its width before the branch name, and the branch item
is shortened only while it shows a branch name, never its state words (the repair round's finding). The branch item carries the accent-coloured branch icon (`icon`, REQ-SHELL-042)
and REQ-WORKSPACE-020's sentences with their full stop; its detached, non-repository and unread states wait on OQ-193.

**A persona or terminal window's commands answer for the main window that owns it (REQ-MONITOR-069, REQ-STARTUP-163;
fin11).** `runCommand` resolves its window through `MainWindows.forCommand` — the sender's main window, else the owner of
the auxiliary window that sent it, else the active window (process view, main's row; seams §1).

**The cell is settled before the compression check, and no pass calls the agent's own excluded pair (REQ-MONITOR-194,
REQ-MONITOR-080; fin10's first repair round).** `settleBeforeCall` (ladder.ts) follows the overrides and reads the exclusion;
`runTurn` calls it before the automatic compression check as well as `resilientStep` before every call, and
`TurnCompression.withheld` makes no call for a pass on the agent's own excluded pair. The **runtime view**'s ladder and
compression paragraphs say so. No package, edge, process, channel, command, timeline name or store column changed.

**Every model selector annotates a pair held out of quota, and every one's choice clears it (REQ-MONITOR-194,
REQ-MONITOR-146, REQ-NOTIFY-074; fin10).** The record gains `excludedModels` (the live run's `excludedModelKeys`, else a
resting read's, now taken where the timeline holds a `model_exhausted` entry too), which the run header, the inspector and the
composer's chip annotate through `annotatedModelOptions`; the recovery dialog's facts mark such a pair `excluded`. A new
renderer command, `session.chooseNextModel`, carries the composer's next-run choice to the engine after its configuration
write, and `Sessions.chooseNextModel` clears the pair's exclusion; the recovery dialog's restart clears beside its pin. The
**process view**'s command list and `SessionRecord` sentence and the **runtime view**'s ladder paragraph say so. No package,
edge, process, channel or store column changed; one command was added.

**The ladder reads the exclusion before every call, a wait choice persists every waiting pair's override, and compression
follows the agent's cell (REQ-MONITOR-194, REQ-ORCH-091, REQ-SESSION-026, REQ-MONITOR-078/080; fin10).** `resilientStep` reads
the exclusion after `followOverride` and takes `limitPath` without calling (`pre_call: true`); `Run.overrideWaitingPairs` writes
one `model_override` entry per waiting pair; `TurnCompression.compressor()`/`trigger()` are read at each pass from the pair the
cell calls next. The **runtime view**'s ladder and compression paragraphs and its control table say so. No package, edge,
process, channel, command, timeline name or store column changed.

**The status strip is REQ-SHELL-038's (REQ-SHELL-038..047, REQ-TOOLS-131/184; fin10).** `stripItems` in
`packages/ui/src/composer.ts` answers the strip's items in REQ-SHELL-038's order with its accessible names and REQ-SHELL-047's
two thresholds; the run state, the theme's name, the child services and the replica counters are gone from it; the
file-access flag reads `runtime.allow_outside_workspace`. Two commands are new: `workspace.openFolder` (the path link,
REQ-SHELL-040) and `workspace.usage` (the tokens and cost, relayed to the run host, which answers from the stored sessions).
Since 2026-10-03 `● CB armed` follows the saved `circuit_breaker.enabled` from the snapshot (`stripCircuitBreakerArmed`), and
`config:changed` carries each main window, and its persona and terminal windows (`configFamily`), its own workspace's
snapshot (`announceConfig`, `main/config-broadcast.ts`).
The **process view**'s command and run-host request lists, the **state ownership view**'s Settings row (the dirty flag the
strip reads) and the **seams view** §8 (the status-strip item, rewritten) say so. No package, edge, process, channel or
store column changed.

**A background run that ended on a provider limit brings REQ-NOTIFY-063's notice with the focus (REQ-NOTIFY-093/030/031;
fin10).** `runEndingPublication` hands the limit's text beside the quota notice, and `RunFailurePublisher.endedOtherwise`
holds the `quota` class for a session no main window follows, released by the focus as a failure's class is. The
**runtime view**'s focus-gate paragraph and the **state ownership view**'s held-publication row say so. No package, edge,
process, channel, command or store column changed.

**The model chips name the override in force (REQ-CHAT-006, REQ-SESSION-026, REQ-NOTIFY-089; fin8).** The record gains
`modelOverrides` (`overridesInForce` over the run's catalogue and the session's memory; for a session opened from the store,
its workspace's catalogue read once where its timeline holds an override, through the side-effect-free
`SessionsDeps.restingCatalogue` port the run host fills with `restingCatalogueOf` — never the per-run `configure`, whose
MCP configuration load and run maps a read must not touch, as fin8's verifier found the first form did), and `entryRole` names the key the entry role runs on, so
the composer's model chip, the inspector and a persona window say what the next run starts with. The **process view**'s
`SessionRecord` sentence says so. No package, edge, process, channel, command or store column changed. Whether a mid-run
entry switch reaches the next run is the ladder-overrides bundle's open question and is not decided here.

**The project setup dialog stands below the window chrome (REQ-WORKSPACE-106, ADR-0048; fin8, OQ-187).** AppShell gains
a `windowDialog` slot inside the rail-and-view region; `ProjectSetupDialog` is mounted there, `absolute` at the region's
top corner, where it was `fixed` at the window's and lay over the title bar's controls and the notice's answers. The
**seams view** §2's rule for a panel open until answered names it as the window-level exception. No package, edge, process, channel, command or
store column changed.

**A run that ends while its session is not on screen names it (REQ-NOTIFY-031, REQ-MONITOR-202; fin8).** Main's run-result
handler routes a non-failure ending through `RunFailurePublisher.endedOtherwise`, the focus test REQ-NOTIFY-032's gate
already used: a session no main window follows raises `unfocusedEndingNotice` (persistent, `success` or `info`, naming the
session and its normalised state, focusing it) in place of its summary. A new renderer command, `session.release`, tells
main a window no longer follows the session "New session" released; the **process view**'s Part R paragraph says so. No
package, edge, process, channel or store column changed; one command was added.

**The quota-wait chooser annotates the pairs held out of quota (REQ-MONITOR-194, REQ-MONITOR-303; fin8, OQ-186).** The
record's `wait` gains `excluded`, the configured keys whose pair the run's `ResilienceMemory` holds out of quota
(`excludedModelKeys`, read by `Run.currentWait` at every snapshot); the wait header's change-model chooser lists each with
the reason as its hint and leaves it choosable. The **runtime view**'s `setModel` row says so. No package, edge, process,
channel, command or store column changed.
**A take-back records a root on any pair of the override's chain as having followed it (REQ-ORCH-091 d, REQ-MONITOR-142;
the fourth round of `a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced`).** `Run.onChainFrom` classifies
`root_cell: 'followed'` for a root on the taken-back override's own target or any pair past it, not only the chain's end.
The **runtime view**'s ladder paragraph says so. No package, edge, process, channel, timeline name or store column changed.

**An entry switch ends with its run, and OQ-185 asks whether it should (REQ-MONITOR-142/143, REQ-SESSION-026,
REQ-MONITOR-146; ruled 2026-10-06 that it ends with its run, PD-MONITOR-006).** The **runtime view**'s `setModel` row says where a switch is held. No code moved.

**The entry agent's context limit is its ladder cell's model's (REQ-MONITOR-049, REQ-MONITOR-089; the repair of
`the-entry-agents-context-limit-is-read-from-the-requested-model-not-the-one-it-runs-on`).** `Run.entryContext` reads the
limit from the root cell's model. The **runtime view**'s `SessionRecord.entryContext` sentence says so. Nothing else moved.

**An explicit choice clears an exclusion (REQ-MONITOR-194; the repair of
`an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion`).** `ResilienceMemory.clearExhausted`, persisted as a
`model_exhausted` entry carrying `cleared: true`; `setEntryModel` clears the chosen pair, and in a quota wait the waiting
pair itself is a retry. The **runtime view**'s ladder paragraph and its `setModel` row say so. No package, edge, process,
channel, command, timeline name or store column changed.

**A session-wide override is followed from every agent's next call (REQ-ORCH-091 a/d, REQ-MONITOR-194; the repair of
`a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced`).** The ladder reads the session's overrides before
every call (`followOverride`), not only where a cell is built, and the summariser's model is carried through them at each
attempt. The **runtime view**'s ladder paragraph says so. A child's wait choice records `switch_pending` on its
`model_override`, which the autopsy reader places before a pending switch; the **runtime view**'s `setModel` row says so.
No package, edge, process, channel, command or store column changed.

**The status strip names the focused session's confinement backend (REQ-SANDBOX-121, REQ-MONITOR-257, REQ-NOTIFY-030;
fin8).** Store v31 appends `sessions.sandbox_backend`, written beside `sandboxed` when a run starts; the record carries
`sandboxBackend`; the strip draws `sandbox: <backend>` for a focused session whose record says confined, and nothing
otherwise. A run of an existing session refused at the confinement gate republishes its record unconfined until a run of it
starts (REQ-NOTIFY-061; repair round 1, `Sessions.refusedAtStart`, held in memory, not in the row). The **runtime view**'s
`sessions` row, the **process view**'s `SessionRecord` line, the **state-ownership view**'s run-host row for that refusal
and the **seams view** §8 (a worked status-strip item) say so. No package, edge, process, channel or command changed; one
store column did.

**The retry resubmits the session's last prompt from the store, images included (REQ-NOTIFY-045, REQ-SESSION-192,
REQ-CHAT-173; fin8).** A notice's retry with a blank draft is one command, `session.retry`, renderer → main → run host
(`Sessions.retry`), in place of the window's search of its replica, and the prompt's images go with it, read back from the
session's directory and verified by digest (`readBackAttachments`); `lastSubmittedPrompt` (over `StoreDal.lastPromptRow`, resident and released rows alike)
is the one reading of a session's last prompt the retry, the continue, the plan decision and the authentication restarts
share. The **process view** lists the command on both boundaries, the **runtime view**'s continuation lease names it, and
the **seams view** §6 says where a blank-draft retry lands. No package, edge, process, channel or store column changed.

**An authentication restart relaunches the failed run's own launch (REQ-NOTIFY-070, REQ-NOTIFY-074, REQ-ORCH-154; the
401 note's part A, fourth repair round).** `Sessions.relaunchAfterAuthFailure` is the one restart path of the automatic
fallback and of the recovery dialog: a run a plan decision launched (`Live.planLaunch`, kept with that run) is relaunched as
that decision, any other by re-submitting the last prompt. The **runtime view**'s two restart paragraphs and the **process
view**'s dialog entry say so. No package, edge, process, channel, command or store column changed.

**The automatic fallback goes ahead of the recovery dialog (REQ-NOTIFY-068, REQ-NOTIFY-070, REQ-NOTIFY-072, REQ-NOTIFY-079;
the 401 note's parts A and B merged beside C and D, 2026-10-02).** The two builds of REQ-NOTIFY-060's classes are one:
`main/failure-class.ts` and `main/run-failure-notice.ts` (parts C and D) classify and word every ending, and the focus gate
(`RunFailurePublisher`) asks the automatic half first for an authentication failure — `main/failure-recovery.ts`, renamed
**`main/auth-fallback.ts`** and narrowed to the first failure's restart and the prompt (its notices and its classifier were
the gate's twins and are gone) — and opens the recovery dialog only where that answers `dialog` (a second failure, or a first
with no usable fallback); the dialog's opening closes every prompt, and the primary the fallback restarted away from joins
the dialog's refused pairs (`AuthRecovery.refuse`). The run host's `session.restartOnFallback` refusals now carry the code
main reads that by (`NO_USABLE_FALLBACK`). The **runtime view**'s classification paragraph, the **state-ownership** rows of
the first-failure bookkeeping, the prompt and the refused pairs, and the **seams view** §1 (nineteen facets) and §2 say so.
No package, edge, process, channel, command or store column changed.

**A board run is settled against its own workspace (REQ-TRACE-477, REQ-TRACE-466, REQ-TRACE-476).** Main's run coordinator
keeps each board run's workspace root and id; the run's ending, its waiting fact and the dispatch after its end address
that workspace's service, and the run host's exit reaps every workspace that held a run. This repairs
`a-board-run-is-settled-against-the-focused-windows-workspace-not-its-own.md`; `requirements-runs.test.ts` pins it. The
**process view**'s requirements paragraph and the **sequences view**'s board section say so. No package, edge, process,
message kind, channel, command or store column changed.

**One acceptance suppresses the disclosure for the rest of the launch (REQ-TRACE-472).** `requirements.runs` gains the
`accept` op: the board's plain acceptance tells main's coordinator, which holds it in memory for the launch and reads
`accepted` — a new value of `StandingDisclosure` and of `LaunchPreview.disclosure` (`packages/contracts/src/requirements.ts`)
— in the standing disclosure it stamps on every service command and in the preview, which the board answers without the
dialog (`disclosureFor`). This repairs `accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md`;
`requirements-proof`'s `disclosure-launch` stage shows it. The **process view**'s requirements contracts and the
**sequences view**'s board section say so. No package, edge, process, message kind, channel or store column changed;
the command gained one op value and the envelope's disclosure one value.

**An automatic queue dispatches at a workspace open and after a reject (REQ-TRACE-476, REQ-TRACE-482).** Main's run
coordinator gains `opened(root, workspaceId)`, a dispatch for the workspace just opened, kicked once from
`openWorkspaceInner`'s post-open slot; its dispatches are serialised per workspace root rather than one at a time. The
board kicks it after an act that rests a card in `ready` under automatic scheduling (`dispatchesAfter`). This repairs
`an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`; `requirements-proof`'s
`ready-restart-automatic` stage shows it. The **sequences view**'s board section says so. No package, edge, process,
message kind, channel, command or store column changed.

**A rejected card's next unit begins on a fresh tree (REQ-TRACE-423, REQ-TRACE-464, REQ-TRACE-482).** The delivery
service treats a launch held for an earlier unit as spent: the scheduler names the card's current unit, and the claim
provisions it when the store records no tree for it, writing the row at once through the writer's new
`recordWorktreeProvisioned` (`workspace/src/delivery/transition.ts`, `handles.ts`). A claim before the first pass under
`manual` with nothing armed answers without parsing the store. This repairs
`a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`; `requirements-runs-proof`'s eighth assertion shows it.
The **sequences view**'s board section says so. The writer gained one method (a row write, no delivery state); no
package, edge, process, message kind, channel, command or store column changed.

**A failed run's notice waits for its session to be on screen, and a pair that failed authentication is not offered again
(REQ-NOTIFY-030/032, REQ-NOTIFY-064, REQ-NOTIFY-068; the 401 note's repair round 1).** Every run-ending notice is built by
`main/run-failure-notice.ts`; a failed run of a session no main window follows raises REQ-NOTIFY-032's warning and holds its
class publication — the recovery dialog included — until `session.subscribe` follows it (`MainWindows.followerOfSession`).
Main keeps the pairs that failed authentication by session until their provider's credentials change. The **runtime view**'s
classification paragraph and two **state-ownership** rows say so. No package, edge, process, channel, command or store
column changed.

**The recovery dialog re-authenticates the provider that failed (REQ-NOTIFY-076, REQ-NOTIFY-077, REQ-NOTIFY-202, OQ-179; the
401 note's part D).** A fourth command, `authRecovery.reauthenticate {apiKey}`, carries a key inward to main's provider key
store (`ProviderService.reauthenticateWithKey`, stage-typed so a storage failure is told apart) and relays
`session.authRestart` with no model key, which restarts on the same model without a pin. The **process view**'s command
and run-host message entries and the **runtime view**'s classification paragraph say so. No package, edge, process, channel
or store column changed.

**A failed run is classified, and an authentication failure opens the recovery dialog (REQ-NOTIFY-060, REQ-NOTIFY-064,
REQ-NOTIFY-067, REQ-NOTIFY-072..075, REQ-NOTIFY-079/080; the 401 note's part C).** Main matches a failed run in REQ-NOTIFY-060's
order (`main/failure-class.ts`); the generic class raises REQ-NOTIFY-064's notice with the workspace action; the
authentication class asks the run host `session.authRecovery` and opens a 560 px modal window, role `auth-recovery`, whose
Retry is relayed as `session.authRestart` (`Sessions.restartAfterAuthFailure`: a `model_override` pin against the failed pair,
the last prompt re-submitted). The **process view** gains the window, the two run-host message kinds and the three
`authRecovery.*` commands; the **runtime view** the classification paragraph; the **seams view** §1 the `auth-recovery`
facet (its count corrected: eighteen, not sixteen); the **state-ownership view** the open dialog's row. No package, edge,
process, channel or store column changed.

**A closing terminal frame no longer blanks a preview (REQ-SHELL-102, REQ-CHAT-063, REQ-CHAT-076).** The renderer's
`TerminalStreamSet` holds, for `previewOf`, the screen a `screen` frame's reset replaces, from the parser reaching that
reset (`applyFrame`'s `resetReached` hook, an empty write queued ahead of it) until the text has parsed (its `parsed`
hook), and notifies its listeners again with a new outcome, `parsed`, once it has. The **process
view**'s live-terminal paragraph says so. This repairs
`a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md`. No package, edge, process, message kind,
command or store column changed.

**The re-authentication prompt yields to an expanded plan gate (REQ-NOTIFY-071, REQ-ORCH-153, ADR-0048, OQ-181; the 401
note's part B, third repair round).** Beside an expanded gate the prompt is drawn as a bar (its title and its answers) so the
gate keeps its three answers and the plan its height. The **seams view** §2 states the rule (in flow is not enough beside
another panel open until answered: the one the run is not stopped on yields to one row of its answers) and the **runtime view** the placement. No package, edge, channel, command or
store column changed.

**A plan cycle's 401 is restarted on the fallback (REQ-NOTIFY-070, REQ-ORCH-153; the 401 note's part A, third repair
round).** `Run.recordRootModelFailure` records the failed model with the run's last failure on every root turn, the plan
cycle's included; the **runtime view** says so. No package, edge, channel, command or store column changed.

**The re-authentication prompt is laid out in flow and overlays nothing (REQ-NOTIFY-071, ADR-0048, OQ-181; the part B
second repair round).** AppShell's **`windowPanel`** slot is removed; the Workspace view draws the followed session's
prompt (`WorkspaceView`'s `reauthPrompt`) as its own grid row, **`reauth`**, between the run header and the transcript,
declared in every template of the view's grid. The **seams view** §2 states the rule this leaves (a non-modal surface open
until answered is laid out in flow, never as an overlay) and the **runtime view** the placement, each with the
falsified reading kept. No package, edge, channel, command or store column changed.

**The re-authentication prompt follows the focused session and covers no window control (REQ-NOTIFY-030, REQ-NOTIFY-071,
ADR-0048; the part B repair round).** Channel 13 now carries `{sessionId, prompt}` to every main window, a new renderer
command **`reauth.read`** answers the open prompts for a window that mounts later, and each window draws the followed
session's prompt alone. AppShell gains a **`windowPanel`** slot inside the rail-and-view region, where the prompt is
drawn, below the title bar and the notice slot. The **seams view** §2, the **process view**, the **runtime view** and
**state ownership** say so, each with the first build's reading kept beside the correction. No package, edge or store
column changed.

**The non-modal re-authentication prompt (REQ-NOTIFY-071/078, ADR-0048; the 401 note's part B).** A new main → renderer
channel, **`reauth:prompt`** (channel 13), carries one session's prompt or null to the window that follows it; two
renderer commands answer it, **`reauth.submit {sessionId, apiKey}`** and **`reauth.dismiss {sessionId}`** (facet
`main/commands/reauth.ts`); and the run host gains **`session.repinPrimary`** → `session.primaryRepinned {applies}`
(`Sessions.repinPrimary`, `Run.rebuildEntryFromMemory`). The **seams view** §2 counts thirteen channels and names this one
the worked example of a window-level non-modal surface fed by main, §1 the seventeenth facet; the **process view** lists
the channel, the commands and the request; **state ownership** the prompt main holds; the **runtime view** the switch
back from the next iteration. No package, edge or store column changed.

**A failed run is classified in REQ-NOTIFY-060's order, and a first 401 restarts on the fallback (REQ-NOTIFY-060/064/
067/069/070, REQ-MONITOR-147, REQ-SESSION-026; the 401 note's part A).** Main's run-result handler hands a result carrying
failure text to `main/failure-recovery.ts` (now `main/auth-fallback.ts`, below; classes in `main/failure-class.ts`), the one writer of a run failure's notice:
REQ-NOTIFY-064's generic notice with `Return to the workspace`, REQ-NOTIFY-063's as before, and for a first authentication
failure the new run-host request **`session.restartOnFallback {sessionId}`** → `session.fallbackRestarted {failed,
fallback}` (`Sessions.restartOnFallback`: the `model_override` entry keyed by the failed pair, `cause: authentication`,
and the last prompt re-submitted; a `cleared: true` entry takes a pin back). The **process view** lists the request, the
**runtime view** the classes and the restart, **state ownership** main's first-failure bookkeeping. No package, edge,
channel, command or store column changed.

**The run-wide compression count reaches the record and the agent surfaces (REQ-MONITOR-086, REQ-MONITOR-281, OQ-159).**
`SessionRecord` gains `compressions`: the live run's maintained aggregate while a run is live (`Run.compressions`), else the
stored `sessions.compressions` (`runCompressionsOf`). The run-level agent carries it in place of the children-only sum, so a
root's own compressions are counted, and the inspector's ring caption and the persona window's context card draw the count
as an element of their own (`inspector-compressions`, `persona-compressions`). The **runtime view**'s entry-record paragraph
says so. This repairs `the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md`. The
snapshot channel's `SessionRecord` gained the field; no package, edge, process, message kind, command or store column changed.

**An entry switch applies from the next iteration, over a ladder move (REQ-MONITOR-142, REQ-ORCH-090, REQ-ORCH-091,
OQ-177).** `Run.pendingEntrySwitch` holds a user's switch until `rootResilience`, now read once per root turn (an
iteration, its resumes after its children included), applies it: a model switch rebuilds the root's cell on the chosen
model even onto the one it was last built from (`rootRebuildsFor` counts it, so every switch records `rebuilds: true`), the
once-per-agent budgets carried over; a reasoning switch sets the level on the model the cell has; a switch onto a pair a
change-model resolution moved says where the entry agent runs instead (`ResilienceMemory.overrideReaching`). The
**runtime view**'s `setModel` row says so. **The retry notice action has a target, and a refused confinement mode raises
REQ-NOTIFY-061's notice (REQ-NOTIFY-045, REQ-NOTIFY-061, OQ-178).** `retry-run` dispatches to the renderer's `retryRun`,
and the confinement gate's refusals carry the code `session.confinement` from the run host to main's
`confinementRefusalNotice`, for a start, a prompt and a continue; the **seams view** §6 says the first, the **runtime
view**'s refused start the second. No package, edge, process, message kind, channel, command or store column changed.

**A switch of the entry model records whether the root's cell is rebuilt for it (REQ-MONITOR-142, REQ-ORCH-090,
REQ-ORCH-091).** `setEntryModel` writes `entry_model_switched` with `{ model, rebuilds, supersedes }`, `rebuilds` being
the test `rootResilience` applies at the next turn (`Run.rootRebuildsFor`) and `supersedes` saying the switch replaces one
the root never took a turn on (`Run.entrySwitchPending`; the root's own wait choice records it on its `model_override`
too), so the autopsy reader ends a ladder move of the root only on a switch that rebuilt its cell. Each ladder move of the
root records `switch_pending` (`TurnResilience.switchPending`), so the reader reads a move made while a switch was pending
before that switch, and reads a superseded switch as if it were not recorded, every record since it read again. The
**runtime view**'s `setModel` row says so. This repairs
`the-autopsy-reader-reads-a-switch-onto-the-configured-model-as-ending-a-fallback.md`; the timeline name is unchanged. No
package, edge, process, message kind, channel, command or store column changed.

**A setup that finishes before its start is answered is seen to finish (REQ-WORKSPACE-084/103/109, OQ-169).** The
initialization coordinator keeps the latest `mcp.setupStatus` pushed while its own start request is in flight
(`setupEarly`) and drains it after the answer when it is the same setup's. Where the drained status has every step
ended and still reads `running`, it asks the run host's status once. This repairs
`a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`; `workspace-proof`'s scenario 8g shows it.
The **process view**'s initialization paragraph says so. No package, edge, process, message kind, channel, command or
store column changed.

**A role's pending edits keep each field's scope through the save (REQ-CONFIG-259, REQ-CONFIG-341).** The Personas
table's pending edits are held per role and per scope (`PendingRoleEdit` is `{ workspace?, global? }`), and
`applyChange` writes a change under its own scope only. `RoleEditSchema` carries the same two-scope shape in place of one
`scope`, strictly. `saveDesktop` writes each scope's part in its own file (`roleEditAt`). The Personas row shows the
pending edit made at the selected scope. This repairs `a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md`,
in two rounds. The first gave each field one scope, and a second edit of the same field at the other scope dropped the
first. `settings-proof`'s launches 9 and 10 show it. The **seams view** §5 says so. The `config.save` payload's role entry
changed shape. No package, edge, process, message kind, channel, command or store column changed.

**A card resting in `ready` across a restart is disclosed and started from the queue (REQ-TRACE-472, REQ-TRACE-482,
REQ-TRACE-464).** The delivery service's `recoverLaunch` (`workspace-service/delivery.ts`) rebuilds a launch the restart
lost from the store's worktree row through `RunGitPort.takeOver`, never by provisioning. It runs once on the first pass
after a start and again on the queue's release, which records the disclosure it carries. A tree that cannot be taken
over is stated on the queue entry. `beforeCommit`'s own take-over now shares `takeOverRecorded` with it. This repairs
`a-card-resting-in-ready-across-a-restart-can-never-be-started.md`; `requirements-runs-proof`'s sixth assertion shows
it. The verifier falsified two of its clauses the same day. First, the recovery ran on the restart reap's pass only, so a
first parse that failed used it up; it now runs on every pass that parses. Second, a recovered launch was undisclosed with
no way to learn main's preferences. Main's coordinator now sends its standing disclosure (`due`, `suppressed`, `off`) on
`requirements.run.claim`, a new optional field of that command. `requirements-runs-proof`'s seventh assertion shows it.
The **sequences view**'s board section says so. No package, edge, process, message kind, channel or store column changed.
**Corrected in a second round the same day:** sent on the claim alone, the value split the scheduler, and the queue the
board published still asked for a disclosure the claim no longer needed. The field moved off `requirements.run.claim`
onto the `requirements.command` envelope, beside the actor, stamped by main's relay and its coordinator on every command;
the service holds the last value and schedules the published queue, the preview and the claim under it. The **process
view**'s requirements contracts and the **sequences view**'s board section say so. No package, edge, process, message
kind, channel or store column changed.

**A unit's worktree is provisioned once, and a later start of the same unit takes it over (REQ-TRACE-464,
REQ-GIT-140).** The delivery service's `beforeCommit` takes over the tree of the launch it holds when that launch is
for the derived unit and its tree is on disk. It provisions only a unit with no tree. After a restart it takes over the
store's worktree row for that unit through `takeOverUnitWorktree` (`workspace/src/delivery/runs.ts`, the new
`RunGitPort.takeOver`), and `provisionUnitWorktree` is unchanged. This repairs
`a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`. The **sequences view**'s board
section says so. No package, edge, process, message kind, channel, command or store column changed.

**One measurement observer per transcript pane, a held scrollbar gutter, and a delivery held to the committed span (ADR-0045, REQ-CHAT-055, REQ-CHAT-058).**
`TranscriptPane.tsx` makes its measurement observer once, at mount. Its effect no longer depends on the displayed rows or
the capacity, so a pending passive effect flushed inside the delivery's own `flushSync` can no longer disconnect the
delivering observer and observe every slot again. A slot that a displayed change rebinds is observed by the every-commit
`observeAgain`. Each slot's ref callback is made once (`slotRef`, `pool.ts`); a slot whose node unmounts is unobserved and
forgotten, so a node mounted later in that slot is observed again. `.transcript__scroll` holds its scrollbar gutter, so the
width the rows are measured at never changes with the bar. And the delivery's synchronous render binds the span of rows the
pool last committed (`bindRange`, `pool.ts`), so it moves rows and rebinds no slot; an ordinary render after the frame
releases it. Without the hold, a corrected height above the viewport moved the span and rebound every slot inside the
delivery, which left the console line at the end of `transcript-proof`'s append runs after the first two repairs. The
**runtime view**'s transcript paragraph says all three, and corrects its "never added to or removed from" for the pool,
which the capacity growth of 2026-10-01 had falsified. This repairs
`the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md`, and `transcript-proof` fails on the
console line in any launch. No package, edge, process, message kind, channel, command or store column changed.

**A dialog opened while the composer's send is settling keeps its focus (REQ-MONITOR-137, REQ-CHAT-002).** The
composer's awaited submissions (a queue, a start or continue, an executed slash command) return the focus through one
rule, `composerReclaimsFocus` (`ui/src/composer.ts`): to the composer only when the focus is nowhere, in the composer, or
still on what held it when the submission began. Main's `session.subscribe` gains a verification seam,
`ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS`, which holds its reply after the attach; the **process view**'s subscription
paragraph says both. This repairs `a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`;
`part-j-proof`'s steer-early launch (scenario 2b) shows it. No package, edge, process, message kind, channel, command or
store column changed.

**The intent status after a continue is the continuation's (REQ-ORCH-014, OQ-162).** The record's `intent` reads the
newest `run_continuation_intent` entry's payload, else the launch audit's (`intentPayloadOf`, `sessions.ts`, over the
new `StoreDal.latestTimelineEntry`, a read under the timeline's primary key whose plan `store.test.ts` asserts), and
reads `classifying` while the live run's pre-flight classification is in flight (`Run.intentClassifying`), a
continuation's included, so the previous run's intent is not shown meanwhile. This
repairs the header half of `docs/defects/fixed/continue-classifies-the-intent-again-and-widens-the-resumed-roots-tools-mid-iteration.md`,
whose other half stayed OQ-162's until its ruling (R-071, 2026-10-06; built below). The **runtime view**'s `Run.start()` order says so. No package, edge, process, message
kind, channel, command or store column changed.

**A wait the run imposes is not a stall (REQ-MONITOR-117..119, REQ-ORCH-091, REQ-ORCH-092, REQ-ORCH-093, ADR-0060,
OQ-173).** `StallWatch.imposedWait` (`children/stall.ts`) holds a stall watch's evaluation off the silence while the run
holds the agent between two model steps: `resilientStep`'s backoff and suspended wait (`LadderDeps.imposedWait`) and a
compression's own model call (`runTurn`'s `compressing`), both through `TurnDeps.onImposedWait`, which `Run.turn` wires to
the root's watch and `execute` to each child's. Such a silence is logged as the wait it is (`stallImposedWaitLine`), and
the release restarts the silence. This repairs `a-provider-wait-or-a-compression-is-counted-as-a-stall.md`. The
**runtime view**'s stall-watch paragraph says so. No package, edge, process, message kind, channel, command or store
column changed.

**The run host's shutdown ends the setup, and a step's termination reaches what it started (REQ-WORKSPACE-092/109,
ADR-0035, ADR-0064).** On POSIX each code-intelligence setup step now leads a process group, and its ask and force-kill
go to the group. The run host's `shutdown` ends a setup under way with a 2 s grace (`McpHost.endSetup`) before it exits.
The initialization coordinator says a cancellation undelivered at a quit at `info`, reading `QuitState`. See the process
view, `mcp.setup` and `initialization.*`, and the runtime view's paragraph on the application's end; the 2 s grace
overrides REQ-MCP-099's 5 s at a close, the build's reading of OQ-172 *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): every stop of a
setup step gets the 2 s grace)*. This repairs
`an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`. No package, edge,
process, message kind, channel, command or store column changed.

**Initialization is each window's own workspace's (REQ-WORKSPACE-013/102/105, PD-SHELL-001, ADR-0064).** The
`initialization.*` commands answer for the sending window's workspace. The coordinator keys every method by root and
publishes channel 12 to the windows holding that root (`MainWindows.holding`). Its setup port addresses the run host by
the run's own workspace identifier, and `config`'s registry tells an applicability predicate which workspace it is
judged for (`ApplicabilityContext`). See the process view, `mcp.setup`, `initialization.*` and channel 12. This repairs
`initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`. No package, edge, process, message
kind, channel, command or store column changed.

**Every task and phase id the engine assigns is 8 lowercase hexadecimal characters (REQ-CHAT-089, REQ-CHAT-040).**
`mintTodoId` (`run/todo.ts`) mints each, unique within the todo and, for a planner task, among the task ids the session's
iterations recorded: the first run's task (was `<session>:main:1`), a continue's (`continuedTaskId`, was
`<session>:continued:<n>`), a queued prompt's (`Run.consumeQueued`, was the prompt's UUID — the prompt is found by its
task's name and the `prompt_triggered` entry), a planner todo edit's added task (the id a request sends is no longer
recorded), an improvement run's tasks and phase (`Todo.seeded`, at the run's creation of its todo from main's plan; they were
the proposals' `imp_…` ids and no phase id — the proposal stays named in each task's payload), and a user's add to an
agent's or a child's todo (`editAgentTodo`, now minted against the document's ids). A planner phase gains an optional `id`
(`Phase.id`), minted where `Todo` creates the phase; the plan shows it (`projectPlannerTodo`), and an edit names a phase by
it or, for a phase an earlier build created with none, by its name. Records under the old forms read back unchanged.
This repairs `a-queued-prompts-task-id-is-not-eight-hex-characters.md`; `part-j-proof`'s queue scenario asserts it. The
**runtime view**'s loop diagram and §2 iteration paragraph say so. No package, edge, process, message kind, channel,
command or store column changed (the todo column's JSON gains the phase's `id`).

**A later run's teardown no longer re-arms the crash record's ring settle over an earlier parked run's rows
(REQ-MONITOR-105, REQ-MONITOR-228, REQ-SESSION-129, REQ-ORCH-153, REQ-ORCH-087, ADR-0024, OQ-170).** `Sessions` keeps, per
live session, every run of this process that parked without closing its tool ports (`Live.portsOpen`); a continue passes
`ownCallsMayRun` while any of them has its ports open, and a run leaves the set once it has closed them. Before, only the
session's current run was read. This repairs residual 2 of `a-parked-runs-call-that-never-returns-keeps-its-ring-row-running.md`,
which ~~stays open for residuals 1 and 3 (OQ-170)~~ stayed open for residuals 1 and 3 until OQ-170 was ruled and the note
closed (fin21, 2026-10-06: "A parked run closes its tool ports" above). The **runtime view**'s §2 crash paragraph says so. No package, edge,
process, message kind, channel, command or store column changed.

**One fact, one emitter in the application log (PD-MONITOR-002, live-run finding a71-9).** Main's `repository.read` and
`git.read` handlers no longer restate the workspace service's repository and Git-view lines, main's credentials ask no
longer writes "credentials leased: …" beside the run host's `LeaseReportLog`, and `runSetupSteps` no longer writes
"succeeded in N ms" beside the run host's step reporter. The **process view**'s application-log paragraph names each
fact's owner. This repairs `the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md`. No package, edge,
process, message kind, channel, command or store column changed.

**A paused child cancelled while `session_end` runs fires no `child_completed` (REQ-HOOKS-076, REQ-HOOKS-081,
REQ-HOOKS-003, REQ-ORCH-133, OQ-154, R-067).** `Run`'s teardown calls `IterationChildren.endLifecycle` once it has awaited
the outside hooks (`childCompletionsSettled`) and before it fires `session_end`; from then `completedOutside` queues none,
so the user's cancel of one paused child, still accepted until the run has ended, ends it `cancelled` with no hook after
`session_end` — OQ-154's built reading, recorded there as its fifth path. The defect note
`a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md` ~~stays open for the ruling~~ stayed open for the
ruling; OQ-154 was ruled 2026-10-06 (R-071) as built and the note is in `fixed/`. The **runtime
view**'s hooks paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A child the explicit cancel's grace gave up on is counted (REQ-MONITOR-102, REQ-SESSION-092, REQ-SESSION-094,
REQ-SESSION-129, OQ-96, R-067).** `IterationChildren.closeGivenUpOn` answers the open calls of every child a stop's grace
gave up on that no rest left `paused` as cut off, naming no rest, and counts it from its record (`countGivenUpOn`), terminal
or not. `Run.turn` calls it after the explicit cancel's `outlast` gives up; `rest` calls it in its early return (which it
replaces) and after it pauses, for a child the user had already cancelled on its own. This repairs
`a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`. The **runtime view**'s §4 rest paragraph and its
`children` row say so. No package, edge, process, message kind, channel, command or store column changed.

**The MCP section prints only what the agent can call (REQ-MCP-062, REQ-ORCH-153).** While the plan gate held, the port's MCP
loop withheld every server tool from the callable map and the listing, and the section, rendered from the surface the loop
was given, still printed it; a tool dropped for colliding with a native name was printed the same way. `ready()` now renders
the section, and draws the grant, from the surface narrowed to the tools that joined the callable map. Approval launches a
new run whose ports are built with the gate released (pinned in `run/plan-gate.test.ts`). This repairs
`an-mcp-tool-withheld-at-the-plan-gate-is-still-printed-in-the-prompt.md`; the **runtime view**'s MCP surface says so. No
package, edge, process, message kind, channel, command or store column changed.

**The run-level agent is drawn as the latest root's persona, not the first root's (REQ-MONITOR-060/069, PD-ORCH-003,
OQ-97).** The renderer's `entryOf` named the run-level agent, and chose the declared tools standing in for its chips, its
model and its reasoning, from the transcript's first agent row no child carries, while its chips were marked from the
latest root's history. It now hands to `packages/ui`'s new `entryRole`: while a run is live, the persona its root runs as,
`SessionRecord.entryPersona` (new, from `Run.entryPersona`; null with no live run), so the name is the root's from the run's
start, before that root has written a row; at rest, the last row a root authored of any kind a turn writes under its
agent's name (`agent`, `tool`, `thinking`, `diff`), a row named for one of `SessionRecord.entryRoots` preferred. (The first
repair read the last `agent` row alone, and a live root whose first steps were tool calls was drawn as the root before it:
the verifier's finding.) This repairs
`after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`; the **runtime view**'s
`entryTools` paragraph says so, and the reading is recorded beside OQ-97. `SessionRecord` gains one nullable field; no
package, edge, process, message kind, channel, command or store column changed.

**A grant the controls left empty of native tools is drawn as none, not as the declared tools (REQ-MONITOR-049/060,
REQ-TOOLS-006, REQ-MCP-065).** `recordChildGrant` adds `recorded: true` to the `granted_mcp` object it writes, and the
projection carries it as the new `AgentRecord.grantRecorded` (a contract field); `resolvedTools` lets the declared tools
stand in only where no grant was recorded. A row without the marker — the spawn's, and every row written before
2026-10-01 — keeps the old reading, `[]` as no grant recorded. This repairs
`a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md`; the **runtime view**'s `AgentRecord` passage and its
`children` row say so. No package, edge, process, message kind, channel, command or store column changed.

**A child's row records the grant its port put in force, not its persona's declared tools (REQ-MCP-065, REQ-TOOLS-006,
REQ-MCP-114).** The spawn wrote `children.granted_tools` from the persona's declared tools and `granted_mcp` from its MCP
surface before any control, so a tool `coordinator_only`, `read_only`, `tool_restrictions`, the `restricted` preset or the
plan gate removed was recorded as granted. The spawn now writes neither, and the child's execution records the port's
`ToolPort.grant` once the port is ready (`ChildLedger.recordGrant` → `SessionWriter.recordChildGrant`, a `save`
republished; `McpHost.evidenceFor` and `Persona.mcpEvidence` removed for the run host's `grantEvidence`). The recording is
started beside the child's first turn, not ahead of it, so the payload is in the conversation record while readiness is
pending. This repairs `a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`; the **runtime view**'s MCP
surface and its `children` row say so, and ADR-0034's evidence passages are corrected in place. No package, edge, process,
message kind, channel, command or store column changed.

**A setup step reads in REQ-WORKSPACE-091/092's words (ADR-0064, OQ-175).** `McpSetupStep` gained three optional facts
set by the run host's `runSetupSteps` — `skipped`, `output` and `startError` — and the initialization coordinator writes the
requirements' fixed sentences and the output's last 400 bytes from them, the MCP category keeping the run host's `detail`
(process view, `mcp.setup`). This repairs `the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`. No
package, edge, process, message kind, channel, command or store column changed.

**A setup start the run host never answers fails in REQ-WORKSPACE-093's words (REQ-WORKSPACE-084/093/103, OQ-169, ADR-0064).**
The initialization coordinator catches a `setup.start()` that rejects and reports it as a retryable failure in this
domain's summary rather than as a task with no outcome (process view, `initialization.*`). This repairs
`a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md`. No package, edge, process, message
kind, channel, command or store column changed.

**A setup whose finished status never arrives still ends (REQ-WORKSPACE-084/109, OQ-169, ADR-0064).** Main tells the
initialization coordinator when the run host exits (`onRunHostExit`), and a follow is bounded by the stage budgets plus
REQ-WORKSPACE-092's 5 s each (`SETUP_FOLLOW_BOUND_MS`); either ends it as a retryable failure and the next setup's turn
comes (process view, `initialization.*`). This repairs
`nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`. No package, edge, process, message kind,
channel, command or store column changed.

**A closed workspace's failed resolution raises no banner (REQ-WORKSPACE-013/102, OQ-141, ADR-0064).** The initialization
coordinator's resolution, failing after its workspace was closed, says so in the log at info level and raises no
"Project setup could not be checked" banner, as `publish` already showed nothing of it (process view, `initialization.*`).
This repairs `a-closed-workspaces-resolution-can-still-raise-the-resolution-failed-banner.md`. No package, edge, process,
message kind, channel, command or store column changed.

**A stopped setup step reads in REQ-WORKSPACE-092's words (ADR-0064, R-067).** `McpSetupStep` gained an optional `stopped`
(`cancelled` or `budget`) set by the run host's `runSetupSteps`; the initialization coordinator writes the requirement's two
sentences from it and the MCP category keeps the run host's `detail` (process view, `mcp.setup`).

**A refused setup start is a retryable failure, not "not a local launch" (REQ-WORKSPACE-093/094, ADR-0064, R-067).** Main's
setup port carries the run host's refusal code with its words, and the initialization coordinator keeps REQ-WORKSPACE-094's
non-retryable words for the `unavailable` status alone (process view, `mcp.setup`; runtime view, the project setup; OQ-167).

**A child the stale settle ends, or a plan cycle's child a crash ends, is counted and its cut rows settle (REQ-MONITOR-102,
REQ-SESSION-129, REQ-ORCH-053, OQ-96, R-067).** `recordCutChild` (`run/crash.ts`) answers one child's open calls and adds
the calls its record holds to the session total. `recordPlanRootCrash` runs it for the plan cycle's unfinished children,
and `settleStaleChildren` runs it for each child before the `cancelled` move. This repairs
`a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running.md`. The **runtime view**'s crash
paragraph and its launch sequence say so. No package, edge, process, message kind, channel, command or store column changed.

**A child cancelled outside its execution is torn down (REQ-ORCH-098, REQ-ORCH-133, REQ-ORCH-053, PD-ORCH-005 clauses 6
and 16, OQ-152, R-067).** The user's cancel of one child and its live descendants, the cancel of a paused child at rest,
"continue without them", the crash record of an accepted cancel and the stale-child settle each write `child_end`,
`child_result` and `child_conversation_closed` after the report they store (`writeCancelledTeardown`). `writeTeardown`
moved from `children/orchestration.ts` to `children/ledger.ts`, beside `storeChildReport`, and stamps its `child_end` with
the writer's clock (`SessionWriter.wall`, a new read-only accessor). This repairs
`a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`. The **runtime view**'s "A child settled
without its turn" paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A plan cycle's chips after an iteration read the plan cycle root's history (REQ-MONITOR-060, REQ-MONITOR-069,
REQ-ORCH-153, PD-ORCH-003).** With no run live and an iteration recorded, `entryToolsOf` reads the tracker under the latest
plan cycle root's persona when that root opened after the latest iteration (`plan_roots`, store v30), and under the
iteration root's otherwise. This repairs `a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`.
The **runtime view**'s `entryTools` paragraph says so. No package, edge, process, message kind, channel, command or store
column changed.

**A todo edit at rest and the quit's terminal record hold the lock (ADR-0005, REQ-EVENTS-098, REQ-CHAT-090, PD-ORCH-005
clause 10).** `editStoredTodo` claims through `claimHold` before it writes and is refused `session_locked` (REQ-SESSION-048's
words) or `store_failed` with nothing written; `closeAll`'s quit record of a resting session's background sessions
(`recordQuitTerminals`) claims the same way and records nothing of a session another live process holds. This repairs
`a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md`. The **runtime view**'s §6 lock paragraph, the
`announceShutdown` control row and the `session_locks` row, and the **state-ownership view**'s session-lock row say so. No
package, edge, process, message kind, channel, command or store column changed.

**A row that grows is measured at the commit, before it is painted (PD-CHAT-003, REQ-CHAT-058, ADR-0045, R-067).** A row whose
content changed was placed by the height its identity drew last until the observer's delivery rendered a frame later, and a
row that grew was painted through the row beneath it. The pane now reads every bound slot with no measurement of its present
key after the commit and renders again inside it when the height differs (`measureAtCommit`), and a size that changes under an
unchanged key, with no commit, is rendered synchronously from the observer's delivery, before the paint (fix round 1). This repairs
`a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md` (acceptance A37); the **runtime view**'s
"What paints it" says so. No package, edge, process, message kind, channel, command or store column changed.

**The transcript pool counts its capacity in the shortest row a slot holds (REQ-CHAT-165, PD-CHAT-003, ADR-0045, R-067).**
The 30 px unit was taller than a one-line system notice inside a block (23.8 px), so a tall viewport of them inside `H_max`
was blank below the 154th slot. `SHORTEST_ROW_HEIGHT` (20 px) makes the pool 226 slots, and `visibleRange` sheds its
overscan before a visible row. This repairs `the-pool-capacity-assumes-no-row-is-shorter-than-thirty-pixels.md` (acceptance
A38); the **runtime view**'s "What paints it" says so. No package, edge, process, message kind, channel, command or store
column changed.

**A confirmed run cancel is shown cancelling on every surface of the window that sent it (REQ-MONITOR-127/130/296, OQ-165,
R-067).** The renderer's `cancelRun` lays a run overlay (`cancel-overlay.ts`, `beginRun`) over the window's record before it
sends the reserved run id's `cancelAgent`: the session's status reads `cancelling` in the run header, the composer, the
status strip, the Mission view's subtitle and run row, and a persona window's run instance (its state label and tab
tooltip, `agentStateLabel`: the agent vocabulary has no `cancelling`, and as first built the window read `running`
throughout — corrected at the second verification). A refusal removes it; an acceptance keeps it
over the run's active records until its first record at rest, because the engine writes no `cancelling` for the explicit
cancel. That end is the first record of the session at rest the window takes after the confirmation (`witness`), not the
run's `runStartedAt`, which the next run's pre-flight still carries until the engine writes its own (corrected at the
verification: keyed on it alone, the next run read `Cancelling` through its pre-flight), or the first record of another
session it takes. Until then only the Workspace set anything — its stop button's "Force stop" — and no surface read `cancelling`. This
repairs `the-mission-view-and-a-persona-window-do-not-show-a-confirmed-run-cancel-as-cancelling.md` (acceptance A35). The
**runtime view**'s `cancelAgent` row and the **state ownership** view's optimistic-cancel row say so. No package, edge,
process, message kind, channel, command or store column changed.

**The run-level agent's tool-call count is its own while its turn runs (REQ-MONITOR-044/052, R-067).** The surfaces derived
it as the session's total less the children's, and a root's calls join the total only when its turn returns, so the meta
line read `0 tool calls` beside the root's used chips. `SessionRecord.entryToolCalls` now carries it: the roots' share of
the persisted total plus the live root's calls not yet counted (`entryToolCallsOf`, `Run.entryUncountedToolCalls`) — the
agent's own count, where REQ-MONITOR-101 gives the synthetic root the run's aggregate; **OQ-159** asked which, ~~open~~ ruled 2026-10-06 ([R-071](../../product/requests.md#r-071)) as built: the run-level agent carries its own count. This
repairs `the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md` (acceptance A20). The **runtime view**'s §3
entry-record paragraph and the **state-ownership view**'s tool-call row say so. One `SessionRecord` field was added on the
existing snapshot channel; no package, edge, process, message kind, channel, command or store column changed.

**A plan cycle's root is recorded for good when it starts (REQ-MONITOR-044/052/069, REQ-LIBRARY-093/099, REQ-ORCH-153,
R-067).** A plan cycle has no `iterations` row, so the session named its root through its live run and, after a park or an
end, through its publishes alone; one that only read an artifact was no agent's, and the run-level agent lost that received
link at the gate. `plan_roots` (store **v30**) records each plan cycle's root — task id, canonical name, the name its rows
carry — in `SessionWriter.openPlanRoot`'s transaction, never released, and `entryRootsOf` names it from there. This repairs
`a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md` (acceptance A22). The **runtime view**'s
§3 `entryRoots` paragraph, its §7 heading (the store is now v30) and a new §7 `plan_roots` row, and the **state-ownership
view**'s new plan-root row, say so. One table was added (store v30); no package, edge, process, message kind, channel or
command changed.

**The design Tag's kinds are the language's tones, and StatusDot paints its state (acceptance A40, R-067).** `Tag`
takes the design Tag's seven kinds (`TAG_KINDS`: `accent`, `neutral`, `outline`, `run`, `wait`, `done`, `fail`) and joins a
caller's class to `tag tag-<kind>` instead of letting it replace them; every caller names its tone by `kind`, and
`tools/check-ui-language.mjs` refuses a Tag class that spells `tag` or a tone. `StatusDot` takes the design StatusDot's
states (`STATUS_DOT_STATES`) and writes `data-state`, which `shell.css` paints at `.status-dot`'s own specificity. This
repairs `the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md`. The **component view**'s
`ui/design-system` section says so. No package, edge, process, message kind, channel, command or store column changed.

**A child's name is never a root's (REQ-ORCH-044, OQ-158, acceptance A23, R-067).** `ChildLedger.spawn` keeps every child,
at every depth, off its root's canonical name and entry persona and off every recorded root's two names
(`recordedRootNames`), which the surfaces give the run-level agent; only the root's direct children were kept off its
canonical name before. This repairs `a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md`. The **runtime
view**'s §4 says so. No package, edge, process, message kind, channel, command or store column changed.

**A queued prompt's task is named "Queued Prompt: <id>" (REQ-CHAT-040, REQ-ORCH-071, OQ-117, R-067).** A planner todo
task carries an optional `name` beside its text (`run/todo.ts`), and `consumeQueued` names a queued prompt's task
`Queued Prompt: <first 8 characters of the prompt id>` with the prompt as its text. The pane and the handoff's todo list
(REQ-SESSION-115's display titles) draw the name (`taskTitle`), and so does the plan gate's implied-task list
(`planTodoLines` in `packages/ui/src/PlanGate.tsx`, which reads the stored todo itself), the compression's todo lines carry the name and then the
content (`taskLine`), and a rename renames the name. This repairs
`a-queued-prompts-task-is-not-named-queued-prompt.md` (acceptance A28). The **runtime view**'s iteration-boundary diagram
says so. No package, edge, process, message kind, channel, command or store column changed; the todo document gains an
optional field inside its existing column.

**The fallbacks are named by REQ-ORCH-139's vocabulary, and the vocabulary is checked (REQ-ORCH-139, REQ-NOTIFY-090,
OQ-157, R-067).** The ladder's same-tier change writes `quota_fallback_model` and the `quota_fallback` issue, its
unresponsive-model fallback `llm_unresponsive` (entry and issue), and the children's hard-timeout retry `fallback_model`
and the `timeout_fallback` issue, where they wrote `model_fallback`, `unresponsive_model_fallback`/`unresponsive_model`
and `child_timeout_fallback`. `tools/check-timeline-vocabulary.mjs`, in `pnpm lint`, fails on a timeline name in no
vocabulary; the names the product writes that no list has are held there by OQ-157. This partly repairs
`the-run-writes-timeline-events-outside-its-closed-vocabulary.md` (acceptance A29). The **runtime view**'s ladder paragraph
and its `timeline` row say so. No package, edge, process, message kind, channel, command or store column changed.

**A crash settles its cut call's ring row (REQ-SESSION-129, REQ-MONITOR-105, ADR-0024, R-067).** An orderly end settles
every open `tool_calls` row when the run's ports close; a crash closes none, so after the crash record settled a call's
transcript row its ring row stayed `running` for good. `recordCrash` now settles every ring row still `running`
(`settleDeadToolCalls`) through `SessionWriter.settleToolCall`, `failed` with the crash's statement and a NULL duration
(`ToolCallSettle.elapsed_ms` admits null for this case) — except at a continue after a run of this process that parked
without closing its tool ports (`Run.closedItsPorts`), whose call may still be under way. This repairs
`a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md` (acceptance A30), and corrects ADR-0024's first-execution
claim that such a row "needs no repair" in place. The **runtime view**'s §2 crash paragraph and its §7 rings row say so. No
package, edge, process, message kind, channel, command or column changed.

**A plan cycle's root calls before a crash reach the session total (REQ-MONITOR-102, REQ-ORCH-153, R-067).** A plan cycle
has no `iterations` row, so the crash record never reached its root. `sessions.plan_root_task_id` / `plan_root_persona`
(store **v29**) name the plan cycle's root while its turn runs and none of its calls is counted: `Run.turn` records it when
the plan cycle starts (`SessionWriter.openPlanRoot`) and releases it in the transaction that adds its calls to the total
(`countToolCalls`'s `planRoot`), or with none counted when its turn raises. `recordCrash` answers the open calls of one still
recorded and adds its record's calls (`recordPlanRootCrash`). This repairs
`a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md` (acceptance A19). The **runtime view**'s §2 crash
paragraph, its §7 `sessions` row and its §7 heading (the store is now v29), and the **state-ownership view**'s tool-call
row, say so. Two `sessions` columns were added (store v29); no package, edge, process, message kind, channel or command
changed.

**The run-level agent's tool history at a plan gate no iteration precedes (REQ-MONITOR-060, REQ-MONITOR-069,
REQ-ORCH-153, acceptance A21, R-067).** With no run live and no iteration recorded, `entryToolsOf` reads the run-level
agent's history under every name the tracker holds that is no child's (`AgentActivity.calledToolsWhere`): only a root or
a child dispatches a call, and before any iteration every root was a plan cycle's, which no row names. This repairs
`the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`. The **runtime view**'s
`entryTools` paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A write through a loaded session from outside a run holds the lock (ADR-0005, REQ-EVENTS-098, REQ-SESSION-060,
REQ-GIT-094, acceptance A14, R-067).** `Sessions.withWriter`'s live branch — the repair, the safety checkpoint and the
restore's outcome for a session loaded here — writes under the lock `claimHold` gives (kept, or taken with the one reap
and given back) and answers `lock-held` with nothing written while another live process holds it. This repairs
`a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`. The **runtime view**'s §6 lock paragraphs, §6a
and the `session_locks` row, and the **state-ownership view**'s session-lock row say so. No package, edge, process,
message kind, channel, command or store column changed.

**A root steer is announced under the root that will take it (REQ-MONITOR-133/134, PD-ORCH-005 clause 4, OQ-97, acceptance
A24, R-067).** `Run.steer` names a root steer by `Run.rootSteerName`: `rootName` while the current root can still step, the
run's persona once its execution is over (`rootDone`, set as each root's turn settles unless a rest leaves it `paused`), so a steer submitted after a root
resumed as the entry role finishes is announced for the fresh root that injects it. Each pending steer keeps the name it
was announced under, which `reportUndeliveredSteering` repeats. This repairs
`a-root-steer-after-a-resumed-iteration-closes-is-announced-under-the-resumed-roots-name.md`. The **runtime view**'s §5
steer row says so. No package, edge, process, message kind, channel, command or store column changed.

**A root whose turn raises counts its calls (REQ-MONITOR-102, acceptance A18, R-067).** `Run.turn`'s `finally` counts a root
whose turn never returned — raised as well as given up on — from its record, less what the record held when the execution
began (`recordedAtStart`), once its open calls are answered; a raise that no rest paused has its open call answered as cut
off, naming no rest (OQ-96), as the explicit cancel's give-up already did. This repairs
`a-root-whose-turn-raises-never-counts-its-calls.md`. The **runtime view**'s §7 `iterations` row and the **state-ownership
view**'s tool-call row say so. No package, edge, process, message kind, channel, command or store column changed.

**The compressing model reads the history it replaces (REQ-MONITOR-082, REQ-MONITOR-084, REQ-ORCH-110, OQ-156, R-067).**
`compress` reads `compressorTranscript` (`run/compression.ts`) instead of the report pass's `transcriptText`, which is
removed: each event whole, the slice whole up to the compressing model's own threshold at `chars_per_token`
(`CompressorDeps.inputTokens`, set by `Run.compressionFor`), its start and most recent part past it. This repairs
`the-compressor-reads-only-the-head-of-what-it-compresses.md` (acceptance A12). The **runtime view**'s compression
paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A child waiting on its own children is not reported stalled (REQ-ORCH-089, REQ-MONITOR-119, REQ-NOTIFY-112, OQ-155,
R-067).** `StallWatch.betweenTurns` (`children/stall.ts`), called by `execute`'s `turn` closure as each turn settles,
holds the watch's evaluation off the silence until the run starts the child's next turn, and `execute` calls it as the
watch is armed for an execution resumed into waiting (PD-ORCH-005 clause 4; added 2026-09-30, the first reading having
missed that path), so the wait inside `runWithChildren` writes no `stall` issue and no warning. This repairs
`a-child-waiting-on-its-own-children-is-reported-stalled.md` (acceptance A7). The **runtime view**'s stall-watch paragraph
says so. No package, edge, process, message kind, channel, command or store column changed.

**A child settled outside its execution fires `child_completed` (REQ-HOOKS-003, REQ-ORCH-048, REQ-ORCH-052,
REQ-ORCH-053, REQ-ORCH-133, PD-ORCH-005 clause 6, R-067).** The cascade, the finalize sweep and the user's cancel of one
child now fire it through `IterationChildren.completedOutside`, in line, and the run waits for them after the sweep
(`completionsSettled`); the stale settle's and the decline's fire after the run's `session_start`
(`RunDeps.settledBeforeStart`, `Run.childCompleted`). An outside hook's fields are taken as the scheduler is told, not
when a queued hook starts (the second verification). `beginSettle`'s own-entry guard keeps a followed-up child settling
to a parent's `settlesOf` until the later end's hook is done, corrected in §4 from "fires the hook once for each end" (the
third verification). A rest's wait on the executions looks again until none is left (`IterationChildren.drained`), and
the run waits for the outside hooks once more before `session_end` (`Run.childCompletionsSettled`), corrected in §4 from
"awaited as executions" over a snapshot (the fourth verification). Three paths outside a run's hooks fire none, raised as OQ-154. This
repairs `a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`. The **runtime view**'s §4 gains the
paragraph after the one on a settle's hook. No package, edge, process, message kind, channel, command or store column
changed.

**A report's edited files are the writes that landed (REQ-ORCH-108, REQ-ORCH-109, PD-TOOLS-006, OQ-111, R-067).**
`editedFilesFrom` now skips a write call the record answers as refused — a sibling's claim, the permission gate or a
pre-tool hook refusing it, a `haet_edit` whose find text matched nothing — or as cut before it started, and the
summariser's own list cannot bring such a path back. A write cut off while under way (the pause's tool deadline, the
stop's abort, a crash) is still listed, since it may have landed: `run/interruption.ts`'s `ranBeforeItWasCut` reads the
statement the turn records for it. The report's `edited_files`, the fallback's "Files touched" and the facts the pass is told never to deny all
read it. This repairs `a-reports-edited-files-counts-refused-writes.md`. The **runtime view**'s §4 report sentence says
so. No package, edge, process, message kind, channel, command or store column changed.

**A stalled agent is shown stalled; the root is watched; a stall evaluation lands a steer (REQ-ORCH-089, REQ-MONITOR-117..122,
REQ-MONITOR-135, R-067).** `AgentRecord.stalledSeconds` and `SessionRecord.entryStalledSeconds` carry each stall watch's
figure, kept in `AgentActivity` and republished by `ProjectionOwner.refreshRecord` when it changes; the agent trees, the
Mission table, the persona window and the inspector draw it. `Run.turn` arms a `StallWatch` for the root. An evaluation wakes
an agent waiting on its own children for a pending steer (`IterationChildren.wakeForSteering`, `ChildrenDeps.steeringPending`).
This repairs `a-stalled-child-is-never-shown-stalled.md` (acceptance A6; OQ-153). The **runtime view**'s stall-watch
paragraph and its `entryTools` paragraph say so. No package, edge, process, message kind, channel, command or store column
changed; the snapshot channel's `SessionRecord` gained the two fields.

**A child the scheduler settles is torn down (REQ-ORCH-098, REQ-ORCH-048, REQ-ORCH-052, R-067).** `Scheduler.cascadeBlocked`
and `Scheduler.finalizeIncomplete` call `SchedulerDeps.teardown`, which `IterationChildren` answers with `writeTeardown`
(`children/orchestration.ts`; in `children/ledger.ts` since 2026-10-01), so a blocked child and one the finalize sweep cancels get `child_end`, `child_result` and
`child_conversation_closed` as a settled execution's child does (OQ-152). This repairs
`a-child-that-never-started-gets-no-teardown-timeline-entries.md` (acceptance A16). The **runtime view**'s "A child settled
without its turn" paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**`delegate`'s admission resolves an alias on the built-in table's path (REQ-ORCH-034, REQ-ORCH-153, PD-TOOLS-006,
R-067).** `personaOf` (`children/orchestration.ts`) resolves through `resolveRole` where no persona catalogue is configured,
as `ChildLedger.spawn` does, so the plan gate's admission refusal, the grant and the write-scope refusal read the role the
ledger will spawn. This repairs `delegate-reads-no-alias-on-the-built-in-table.md` (acceptance A27). The **runtime view**'s
plan-gate paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A child's attachments and inherited-context block are stored with its record (REQ-TOOLS-154, REQ-LIBRARY-098,
REQ-TOOLS-152, PD-ORCH-005, R-067).** Store **v28** appends `children.attach_artifacts` and
`children.inherited_context_block`, written by `ChildLedger.spawn`; `IterationChildren`'s two in-memory maps are gone, and
`execute`'s and `startingPayload`'s payloads read the row, so a child resumed in a later run carries both into its
REQ-ORCH-088 retry, with REQ-ORCH-047's prior-agent-context block rendered again. This repairs
`a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md` (acceptance A25). The **runtime view**'s
inherited-context paragraph and §7 `children` row, and the **state-ownership view**'s row, say so. No package, edge,
process, message kind, channel or command changed.

**The per-model cap counts every child in the process (REQ-CONFIG-094, REQ-MONITOR-020, REQ-ORCH-050, acceptance A13,
R-067).** `ChildLedger.slotsInUse` counted one iteration's children, so two sessions under way in one run host could each
fill a `max_parallel`. `Sessions` now holds a `ModelSlots` each session joins while a run of it is under way or while it
rests with a paused child keeping its place (PD-ORCH-005 clause 4, OQ-149); the ledger adds the other sessions' slots to
its own, and a child's end, a run's end, a decline or a cancel at rest wakes the other sessions' runs. This repairs
`the-per-model-cap-counts-only-one-iterations-children.md`. The **runtime view**'s §4 and a **state-ownership view** row
say so; OQ-148 asks the release order across sessions, OQ-150 whether one key in two workspaces is one entry. No package, edge, process, message kind, channel, command or store
column changed.

**A child the stop's grace gave up on is counted at the rest (REQ-MONITOR-102, REQ-SESSION-092, PD-ORCH-005 clause 6,
R-067).** `IterationChildren.outlast` now keeps which children it gave up on (`givenUpOn`), and `rest` counts each one's
calls from its record once its open calls are answered (`countGivenUpOn`, through the run's `countToolCalls`). A continue
that declines it therefore loses none of its calls. So does a rest that the explicit cancel reaches while it waits: it
pauses nothing, but first answers such a child's open calls as cut off, naming no rest (OQ-96), and counts it before the
child ends `cancelled` (found by the repair's verifier). This repairs
`a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md`. A child given up on by the
explicit cancel's own `outlast`, which no rest follows, or already terminal when given up on, was still not counted
(`a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`, repaired 2026-10-01: see the entry above). The **runtime view**'s §4 rest
paragraph and its `children` row say so. No package, edge, process, message kind, channel, command or store column changed.

**A settle tells the scheduler whatever raised before it (REQ-ORCH-048, REQ-ORCH-052, REQ-TOOLS-156, REQ-HOOKS-079,
R-067).** Both settles of a child — the end of `IterationChildren.execute` and `settleRaised` — now end through
`afterTerminal`, which writes the teardown, runs the `child_completed` hook and then calls `scheduler.settled` in a
`finally`. A raise out of the hook port is a warning. This repairs
`a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md`. The **runtime view**'s §4 paragraph on the
settle's hook says so. No package, edge, process, message kind, channel, command or store column changed.

**The post-run improvement capture never rejects (REQ-ORCH-137, REQ-LIBRARY-032, R-067).** `onRunResult`'s detached
closure moved into `captureAfterRun` (`run-host/improvement-capture.ts`): a skip-list stop reason yields no job before main
is asked for the history, the store is re-read after that ask, and a store closed meanwhile or a throwing capture yields
no job with a log line rather than an unhandled rejection. This repairs
`an-improvement-capture-racing-the-quit-reads-a-closed-store-and-rejects-unhandled.md`. The **process view**'s
improvement-analyst paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A persona's `tool_restrictions` narrow its grant (REQ-TOOLS-006 (4), REQ-CONFIG-103, OQ-145, R-067).** The engine
`Persona` carries the map (`toolRestrictions`), and every child's `ToolPortContext` names its delegating persona
(`parentPersona`, from `IterationChildren.parentPersonaOf`). The run host passes the lists `toolRestrictionsFor` reads to the
registry's fourth stage, which now takes allowed-tool lists, and takes an MCP tool no list names off the surface
before its executors and its prompt section are drawn from it (REQ-MCP-062). `writesFiles`
reads the same lists. The **seams view**'s §4 and the **runtime view**'s write-scopes paragraph say so. This repairs
[`a-personas-tool-restrictions-never-narrow-its-grant.md`](../../defects/fixed/a-personas-tool-restrictions-never-narrow-its-grant.md).
No package, edge, process, message kind, channel, command or store column changed.

**A session delete cascades to nineteen tables, and `sessions-proof` reads that from the schema (REQ-SESSION-166, PD-ORCH-005,
R-067).** The **runtime view**'s §6a delete said "the fifteen dependent tables"; v20's `plan_cycles` and v23–v24's
`iterations`, `agent_messages`, `agent_terminals` and `agent_fingerprints` make every table whose `session_id` references
`sessions` nineteen, with `delivery_runs` the one kept as a fact. The proof's count pin gave way to the shape
(`apps/desktop/scripts/lib/session-cascade.mjs`). This repairs [`sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md`](../../defects/fixed/sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md).
No package, edge, process, message kind, channel, command or store column changed.

**The initialization coordinator runs its setups one at a time (REQ-WORKSPACE-109, REQ-WORKSPACE-084, R-067).** The run
host holds one setup and its `mcp.setupStatus` carries no workspace, so `InitializationCoordinator` now starts a run's
`code-intelligence-setup` only once the setup before it has ended (`setupTurn`), and the one step sink is cleared only by
the follow that set it; a run's `finally` no longer clears it, and a follow drops its abort listener once its setup has
ended, so an earlier run's close or Cancel never reaches the next run's setup. This repairs
`a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`. The **process view**'s
`initialization.*` paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A workspace switch cancels the outgoing workspace's initialization run (REQ-WORKSPACE-013, R-067).** `MainWindows`
gained `workspaceClosed`, called once the last live main window holding a workspace has closed, and main answers it with
`InitializationCoordinator.close`, which nothing called before: the run is cancelled, nothing is recorded or published
for it, and a return to the root resolves again (REQ-WORKSPACE-102); a close landing while the setup's start request is
in flight is sent to the run host once the start answers. This repairs
`a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`. The **process view**'s `initialization.*`
paragraph says so, and the **runtime view**'s `initialization:` bullet says a closed workspace's recordings are refused
inside their turn of the marker queue. The same rule for a close that is not a switch's is a reading, raised as OQ-141.
No package, edge, process, message kind, channel, command or store column changed.

**The update shape answers `extend` (REQ-CHAT-053, R-067).** `updateShape` in `ui/transcript/pool.ts` reads the
content of one row besides the keys — the last row before the update — so an extension of that row with rows appended
after it is `extend` rather than `append`; the first form's `extend` branch could not be reached. The pane still records
the shape on the element and branches on nothing. This repairs `the-update-shape-never-answers-extend.md`. The **runtime
view**'s step-5 row says so. No package, edge, process, message kind, channel, command or store column changed.

**A row not yet measured is not positioned short of what it draws, and a row on screen is measured (PD-CHAT-003, R-067).**
`estimateHeight` in `ui/transcript/pool.ts` builds the estimate from the parts of the row's box the stylesheet draws —
the row or block gap (`readHeight` hands it `places[at].blockStart`), the border, a user row's padding, a Markdown body's
block margins, one 19.5 px line per drawn line, an activity line laid out segment by segment — and errs long; the first
form of this repair counted the block gap alone, and a one-line agent message inside a block went on drawing 33.4 px into
30. `TranscriptPane.tsx` observes a slot again whenever it is bound under a measurement key it was not observed under
(`observeAgain`): a slot a scroll rebound to a row of its previous row's height used to keep the new row at its estimate.
This repairs `a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`. The **runtime
view**'s transcript paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**A failing layout contract is filed under `CONTRACT` in the evidence pack (R-067).** `ui-audit` builds each finding
through `apps/desktop/scripts/lib/audit-finding.mjs`, which spreads the measured detail first and moves a contract row's
own `kind` to `relation`, so `report.json`, the summary line and `ui-review`'s `manifest.json` (`deterministic.byKind`)
count a failing contract as `CONTRACT`; the manifest also carries `deterministic.contractsByRelation`. This repairs
`a-contract-finding-in-ui-audit-is-filed-under-its-relation-kind.md`. The **seams view**'s §8 step 6 says so. No
package, edge, process, message kind, channel, command or store column changed.

**A count's noun agrees with it everywhere, from one kernel helper (REQ-SHELL-044, R-067).** `countNoun` moved from
`ui/agents.ts` (which re-exports it) to `kernel/count-noun.ts`, since `providers`, `engine`, `agent-tools`, `contracts`,
`platform` and `workspace` cannot import `ui`; the sign-in messages, the checkpoint dialogs and notices, the run's
timeline and notices, the Library, Settings and the tool results the tool row draws now use it, as do the local
`plural` helpers it replaced. `tools/check-plural-markers.mjs`, a new step of `pnpm lint`, fails on a literal `(s)`
in a string the product can draw; log lines and four requirement-fixed tool results pass (OQ-138). This repairs
`a-literal-plural-marker-is-rendered-in-sign-in-notices.md`. The **component view**'s kernel box says so. No package,
edge, process, message kind, channel, command or store column changed.

**The driver's settled click (acceptance finding A3, 2026-10-06).** `driver.ts`'s `click` takes `settle`: the match is
measured, two of the renderer's frames begin, and it is measured again; it is pressed only when its box is unchanged and
the element at its centre is the match or inside it, and a one-shot capture `mousedown` listener then says what the press
met, a press that met something else being refused with it. `scripts/lib/driver.mjs`'s `clickLanded` presses again only
after such a refusal, and driver-proof's 13b and 13c open the persona window that way on the child's own row. This is
for `driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`. The **process view**'s main row says so. No
package, edge, process, message kind, channel, command or store column changed.

**The driver addresses persona, approval and terminal windows (R-067).** `driver.ts` resolves a role selector —
`persona:<persona>`, `approval`, `terminal` — over `DriverDeps.auxiliary`, which main fills from each main window's
persona-window registry, open approval dialog and terminal window; `windows` lists them, `useWindow` and each op's own
`window` reach them (the per-request override, claimed since A4, is now read), and an unmatched selector is still
refused. This repairs `the-driver-cannot-address-persona-or-approval-windows.md`. The **process view**'s main row says
so. No package, edge, process, message kind, channel, command or store column changed.

**The driver's `quit` is the application's quit, a capture whose wait timed out ends the same way, and the driver's
shot waits for a presented frame (R-067).** `driver.ts`'s `quit` sends `app.quit()` — the close guards, then
`window-all-closed`'s `shutdown` — unless it names the immediate exit (`immediate`; `pnpm app:drive stop --crash`), and
its seam stays up until `will-quit`; `capture/probe.ts` ends a capture whose wait timed out through the new
`CaptureHost.quit` rather than `exitCleanly`; `screenshot` waits `PAINT_FRAMES` (four) of the renderer's frames before
`capturePage()`. This repairs `the-drivers-quit-skips-the-applications-shutdown.md` and
`the-drivers-shot-can-return-a-stale-frame.md`. The **process view**'s quit paragraph and main row, and the **runtime
view**'s application's-end paragraph, say so. No package, edge, process, message kind, channel, command or store column
changed.

**Every proof launch is bounded (R-067).** `package.mjs` launches the packaged application through
`scripts/lib/bounded-launch.mjs`'s `spawnBounded`, as every launch a proof script starts itself now does (but for the two
`scripts/lib/launch-sites.test.ts` names with their reasons), so the **component view**'s paragraph
on the modules `package.mjs` shares names that one too. No edge moves: a script reaching a script module under
`apps/desktop/scripts/`, outside the boundary rule. This repairs `proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md`.

**The run-start mode hint says what `plan` does and states a session's release (REQ-ORCH-152, REQ-CONFIG-320,
PD-ORCH-003, R-067).** The Settings Runtime category's hint no longer says the plan gate is not built: `runStartModeHint`
(`ui/settings/ConfigSettings.tsx`) says what `plan` does and, when the followed session's `SessionRecord.planReleased` is
true, that the session is released and that Plan first on the composer's chip re-arms it; the selector itself re-arms
nothing (OQ-137). This repairs `the-run-start-setting-says-the-plan-gate-is-not-built.md`. The **runtime view**'s
plan-gate paragraph says so. No package, edge, process, message kind, channel, command or store column changed.

**The Windows global configuration directory is REQ-CONFIG-001's `%LOCALAPPDATA%\rotaris\rotaris\` (R-067).**
`resolveUserDirs`'s `win32` case answered `rotaris\config` until now; the data directory stays the sibling `rotaris\data`
(D-04), and no earlier directory is adopted (REQ-STARTUP-145). The proof harness's `configDirFor` moved with it. This
repairs `the-windows-global-configuration-directory-is-not-the-one-req-config-001-spells.md`. The **process view**'s
diagram and files-on-disk table and the **state-ownership view**'s configuration rows spell the new directory, and the
process view says that on Windows it is also the directory the preference store's `Rotaris\Rotaris` root names. No
package, edge, process, message kind, channel, command or store column changed.

**A by-design tool removal is logged at `info`, and a persona's MCP lines once per spawn (REQ-TOOLS-006, PD-MONITOR-002,
R-067, live-run findings L14 and D7).** `ToolPortContext` gains `info` — the application log at `info` and the session
log at `INFO` — which `Sessions` fills on a start and a continuation; `createToolPort` logs a REQ-TOOLS-006 narrowing
control's removal through it and a REQ-TOOLS-004 prerequisite's through `warn`, as before. `McpHost.surfaceFor` keeps
what each persona's resolutions have written (`announced`, keyed without the reserved names), so the spawn evidence's
resolution and the port's no longer write the surface line and the grant count twice. This repairs
`coordinator-only-removals-are-logged-as-warnings.md` and `a-personas-mcp-lines-are-logged-twice-on-first-spawn.md`.
The **runtime view**'s MCP-surface paragraph and the **seams view**'s tool invariants say so. No package, edge, process,
message kind, channel, command or store column changed.

**The application log survives the loss of its reader (REQ-MONITOR-131, R-067).** Main's log writes through
`standardStreamWriter` (`main/app-log.ts`) instead of `console.log`: the stream's `error` event is listened for, and from
its first failure nothing more is written to it; standard error gets the same listener. A quit whose standard output
has been closed no longer loops on its own EPIPE. This repairs `a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`.
The **process view**'s application-log paragraph says so. No package, edge, process, message kind, channel, command or
store column changed.

**A child main ended itself is not a loss in the application log (PD-MONITOR-002, R-067, live-run finding L13).** The
run host's `kill` that `endBeforeMain` sends goes through `ChildrenEndedByMain` (`main/exit.ts`), which records it by
service name, and the `child-process-gone` handler writes Electron's `killed` report of that end at `info`, saying main
ended it; every other end but `clean-exit` stays `error`. This repairs `an-orderly-quit-logs-the-run-host-gone-at-error.md`.
The **process view**'s application-log paragraph says so. No package, edge, process, message kind, channel, command or
store column changed.

**What is asked of a person in the quit's gap is held for the quit to withdraw (PD-ORCH-005 clause 9, R-067, OQ-132).**
`presenter.revoke` gains an optional `quitting`, which main sets from `QuitState`; the run host's `PresenterRegistry.quitting`
holds from such a revoke until a window registers. Meanwhile the gate holds an ask unshown in `pending_approvals` instead
of denying it headless, a present answered "not shown" is held too, `ask_questions` records its prompt pending, and
`PendingApprovals` and `PendingQuestions` arm an expiring budget again; the shutdown withdraws every one by `quit`. This
repairs `an-approval-asked-after-the-last-window-closes-is-denied.md`. The **sequences view**'s §2 (the diagram and a new
paragraph) and the **process view**'s message list say so. No package, edge, process, channel, command or store column
changed.

**A small non-zero cost renders as the floor `< 0.0001`, never as zero (ESC-42 ruled option (b) under R-067, 2026-09-29).**
`formatAmount` (`kernel/money.ts`) returns `AMOUNT_FLOOR` where REQ-PROVIDER-121's half-up rounding brings an amount
greater than zero to zero; `costLabelOf` is unchanged and every label takes the floor as its `<amount>`. This repairs
`a-cost-below-five-hundred-thousandths-renders-as-zero.md`. The **runtime view**'s §3 ("What a step costs") says so. No
package, edge, process, channel, message kind, command or store column changed.

**A retry the dispatch layer absorbs is written to the session log (OQ-110 ruled under R-067, 2026-09-29).** REQ-CONFIG-086's
`num_retries` stay the dispatch layer's, spent inside the model client before the ladder; the client's decorated fetch
now reports each retry as it is sent (`ModelRequest.onRetry`, with the status met and the delay waited on the monotonic
clock `AiSdkClientOptions` now takes), `DefaultAgentBackend` forwards it to `TurnSink.retried`, and the turn writes
`dispatchRetryLine` through the run's `warn` to the session log. This repairs `a-retry-the-dispatch-layer-absorbs-leaves-no-trace.md`.
An exhausted budget now reaches the ladder as the last attempt's error (`fromError` unwraps the SDK's `RetryError`), which
repairs `an-exhausted-dispatch-layer-hands-the-ladder-a-failure-it-cannot-classify.md`. The **runtime view**'s §3 (the ladder's paragraph) says so. No package, edge, process, channel, message kind, command or
store column changed.

**A follow-up by `session_id` resumes a settled child from its record (PD-ORCH-005 clause 22, PD-TOOLS-006 revision 3,
2026-09-29, R-067; OQ-131, raised as OQ-130 on its branch and renumbered at the merge).** `delegate` forwards `session_id`. `IterationChildren.followUp` refuses an id that is no
settled child of the caller, and waits for a cancelled child's execution to wind down. It re-claims the stored write
scope and answers a call left open. The writer's new `followUpChild` makes the one exit from a terminal state
(`isLegalFollowUp`), to `queued`, in one transaction with the follow-up's message in `agent_messages`; `StoreDal.reopenChild`
clears the completion time, the report and the observation, over existing columns. The scheduler starts the child, and
`execute` carries on from its record. The **runtime view** gains the follow-up paragraph beside the continuations one,
and its §7 rows for `children` and `agent_messages` name the new writer. The **state-ownership view**'s conversation-record
row names it as a writer and a reader. No package, edge, process, channel, message kind, command or store table changes,
and no migration is appended.

**An explicit cancel is durable across a crash (PD-ORCH-005 clause 3 with REQ-MONITOR-126, OQ-103's last question ruled
under R-067, 2026-09-29).** `iterations.cancel_accepted_at` (store **v27**, appended) is written the moment the reserved run
id's `cancelAgent` is accepted (`SessionWriter.recordCancelAccepted`), and by `Run.turn` for an iteration it opens after. An
open iteration carrying it is closed `cancelled` by the next repair or continue, its unfinished agents ended `cancelled`
(`recordCrash` → `recordAcceptedCancel`), never paused by a crash; `crashLeftOf` and `resumableOf` read it, the new
`cancelLeftOf` presents those agents `cancelled` meanwhile, and a continue is set up as the entry role; the run-level
agent (`runLevelAgent`) is presented `cancelled` and not live in REQ-CHAT-008's recovery state with nothing to resume.
The record writes no timeline word of its own (REQ-ORCH-139); its close is the vocabulary's `iteration.end`. This repairs
`a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`. The **runtime view**'s §2 (the paragraph "An
explicit cancel the host died before carrying out"), §4 (the run-level agent) and §7 (`iterations`), and the
**state-ownership view**'s rest rows say so. One store column is added; no package, edge, process, channel, message kind or command changed.

**A confirmed cancel of one agent is shown at once (REQ-MONITOR-128/296, 2026-09-29, R-067; OQ-129).** The renderer's
`cancelAgent` lays a per-window overlay (`packages/ui/src/cancel-overlay.ts`, the store `cancelOverlays` in `shell.ts`)
over the session before it sends `cancelAgent`. The agent and every unfinished descendant show `cancelled` with an
activity line saying the user cancelled them. A refusal removes the overlay, and the first whole-session update the
replica takes after an acceptance overwrites it; the store numbers each record the replica takes (`witness`), so a
persona window's coalesced copy, up to 120 ms behind, keeps the overlay until its own later delivery. The Workspace, Mission and Overview roots read `useShownSession` and a persona window
`useCancelOverlaid`; the replica keeps its two writers. The **runtime view**'s `cancelAgent` row and the
**state-ownership view**'s volatile table name it. No package, edge, process, message kind, channel, command or store
table changes.

**The run-level agent owns every row, call and artifact its roots carry (REQ-MONITOR-071, REQ-CHAT-069, REQ-MONITOR-053,
REQ-MONITOR-060, REQ-MONITOR-044 with PD-ORCH-005 clause 4, OQ-97 and REQ-LIBRARY-093, 2026-09-29, R-067).**
`SessionRecord` gains `entryRoots`: each root of the session once, by the name its rows and calls carry and its canonical
name, every iteration's, then each root no iteration records that published — a plan cycle's, by its publish
(`StoreDal.rootPublishersOf`, a new read at every snapshot; found by the repair's fifth review, since the session lets go
of the run at the plan gate's park) — then the live run's (`entryRootsOf`, `Run.currentRoot`). The surfaces own a named row for the
run-level agent by the entry persona or a root's name (`ownRow`, shared by `rowsOf`, `scopedRows` and `followedAgent`),
and its artifact links by those or a root's canonical name; `Run.entryTools` reads the tracker under `rootName`. This
repairs `the-run-level-agent-is-known-by-its-entry-persona-alone.md`. The **runtime view**'s §3 paragraph on the entry
role's snapshot fields (`entryContext`, `entryTools`, `artifacts`) says so. No package, edge, process, channel, message
kind, command or store column changed.

**A steering prompt pending at a rest is kept (REQ-MONITOR-134 with PD-ORCH-005 clause 4, OQ-128, 2026-09-29, R-067).**
`Run.turn`'s rest delivers every prompt still pending for a `paused` agent with a record into that record, as the marked
message its next step would have injected, marked injected once (`deliverSteeringAtRest`); a child resumed `summarizing`
whose record ends on one resumes `running` (`IterationChildren.resumePaused`). Steering closes once no agent takes another
step — when the rest is recorded, when teardown begins, at the message-limit pause or at the plan-gate park (only a run
that parks: a plan cycle stopped, quit or failed ends in teardown) — so a later steer is refused; that close records what
is left as not delivered (`closeSteering`: a `steering_not_delivered` entry and a transcript line naming the end). This
repairs `a-steering-prompt-pending-at-a-rest-is-lost.md`. The **runtime view**'s §5 steer row says so. No package, edge,
process, channel, message kind or store column changed.

**A root resumed as the entry role keeps its rows' name (PD-ORCH-005 clauses 3 and 4, OQ-97, 2026-09-29, R-067).**
`Run.turn` names the root's rows, its tool port and its open calls by the persona its iteration was opened with
(`rootName`: `iterations.root_persona` for a resumed root), not by the persona the run is set up as, so a root resumed as
the entry role because its persona is no longer configured writes where `recordCrash` reads. This repairs
`a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md`. The **runtime view**'s §6 crash
paragraph says so. No package, edge, process, channel, message kind or store column changed.

**A delegated child is watched for a stall, and one that produced no output gets its corrective message
(REQ-ORCH-089, REQ-MONITOR-117..120, REQ-NOTIFY-111/112, 2026-09-29, R-067; OQ-127).** `children/stall.ts` is new in
`engine`. `TurnSink` gains an optional `event` for every streamed part, and `TurnDeps` gains `onModelEvent` and
`onToolStarted`, and `ConversationRecord` gains `everRecorded`, which a resumed child reads so that its one corrective
message stays one per task. The watch writes a `stall` issue at every stall evaluation; the wait on tools, the recovery
and the corrective message are session-log lines through the run's `warn`, since REQ-ORCH-139's vocabulary has no
timeline word for them (OQ-127). *(2026-10-06: OQ-127 ruled — the issue only with the throttled warning
(PD-MONITOR-005 revision 2), the three facts timeline entries, the waits and the recovery at INFO; see that date's entry
above.)* The **runtime view**'s §4 names it. No package, edge, process, channel, command or store table changes.

**A child settled without its turn gets its report (REQ-ORCH-048 / REQ-ORCH-052 / REQ-ORCH-108, 2026-09-29, R-067).**
The scheduler's blocking cascade stores each blocked child's `blocked` report and artifact before its parent is told.
A child whose execution raises outside its turn, on either start path, is settled `failed` with its report by
`IterationChildren.executeSettling` and `settleRaised`, instead of being left `running`. So is a resumed child whose
record cannot be decoded. A settle's `child_completed` hook now runs in line (REQ-HOOKS-076/080). A parent takes a
child as ended only once its settle is done (`IterationChildren.settles`), and an agent does not return while one of
its children's settles still runs. Each wait looks again until none of its children is settling, since another can end
while it waits (`settlesOf`, the verifier's fifth round). So the hook comes before `iteration_end` and `session_end`.
The **runtime view**'s §4 names all three. No package, edge, process, channel, command or store table changes.

**The inspector shows the run-level agent's tools and every agent's artifact links (REQ-MONITOR-052/060/061/068/069,
live-run finding K1, R-067, 2026-09-29).** `SessionRecord` gains `entryTools` (the root port's resolution — a new optional
`ToolPort.resolvedTools` — and the tracker's history) and `artifacts` (the session's artifacts not superseded, a body-free
read per snapshot, `StoreDal.artifactLinksOf`); the config snapshot's role view gains `declaredTools`, by the rule
(`declaredToolsOf`) the run host's persona resolver applies, which moved with the built-in roles' tool declarations to
`contracts/src/roles.ts`. A link in the main window deep-links to the Library (`openLibrary('artifacts', id)`), which opens
the artifact inspector; in a persona window it opens the inspector there. The **runtime view**'s compression paragraph and
the **component view**'s `roles.ts` line name them; no package, edge, message kind, command, column or process changes.
At its verification the runtime view gained that a live run-level agent with no resolution yet lists nothing
(`runLevelGrant`) rather than its declared tools.

**A root's calls before a crash reach the session total (REQ-MONITOR-102, R-067, 2026-09-29).** The root had no persisted
tool-call count, so a crash — which ends its turn without returning — lost its calls. `iterations.root_tool_calls` (store
**v26**) holds the calls of the root the total holds; `SessionWriter.countToolCalls` writes the total with the root's or a
child's count in one transaction; the crash record adds what the root's and each unfinished child's record hold beyond their
counts, and a root the stop's grace gave up on — one that never returned — is counted from its record. REQ-ORCH-097's
cadence is unchanged. The **runtime view**'s §2 crash paragraph (the counting step), its §7 `iterations` row and its §7
`children` row (`countToolCalls` among the writers of `tool_calls`: a resumed child's credit, its settle or rest, and the
crash record) and a **state-ownership view** row name it.

**A child is recorded under its model's `models:` key (REQ-CONFIG-094, REQ-MONITOR-020/049, live-run finding D5, R-067,
2026-09-29).** `children.model_key` was the model's bare id, so `modelCapFor` and `contextLimitFor`, keyed by the
`models:` key, never matched a qualified key. `childModelKey` now records the role's `Persona.modelKey` (set by the run
host's persona resolver, a synthetic copy mapped to the key the loader recorded it was copied from —
`LoadedConfiguration.syntheticOrigins`, never a guess by provider and model id, since two keys may name the same provider
model) or the run's `RunConfig.modelKey`. The **runtime view**'s agent-record paragraph names it; no package, edge, message,
column or process changes.

**`delegate`'s `suppress_auto_context` reaches the child (REQ-TOOLS-152, REQ-CONFIG-107, R-067, 2026-09-29).** The tool
forwards the flag, `ChildLedger.spawn` stores it (`children.suppress_auto_context`, store **v25**), and
`IterationChildren.artifactContext` omits the sibling-artifact index when the row carries it or the role's
`skip_auto_sibling_context` (now `Persona.skipAutoSiblingContext`, mapped by the run host) forces it. The **runtime view**'s
§7 `children` row and its children section name it, and the **state-ownership view** has a row for the persisted flag
beside the in-memory inherited-context block; no package, edge, message or process changes.

**A detached call writes nothing through its tool gate or its stream (REQ-SESSION-094, 2026-09-29, R-067).** `ToolPort`
gains `close(cutOff)`, and `Run.teardown` closes every port the run built before anything terminal is written: the
run host's `writerSink` settles each call its gate still has open, as failed with the rest's interrupted statement, and
drops every write after it, and the port's gate fires no `post_tool` hook after it. A model step whose `detached` reads true streams no row, settles none and counts no usage; a stop that rests nothing (the explicit cancel) detaches the child executions still running past the grace (`IterationChildren.outlast`), as a rest does.
This repairs `a-detached-call-still-writes-through-its-tool-gate.md`. The **runtime view**'s §2 and §6 say so. No
package, edge, process, channel, message kind or store column changed.

**A root call that ignores the stop no longer holds the run open (REQ-SESSION-092, REQ-MONITOR-129, REQ-SESSION-094,
2026-09-29, R-067).** `Run.turn` awaits the root's turn no longer than the stop's 30 s grace, counted from the first
stop request (`stopGraceSpent`); a root still in a call then is detached as a child execution is, left `paused` by a
stop or a quit with its open call answered, and the rest that follows gives the children only what is left of that
grace (`Run.stopGraceLeft`, `IterationChildren.rest`'s `grace`). Under the explicit cancel a root given up on still
drains (REQ-ORCH-080, OQ-121). This repairs `a-root-call-that-ignores-the-stop-holds-the-run-open.md`. The
**runtime view**'s §2 says so. No package, edge, process, channel, message kind or store column changed.

**`delegate` refuses a write scope for a persona that cannot write files (`PD-TOOLS-006` revision 3, OQ-112,
2026-09-29).** `IterationChildren.delegate` rejects the delegation before any record exists when its `write_scope` names
patterns and the persona — resolved as the ledger resolves it, an alias included — holds no `write_file`, `haet_edit`
or `haet` after `coordinator_only` and `read_only` (`writesFiles`). The reason names the catalogue's personas that can (`fileWriters`). The **runtime view**'s write-scopes
paragraph names it; no package, edge, message or store table changes.

**The report's pass reads the task and the most recent part, beside the facts (OQ-111, REQ-ORCH-110, 2026-09-29).**
`produceReport` gives the summarising pass `reportTranscript`: the task as given (`ReportInput.task`, the ledger row's;
the blocks the payload puts ahead of it marked omitted) and the most recent part, within 12,000 characters, with
`… [N characters omitted] …` between them. It also gives `reportFacts`, the
edited files and each command with its exit code, derived from the whole transcript. The head-only `transcriptText`
remains the compressor's alone (removed 2026-09-30 with the compressor's own reader, OQ-156). The **runtime view**'s children paragraph names it; no package, edge, message or store
table changes.

**A continue in the process that ran the session takes the lock back (ADR-0005, REQ-SESSION-047/048/083, 2026-09-29,
R-067).** `prompt`, `continueSession` and `planDecision` claim the session's lock before their first write
(`holdForContinue`, through the one claim `claimHold` the at-rest cancel's `lockForWrite` now shares), and the run each
launches holds it until its teardown; a continue that launches none gives back what it took, and a live holder in
another process refuses it with REQ-SESSION-048's words. This repairs
`a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md` and
`a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`. The **runtime view**'s §6 gains the paragraph and
its §7 `session_locks` row the writers; the **state-ownership view**'s lock row names the continue. No package, edge,
process, channel, message kind or store column changed.

**Every iteration is sent its own task (REQ-CHAT-040, REQ-ORCH-004 / REQ-ORCH-135, 2026-09-29, R-067).** The launch
content stays the base of every execution iteration's first message, and the todo task the iteration selected, when it
is not the run's own and its text is not the launch content's request, follows it as the task to work on
(`Run.takenUp`, `takenUpText`, `Run.firstMessage`) — a queued prompt, a task put back, an improvement run's proposal,
the task after a plan decision's gated one; PD-ORCH-005 clause 17's message keeps its own words. The handoff is not
rebuilt per iteration (OQ-104, OQ-106). This repairs `every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`.
The **runtime view**'s §2 gains the paragraph. No package, edge, process, channel, message kind or store column changed.

**An iteration's close commits the todo it leaves (REQ-ORCH-072/073/074/135, 2026-09-29, R-067).** `iterate()` and
`closeOpenIteration` close their task and held messages first and pass the todo to `SessionWriter.endIteration`, which
stores it in the transaction that records `iteration.end` and closes the row, ahead of the capture and the hooks. What
an earlier build's death left is settled when a run is built and when a continue is judged (`settleClosedIterations`:
`Todo.releaseStale`, and `Todo.settleStranded` for an iteration's own task, from the latest row naming it). This repairs
`an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`. The **runtime view**'s §2 says so. No
package, edge, process, channel, message kind or store column changed.

**A request queued behind an open approval dialog waits for its turn (REQ-TOOLS-063, 2026-09-28).** Main answers a
present-request that waits behind the dialog already open in its window, or behind requests queued ahead of it, with
the new run-host request `approval.queued` (`MainWindows.enqueueApproval` answers which). `RunHostPresenter` then stops
bounding the wait for `approval.shown`. The gate races the presentation against its own wait, so a queued request that
times out or is cancelled is dropped unshown and counts as cancelled (REQ-TOOLS-054). A window that closes while the
application stays hands its queued requests to main (`MainWindows`' `unshownApprovals`), which answers each not shown
(REQ-TOOLS-058), so none hangs; during a quit it answers nothing. The **process view**'s request list and the
**sequences view**'s approval diagram and bullets name it; no package, edge or store table changes.

**Each agent's record keeps the fingerprint it started with (`PD-ORCH-005` revision 4 clause 14, 2026-09-28, R-065).**
Store **v24** appends `agent_fingerprints`: per agent, the SHA-256 of the system prompt and of the tool definitions its
first model request carried. `runTurn` hands both to `TurnDeps.fingerprint` just before a step goes out; the check
(`ConversationRecord.fingerprint`, built once per execution by `turn()` and `execute()`) records the first and, on a
resume, states a changed one as a `resumed_under_changed_instructions` warning issue and a transcript `system` row
naming the agent (OQ-105). The transcript clear removes closed iterations' fingerprints. The **runtime view**'s record
paragraph and §7 table and the **state-ownership view** gain the table, and the **sequences view**'s resume bullet names
the warning; no package, edge, process, channel or command changes.

**The handoff's artifact is the root's own (`PD-ORCH-005` revision 4 clause 20, 2026-09-28, R-065).**
`latestArtifactText` takes the latest artifact the most recent recorded iteration's root published that nothing
supersedes, known by the root's task id as the record's `conversation_id`, and falls back to the latest of any kind
(OQ-106) — also when a plan cycle opened its gate after that iteration, so the plan gate's approve and revise never hand
over an earlier piece of work's document ahead of the plan cycle's; the plan cycle `PD-ORCH-003` revision 2 holds after
a resumed iteration is taken the same way, so there the resumed root's document counts only as "of any kind" (OQ-106). It
is read once, at the continue: a later iteration of the same run, and the plan cycle held after a resumed iteration,
are re-sent it as it stood then (OQ-104). The **runtime view**'s
continuation paragraph is updated. No package, edge, process, channel, command or store table changes, so the other
views are not.

**One paused child is cancellable while its session rests (`PD-ORCH-005` clause 16, revision 4, 2026-09-28, R-065).**
`session.control`'s `cancelAgent` reaches `Sessions.cancelPausedAtRest` when no run is behind the session: the child and
each `paused` descendant end `cancelled` with the live cancel's report, timeline entry and artifact, the iteration stays
open, and `resumable` drops. A child a crash not yet recorded left unfinished, and each such descendant, is cancelled
from the state it is stored in, its calls the crash cut off answered as interrupted; the crash itself is left for the
next repair or continue to record (clauses 3 and 8, OQ-101). It runs no scheduler pass, so an agent whose `depends_on`
names a cancelled child stays counted and is blocked by the resumed run's first pass (REQ-ORCH-048, OQ-101). It is
refused under a store failure, as every continue is (OQ-103). The cancel writes under the session's lock, taken for the
write and given back, a dead local holder reaped by the `claimLockReaping` that `SessionWriter.open` claims through, and
is refused while another live process holds it (`lockForWrite`); the refusals that say nothing of the agent carry
`ControlRefusal` codes of their own — `session_locked` for that holder, `store_failed` for a store failure, a lock the
store could not read or take, and a chosen child's move it could not write — whose message the renderer's `cancelAgent`
(through the `control` helper) states rather than "not cancellable"; a target it refuses outright is judged before the
lock is taken. Every confirmation and cascade note names
each unfinished descendant a cancel ends, live or paused (`cancelCascade`; OQ-100 and OQ-101 record the departure from
REQ-MONITOR-064's live count), and both cancels write through one `userCancellation`. The surfaces offer a paused
child's Cancel while its session rests (`cancelOffered(agent, runActive, resting)`, `resting` being `runLevelResting`,
the predicate the composer's count and the resting root share) and confirm by `cancelConfirmation` — the Workspace and a
persona window through `AgentCancelConfirm` (`packages/ui/src/AgentCancelConfirm.tsx`), which also confirms the run's
cancel on the Workspace, takes no label of its own and has its call sites pinned by a source test, and the Mission view
through `missionConfirmation`. The **runtime view**'s `cancelAgent` and `children` rows and its crash paragraph, the
**state-ownership view**'s rest and session-lock rows and the **sequences view**'s crash note name the new writer; the
`iterations` and `agent_terminals` rows say only that the crash record is written at a repair or a continue, which the
cancel is not. The **process view**'s `control.result` paragraph lists the two new refusal codes. No package, edge,
process, channel or command changes; `CONTROL_REFUSAL_CODES` gains the two refusals above.

**A paused agent presents as paused on every agent surface (`PD-ORCH-005` clause 13, revision 4, 2026-09-28, R-065).**
`PRESENTATION_CHILD_STATES` gains `paused` and `presentationChildState` maps the child state to it, so `AgentRecord`'s
`presentationState` widens on the existing session-record channel. `toAgentRecord` presents the agents a crash left
unfinished, before the crash is recorded, as the record will leave them (`crashLeftOf`, asked once per projection;
OQ-100's departure from clause 13's last sentence) — never for a session a store failure left busy, which is not one a
crash left and states nothing to resume (`Sessions.restingOf`, OQ-103); `runLevelAgent` presents the resting root
`paused`, the Workspace, the Mission view and a persona window asking it and `runLevelResting` through one call
(`restingView`, whose recovery argument, like `runLevelAgent`'s and `runLevelResting`'s, is required) with
REQ-CHAT-008's recovery state (`useNeedsRecovery`, moved to `renderer/session-view.ts`; the two renderer roots' wiring
is pinned by `renderer/recovery-wiring.test.ts`, with the props that carry it and what `restingView` answers to the
Workspace, the Mission view and a persona window), and the Mission view, handed that fact as `recovery`, reads no run
active in it, so it offers no Pause beside the root it draws `paused` and labels the run REQ-CHAT-008's "Run needs
recovery" rather than "Running"
(`docs/defects/fixed/the-mission-view-offers-pause-and-cancel-with-no-run-behind-the-session.md`). The Overview counts
paused agents on their own, and the transcript's "This task" reads a paused agent's state without its elapsed time — a
paused agent's only; every other agent keeps it (`scopeDetail`, OQ-100). The **runtime view**'s eleventh-state and
projection paragraphs and the **state-ownership view**'s rest row are updated; no package, edge, process, channel or
command changes.

**A quit ends a board run as a quit, and clause 15's audit re-cites the stop and the cancel (`PD-ORCH-005` clauses 15
and 19, `PD-CHAT-001` revision 4, `PD-CHAT-002` revision 2, 2026-09-28, R-065).** Main's board coordinator ends its runs
at the last window's close with the application's quit (`quitAll` → `announceShutdown`), not the stop control's
`cancel`, so a board run rests by `quit` (`docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`). The
**process view**'s board paragraph, the **runtime view**'s rest paragraph and §5 rows and the **sequences view**'s
approval note now cite the rulings in place of OQ-96; readings in OQ-108. A stop or a quit during a plan cycle now
withdraws what waits on a person rather than cancelling it (`Run.waitsWithdrawnBy`, which reads the stop request alone
and never the plan hold; clause 15's last bullet and `PD-CHAT-002` revision 2): the **runtime view**'s rest paragraph
and `cancelQuestions` row and the **sequences view**'s approval note say so. No package, edge, process, channel or
command changes.

**A crash offers the same choice as a pause (`PD-ORCH-005` clause 18, 2026-09-28, R-065).** `Sessions.continueSession`
accepts a session a crash left — `interrupted`, or persisted busy and `not-live` (REQ-CHAT-008's recovery state) —
beside `paused`, and refuses a busy one whose process may still be running it (`run-active`) and, first, any session
whose store has failed (`store-failed`, as the continue by message is: a run ended on a recording failure is not a
crash, OQ-42; a `paused` session under a store failure is refused the same way). The composer draws the two continues on
it (`crashLeft`) in the send pill's place, which `PD-CHAT-001` revision 4 prescribes on a paused session only (OQ-103's
reading, confirmed 2026-10-06 by R-071 and stated by `PD-ORCH-005` clause 26, revision 6), and the count and "Continue without them" wherever the session rests with an iteration open
(`resumable`, `runLevelResting`), the same count as a paused session's; either choice records the crash first, in
`launchContinuation`. Readings in OQ-103. The **runtime view**'s §5 Continue paragraph and the **process view**'s
`session.continue` note are updated; the command's shape does not change, and no package, edge, process or channel does.
A declined crash-left iteration's `iteration.end` summary names the decline and the crash, as its agents' reports do
(`closeLeftOpenIteration` writes the decline's summary whatever left the iteration open; every run that reaches it was
told to decline); the **runtime view**'s declined-iteration paragraph says so.

**`/stop` is offered as the stop, and the paused continue by message reads `Send` (`PD-ORCH-005` clause 15,
`PD-CHAT-001` revision 4, 2026-09-28, R-065).** The slash catalogue describes `/stop` as "Stop the active run"; it still
sends the stop's `cancel` op and never the explicit cancel. The paused strip's second continue shows `Send`, named
`Continue with a message`. The **runtime view**'s §5 `cancel` row and Continue paragraph are updated; no package, edge,
process, channel or command changes.

**A later iteration's root is told the open offers (`PD-ORCH-004` revision 4, 2026-09-28, R-065).** The offers list and
its reader (`openOffersText`, `offersToldIn`) move from `sessions.ts` to `run/offers.ts`, re-exported where they were,
so the run can use them without importing the session manager. `Run.turn()` adds to every execution iteration root's
first message the offers that message does not already hold (`offersForFirstMessage`); a plan cycle is told none. The
offers a handoff covers are passed to the run (`RunDeps.handoffOffers`), an offer a held list elided counts as told, and
the continue that resumes a root counts an offer its lists left out as held (`offersHeldIn`). REQ-SESSION-194's cut is
one function, `run/cut.ts`, shared by the handoff, the offers list and the plan cycle's pending tasks. Readings in
OQ-107. The **runtime view**'s continuation paragraph and the **state-ownership view**'s record row say so. No package,
edge, process, channel, message kind or store column changed.

**The plan gate meets a resumed iteration (`PD-ORCH-003` revision 2, 2026-09-28, R-065).** A run that resumes an open
iteration runs it unheld; when the gate would hold the run, the loop sets the hold once that iteration has closed and
work is left, and parks before the first new iteration (`parkAtPlanGate(resumed)`, its plan cycle told the pending tasks
by `resumedWorkSection`, that the iteration was left open, and what became of every message it held, `Todo.heldIds`),
then the launch content the continue built before that iteration ran, whose handoff therefore predates the close
(OQ-104). The message an iteration takes up is sent only to an execution root (`Run.firstMessage`), never to that plan
cycle. The message limit, checked as the resumed iteration closes, wins over the hold and leaves the continue's message
`complete` with nothing open, and its resolution appends it again (OQ-103). A plan decision's relaunch appends no task
(`RunDeps.appendsTask: false`), which also repairs the approved prompt being worked twice. Readings in OQ-104. The
**runtime view**'s start order, plan gate and resume paragraphs say so; ADR-0062 decision 1 carries the amendment. No
package, edge, process, channel, message kind or store column changed.

**A continue's message is also a task (`PD-ORCH-005` clause 17, 2026-09-28, R-065).** A continue by message that
resumes an open iteration appends its message to the planner todo as a task that iteration holds (`Todo.appendHeld`,
`heldBy` in the todo document), marked as a message for good (`Task.message`), which closes with it
(`Todo.releaseHeld`): done when it succeeds, pending on any other close. A message left pending is taken up by the next
iteration (`Task.nextUp`, `Todo.selectNext`), which is sent its text after the launch content when that names another
request (`Run.firstMessage`; since 2026-09-29 every selected task that is not the run's own is, as the entry above
records). A held message a death left stale closes as the record says its iteration did
(`Todo.releaseStale`, against `succeededIterationsOf`, which the run's constructor shares). A continue that delivers no
message — the Continue action, "continue without them", and the message-limit resolution's 'continue' and 'double' —
judges the todo after that settle, and appends no task while the todo holds the last request unfinished — a task of
that text pending, or in progress and held by the open iteration
(`Todo.holdsUnfinished`, `launchContinuation`): OQ-102's reading, beyond what clause 17 governs, confirmed 2026-10-06 by R-071 and stated by clause 25 (revision 6), which repairs
`the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md`. `RunDeps.openIteration` gains
`delivered`. Readings in OQ-102. The **runtime view**'s §2 gains the paragraph; the
phase 4 paragraph below keeps "no todo task is appended" as it was built then. No package, edge, process, channel,
message kind or store column changed.

**A quit answers nothing for a person, and every stored report is an artifact (`PD-ORCH-005` phase 7, 2026-09-27,
R-063).** Main tells the application's quit apart (`QuitState`, `main/exit.ts`). That covers the immediate exit, every
main window's close confirmed by its guard (`guardClose`), and a quit Electron starts on its own account, which
`before-quit` turns into the guarded close of every main window, all or none (`closeThroughGuards`). While the quit is
under way, an approval dialog's close sends no Deny and the question dock's cancellation is held back. The run host's
`shutdown` withdraws both instead (clause 9, OQ-96). The report write and its artifact are one function in the engine
(`storeChildReport`), which the stale settle and the decline now use. The **process view**'s quit paragraph, the
**sequences view**'s approval notes and the **runtime view**'s settle line are updated. The **seams view** is not:
`CommandContext` gains `quitting`, and no package, edge, process or channel changes.

**The Continue action states what it resumes and offers to continue without it (`PD-ORCH-005` phase 5, 2026-09-27,
R-060/R-061).** `SessionRecord.resumable` (`ResumableSchema`: the open iteration and how many agents will resume — its
root and every unfinished agent of it) is read from the store by `resumableOf`, as the plan gate is. On a `paused` or
`interrupted` session the composer's notices row states the count, which describes the continues, and on a `paused` one
offers "Continue without them" behind a confirmation — the strip keeps its one band (found by phase 5's review);
`session.continue` gains an optional `withoutPaused`, carried from the renderer through main and the run host to
`Sessions.continueSession`. Readings in OQ-98. The **runtime view**'s §5 Continue paragraph and the **state-ownership
view**'s rest row name the projection; the command's shape changes and no package, edge, process or channel does.

**A continue resumes the open iteration from every agent's record (`PD-ORCH-005` phase 4, 2026-09-27, R-060/R-061).**
Every continue — a new message, the Continue action, a plan decision — resumes the iteration a rest or a crash left open
before anything else runs: the same number, root and task (`iterate(openRow)`, `iteration_resumed`, no second
`iteration.start`), not held at the plan gate. Each paused child moves back to the state it resumes into
(`resumeChild`, `child_resumed`), re-claims its stored write scope (PD-TOOLS-006 revision 2) and carries on from its
record under a fresh `child_timeout`; the root carries on from its own; an agent whose record ends on its own answer
resumes into waiting (`run/resume.ts`). A resumed agent is told of its background sessions (clause 10) and the root is
handed a continue's new message, each recorded as its next message; no todo task is appended. Declining is
`continueSession`'s `withoutPaused` option. Readings in OQ-97. The **runtime view**'s §2 gains the resume paragraph and
diagram arm and its declined paragraph, §4, §5's Continue paragraph and §7's two rows move; the **state-ownership
view** names the resume as the record's reader; the **sequences view**'s §4 closes with the resume. No package, edge,
process, channel or message kind changed.

**A pause, a stop, a quit and a crash leave every unfinished agent paused (`PD-ORCH-005` phase 3, 2026-09-27, R-060/R-061).**
A run comes to rest by a pause, a stop or a quit (`Run.restCause`); the reserved run id's cancel is final
(`StopRequest.final`). A pause is refused at the plan gate, withdraws every approval and question (the gate's and
`ask_questions`' new `withdrawn` outcome, recorded interrupted and never denied), arms REQ-ORCH-134's tool deadline from
`runtime.graceful_pause_tool_deadline`, and holds the scheduler; every agent stops before its next model step, and the
turn records every call of the step it stopped in. Each unfinished child is left `paused` with its interruption and
the state it resumes into, the root execution record `paused`, and the iteration open with its interruption. Background
terminal sessions are attributed to their agent and recorded in `agent_terminals` (a pause leaves them running; a stop
and a quit end them). A crash is recorded from the store at the next repair or continue (`run/crash.ts`); loading a
session no longer settles anything, so `session.resumed` loses its settled count. Cancelling one child aborts its
execution and its descendants'. Until the resume lands, a continue declines the open iteration. **Repaired by the
phase's two adversarial reviews (same date):** a finished but unreported child leaves its parent unfinished; no model
call follows the pause (the turn re-checks after supervision and compression, the ladder lets the step's report stand,
the waits are released, the summariser makes no second attempt, the manual compression is refused); the status reads
`pausing` until the run rests; the explicit cancel is final in the rest's window and in teardown's; a withdrawn question
settles blocked with `question_withdrawn`; a stop waits within its 30 s grace and an execution it gave up on writes
nothing afterwards; a pause refused at the plan gate takes its tool deadline with it. Repairs
`a-pause-settles-children-instead-of-holding-them.md` and `cancelling-one-child-does-not-stop-it.md`. The **runtime
view** gains §2's rest and crash paragraphs and diagram arm, §4's and §5's rows move, §6's teardown and §7's four rows'
writers; the **state-ownership view** gains the rest's runtime and durable facts and the background session's owner;
the **sequences view** gains §4. The process protocol's `session.resumed` message drops `settledChildren`; no package,
edge, process or channel changed.

**Every agent's conversation is recorded as it happens (`PD-ORCH-005` phase 2, 2026-09-27, R-060).** A `Conversation`
now carries a recorder (the spike's seam), so each `push` is one `agent_messages` entry under the agent's task id and
each `replace` — a compression — one replacement entry; the root records under the iteration's root task id and a
child under its own, and REQ-ORCH-088's fallback retry writes an empty replacement before its second attempt; a turn
closes its conversation when it ends, so a late manual compression records nothing. The run opens an `iterations` row
with the root's task id when an execution iteration's root is minted and closes it with `iteration.end` in one
transaction; the transcript clear removes closed iterations' records in its own transaction (clause 12). Repairing
`a-crashed-iteration-number-is-reused-by-the-next-run.md`: a run closes an iteration a dead run left open before its
first iteration and numbers past it, the ledger holds its own root's tree, and task ids are minted against every
recorded root's id. The **runtime view** gains a §2 paragraph, a §3 paragraph and two §7 rows' writers; the
**state-ownership view** gains the record as a durable fact. No package, edge, process, channel or message kind changed.

**The record a paused run resumes from, in contracts and the store (`PD-ORCH-005` phase 1, 2026-09-27, R-060/R-061).**
The child machine gains its eleventh state, `paused` (`contracts/children.ts`: every non-terminal state may move to it,
and it moves back to the state the child resumes into), with the `Interruption` vocabulary (`pause | stop | quit |
crash`); it presents as `queued`, REQ-MONITOR-046's catch-all, and the agent projection never settles it for display
(OQ-94 records the departure from REQ-MONITOR-211/213). Store **v23** appends `children.interruption`,
`children.resume_state` and `children.write_scope` (PD-TOOLS-006 revision 2, written at spawn), and three
session-scoped tables that cascade with their session: `iterations` (each execution iteration with its root's task id,
open or closed, one open per session), `agent_messages` (every agent's conversation, a compression written as a
replacement) and `agent_terminals` (the background sessions an agent started). The **runtime view** moves: §7's heading
and four rows, and §4's write-scope, paused-state and projection paragraphs; the **state-ownership view**'s write-scope
row says the declared patterns are now stored. No package, edge, process, channel or message kind changed.

**REQ-CHAT-055's CPU-profile round: an increment re-reads only the rows it changed (2026-09-29, R-048's order continued
under R-062).** V8's CPU profile of the built app named the loaded side's extra script per increment as the transcript's
own passes over every displayed row. `ui/transcript/pool.ts` gains `reuseOffsets` and the `MeasureLedger` the pane rebuilds
the offset table from (only the rows that changed, or whose identity the measurement pass re-measured — the caches report
evictions to it through `cache.ts`'s new `onEvict`), and `updateShape` compares keys only past the shared rows;
`Row.tsx` gains `placementsFrom`, which the projector carries the places forward with; `project.ts` finds the reusable prefix
by bisection over a carried reach and exports `settlesWithRunning`, which lets `projector.ts`'s `changedFrom` bound a run
beginning or ending. The **runtime view**'s step-4 and step-5 rows and its pool paragraph, and the **component view**'s
`pool.ts` entry, say so. The proof's side is `transcript-proof.mjs` and `lib/trace-summary.mjs` (the CPU profile's
attribution), which no view describes. No package, edge, process, channel, message kind, store column or owner of state
changed.

**A skip before the open's resolution (2026-09-28, R-062).** The **process view**'s `initialization.*` paragraph says
which listed ids a skip leaves out (only one the live run is attempting) and that a skip arriving before the open's
one automatic resolution performs that resolution first (OQ-122). No package, edge, process, channel, message kind,
store column or owner of state changed. **Its second round (2026-09-29):** the same paragraph now names the
`backgroundRun` field the initialization state carries on its existing channel. The window reads it to keep a
background run out of the setup dialog and to keep the prompt due beside it (REQ-WORKSPACE-103/110, OQ-123). It is one
more field on an existing message; no message kind changed. **Its third round (2026-09-29):** the paragraph adds that a
skip leaves an id already recorded completed where it is, and that a skip after the resolution reads nothing more before
it records; nothing else in any view moved. **Its fourth round (2026-09-29):** the paragraph adds that main makes every
marker write through one queue and builds each patch inside its turn from the file as it stands, and that a skip decides
what it leaves out in that turn. No message, channel or owner of state changed; the writer is still main's coordinator.
The **runtime view**'s `initialization:` / `project_init:` bullet still described the first execution's re-read before
each recording, with the reason this round falsified; it was corrected in place in the repair round that followed, the
old sentence kept and marked superseded beside a statement of the queue (`ExecuteDeps.commit` replaces `reread`).
**Its fifth round (2026-09-29):** the queue is one per workspace root rather than one for the coordinator, so a
workspace just opened does not wait behind the last marker write of the one it replaced (REQ-WORKSPACE-013); the
process view's paragraph and the runtime view's bullet say so. Nothing else in any view moved.

**The notices generator reads the shipped setup manifest (2026-09-28, R-062).** `tools/notices/notices.mjs` reads
`apps/desktop/resources/setup-manifest.json` rather than `pins.json` as REQ-STARTUP-142's manifest, by a copy of
`SetupManifestSchema`'s field names that `notices.test.ts` holds to the schema; `pins.json` is read for the runtime's
name only. The **component view**'s notices-generator and setup-manifest sections say so, and name the second test that
crosses into a package. No package, edge, process, channel, message kind, store column or owner of state changed.

**A session's lock ends with the application that held it (ADR-0014, 2026-09-28, R-062).** Main is gone only after
the run host: the orderly quit waits, bounded, for the run host's exit after its `shutdown` and ends it if it has not
come, and an immediate exit (`exitCleanly`) ends it at once (`endBeforeMain`, `main/exit.ts`). The **runtime view**'s §6
gains *The application's end*; the **state-ownership view**'s lock row and the **process view**'s quit paragraph say
so. No package, edge, process, channel, message kind or store column changed.

**The artifact variables stay with the launch they describe (REQ-STARTUP-106/147, ADR-0054 "The updater" item 6,
2026-09-28, R-062).** Main's first statement takes `APPIMAGE` and `ROTARIS_PORTABLE_ARTIFACT` out of its own
environment and hands them to the updater's classification alone (`takeArtifactVariables` in `platform`), so the run
host, the workspace services and everything the run host starts inherit neither. The **process view** gains *The
environment a child is started with* beside the ownership table, and main's updater clause says where the classification's
two variables come from. No package, edge, process, channel, message kind or store column changed; `platform` gains
`artifact-environment.ts`.

**REQ-CHAT-048's duplicate-reasoning hygiene compares per agent (2026-09-28, R-062; OQ-91).** Step 4 kept one lookback —
the previous thinking row of any agent — so an agent's repeated burst survived whenever another agent reasoned between
the copies. `ui/transcript/project.ts` now keeps each agent's own previous thinking row, and the bounded form looks one
up below its cut only for an agent whose unstamped reasoning is in the suffix. The **runtime view**'s step-4 row says so.
No package, edge, process, channel, message kind, store column or owner of state changed.

**The layout contract has one publisher, and `ui-audit` survives a thrown expression (2026-09-28, R-062).** The window
controls (`PD-SHELL-003`) wrote their `data-ui-contract` by hand as an object; the audit's CONTRACTS sweep iterates the
relations array, threw in the renderer on every view carrying the title bar, and the script died on the driver's
`{ error }` answer before any evidence pack. The controls and the Proposals tab now publish through
`layoutContractAttributes`; `tools/check-ui-language.mjs` refuses a hand-written `data-ui-contract` anywhere in the drawing
roots (`tools/ui-contract-publisher.mjs`); `ui-audit` reports a thrown audit expression as an `AUDIT-ERROR` finding and
a non-array contract as a `schema` finding, and moves on. The **seams view** §8 steps 4 and 6 and the **component view**'s
design-system paragraph say so. No package, edge, process, channel, message kind, store column or owner of state changed.

**The update restart's record passes in two steps (REQ-STARTUP-121, REQ-STARTUP-161; ADR-0055 *Amended 2026-09-28*,
R-062).** `packages/platform/src/instance.ts` now offers the record, waits on the timer port for the successor's
acknowledgement within the hand-over interval, and rewrites it only then, so a successor that stopped waiting is never
named by it. The **sequences view**'s `Restart now` diagram and prose gain the offer, the acknowledgement and the
refusals they add. The ordinary hand-over of a second launch is unchanged. No package, edge, process, channel, command,
store column or owner of state changed.

**The runtime makes no request of its own (REQ-STARTUP-160, REQ-SHELL-005; repaired 2026-09-28 under R-062).** The
connection `pnpm updater-proof` recorded at launch was Electron's spellchecker fetching a Hunspell dictionary, not
Chromium's component updater; main now empties each session's dictionary list and turns its spellchecker off in
`session-created` (`main/runtime-requests.ts`). The **process view** gains a paragraph under its diagram saying that
Electron and Chromium add no host of their own to the ones the product reaches, and why — not that the endpoints drawn
are all of those hosts, which they are not (corrected at verification). No package, edge, process, channel, message kind, store
column or owner of state changed; OQ-93 raised (OQ-91 on its branch).

**REQ-CHAT-055's measurement round: the transcript projects once per change, not once per render (2026-09-28, R-048's
order under R-062).** The built app was traced appending to an empty transcript and to one of 1,200 rows, and the extra
time at depth was script — three to four synchronous renders per increment, each re-running ADR-0046 step 4 over the
whole resident window and each re-rendering every bound row through a context value rebuilt per render — not layout,
paint or the `ResizeObserver` pass. `ui/transcript/projector.ts` now keys step 4 on every input it reads, takes the
bounded form when the rows alone changed (the earliest-changed row read off the two arrays, no prop across the seam;
only for an append or a row replaced at its own index — the fix round found a removal and a scope switch taken wrongly;
fix round 2 found the bounded cut reading runs on raw rows where the fold reads the rows hygiene keeps, and repaired it),
and the pane holds one (`TranscriptPane.tsx`); the offset table and the surface value rows read are built once per
change of what they carry. The
**runtime view**'s step-4 row and the **component view**'s `ui/transcript` module list gain the projector. The proof's
side of the round is `apps/desktop/scripts/transcript-proof.mjs` and `lib/trace-summary.mjs`, which no view describes.
No package, edge, process, channel, message kind, store column or owner of state changed.

**The setup manifest (REQ-STARTUP-058/059, `first-release-plan.md` §4.1, built 2026-09-28).**
`apps/desktop/resources/setup-manifest.json` exists — Git and ripgrep as the requirement pins them, the `@playwright/mcp`
pin the guard checks, the language servers as `pins.json` declares them — and `electron-builder.yml` packs it. Its schema
is `config`'s `setup-manifest.ts`, read by the pre-build guard now and by the machine-setup flow when that is built. The
**component view** gains a section and its `config` node names the schema; the **process view**'s files-on-disk table gains
the file's row (`process.resourcesPath/setup-manifest.json`, read by the guard and by nothing in the product yet). No package, edge, process, channel, message
kind or store column changed; `config` gains the `zod` dependency `contracts` already carries.

**The updater (first-release-plan.md §4.6, ADR-0054; built 2026-09-28, R-062).** ADR-0054's bespoke main-process
updater exists: `apps/desktop/src/main/updater/` — the flavour classified once from the artifact the launch started
from (REQ-STARTUP-106), the one endpoint and the offer rule (105/107–110/112), the compiled-in key set — EMPTY until
O-2 — and the Ed25519 detached-signature format (167/168), REQ-STARTUP-122's strict sequence with the signature verified
before the manifest is parsed, the 1 MiB download into a `rotaris-update-` staging directory (118/124), the portable
and installer strategies (115/125/126; the dmg and AppImage ones wait for `PD-STARTUP-001`'s withdrawal), and the
orchestrator holding the one offer and the one operation in flight (114/116–121, REQ-STARTUP-046). The **process view**
gains the updater in main's row, the feed as an endpoint in the diagram, the `update.install`/`update.restart`
commands, and three rows in the file table (the staging directory, the portable's `.update`/`.old` siblings, the
`updates/dismissedVersion` key); the **sequences view**'s launch gains the post-show activation the check rides and a
new section for `Update now` and `Restart now`, the latter ADR-0055's hand-over of the record to a successor started on
the sentinel branch (`builtin:update-successor`, `inheritInstance`); the **runtime view**'s §8 states what no
configuration tier reaches (REQ-STARTUP-111); the **state-ownership view** gains the held offer, the classification, the
waved-off version and the key set; the **component view** names the `app-main → release-naming` edge as the updater's.
`MainWindows` gains a post-show activation hook (REQ-STARTUP-043), the notice store an `update` in place (REQ-SHELL-118),
the notice action a `disabled` description, and the preference table `updates/dismissedVersion`. No package, edge,
process, channel or store column changed; two command kinds were added. Three questions were raised (OQ-83, OQ-84,
OQ-85 — OQ-76 to OQ-78 on the branch, renumbered at the merge) and one defect noticed beside the mechanism (`redirector.gvt1.com`). **Repaired at verification the same day:**
the **state-ownership view**'s instance-record row and the **sequences view**'s `Restart now` now say the record passes
only while a restart this instance started waits for its successor (`acceptSuccessor`, REQ-STARTUP-161); the sequences
view's launch and the process view's `.old` row say the backup cleanup runs at a launch's first check only and that an
update already installed in this process is not offered again (REQ-STARTUP-115/119); OQ-86 raised (OQ-79 on the branch, renumbered at the merge). **Repaired at the
second verification:** the **process view**'s main row names `updater/successor.ts`; the **sequences view**'s `Restart now` and the **state-ownership view**'s instance-record row
say that an accepted successor the record cannot be passed to fails the waiting restart (`onRecordPassFailed`,
`updater/successor.ts`, REQ-STARTUP-121) and that a refusal answers with its reason; the **seams view**'s §6 names the
notice store's `update` in place and `action.disabled` as REQ-SHELL-118's exception to "a second notice replaces".

**The reserved token's launch carries the parent's sandbox switch (2026-09-28, R-062).** Three defect notes repaired
in `apps/desktop` and `packages/ui`; one moved a process fact. The reserved token's launch of the application's own
executable (REQ-MCP-033) now carries `--no-sandbox` when the parent was started with it, between the token and `--`
(the token stays first; a first build that put it before the token is superseded), and main forks the run host with the
same switch so the launch builder reads it off its own argv; the sentinel drops it before the separator. `@rotaris/platform` gains `chromium-switches.ts` (no new edge: main and the run host already import
platform). **OQ-82** holds the reading (OQ-76 on its branch, renumbered at the merge). The **process view**'s bundled-runtime paragraph names it; no package, channel,
message kind, command or store column changed. The About caption's type token and `settings-proof`'s computed-size
probe changed no view.

**`inherited_context` reaches the child (REQ-TOOLS-152, REQ-TOOLS-154 item (5), REQ-ORCH-032; repaired 2026-09-28,
R-062).** A `delegate` call's `inherited_context` ids were stored on the child's row and read by nothing. `ChildLedger.spawn`
now resolves them: an id no task in the session has (the root execution record included, REQ-ORCH-072) refuses the call
with no record (REQ-TOOLS-153's `rejected`), one naming a task that has not completed — the root, the caller's own task, a
failed, cancelled, unfinished or report-less one — is ignored, and the caller's completed children come back on
`Spawned.inherited`. `IterationChildren.delegate` renders their `reportBlock`s under one heading
(`notify.ts`'s `inheritedContextBlock`) and remembers the text per task id on `attached`'s terms; `childPayload` takes it
as a sixth argument and places it as item (5), after the artifact blocks and before the task. The **runtime view** §4
gains a paragraph; the **state-ownership view** gains the remembered block as a volatile fact. Another parent's completed
child refused for ownership is OQ-81 (OQ-76 on its branch, renumbered at the merge). No package, edge, process, channel, message kind or store column changed.

**A prerelease's installer is named from the declared version (2026-09-28, R-062).** `pnpm package` now reads the manifest's
`version` as written (`0.1.0rc1`), renders the installer's name through `tools/release-naming` and writes it as a literal into
the configuration electron-builder runs with (`release/electron-builder.package.yml`); `electron-builder.yml` carries no
`artifactName`, whose `${version}` was the normalised `0.1.0-rc1`. `build-hooks.cjs` compares the configured names and, in a
new `artifactBuildCompleted` hook, the produced file against the same text. The **process view**'s row for the manifest's
`version` gains `pnpm package` among its readers, and the **component view**'s section on the scripts' shared modules gains
`scripts/lib/artifact-names.mjs`, which both scripts load and which reaches `tools/release-naming`. No package, edge,
process, channel, message kind or store column changed.
The installer's own Windows metadata stays normalised — OQ-80.

**One machine-wide directory for both discoveries, and a strict decode at the port (REQ-WORKSPACE-045, 051, 053; built
2026-09-28, R-062).** `SkillRootsEnv` gains `machineDir`, so REQ-WORKSPACE-051's fourth user-scope root is
`<machineDir>/skills` where it was the literal `/etc/codex/skills`; the literal now lives once, in
`config/src/skills/roots.ts` (`MACHINE_CODEX_DIR`, `machineCodexDir`), and `PD-WORKSPACE-002`'s instruction base reads
it from there. The run host's existing `SkillHostDeps.machineDir` now reaches `discoverSkills` too, fed by
`ROTARIS_CAPTURE_SKILLS_MACHINE ?? ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE` under `__ROTARIS_SEAMS__`. `NODE_DISCOVERY_PORTS.readFile`
decodes with a fatal `TextDecoder`, so a file that is not UTF-8 reaches the unreadable-file arm of every walk that shares
the port (OQ-79 for a `SKILL.md`). The **runtime view**'s §1 passage on the machine-wide base and its §7 Instructions
bullet name both. No package, edge, process, channel, command, message kind or store column changed.

**After one unanswered approval, a run treats the user as away (`PD-TOOLS-005`, built 2026-09-28, R-062).** One holder
per run, `UserPresence` (`engine/run/presence.ts`), installed by `Sessions.start` and every continuation beside the mode
override and handed to every agent's port through `ToolPortContext.presence`, a delegated child's included. The gate
(`GateDeps.presence`, passed by `run-host/tools.ts`) marks it when a brokered wait ends by timeout and, while it is
marked, resolves every ask that would prompt at once under the headless policy with a reason naming the timeout that
expired; the user returns on the first input to the run's session, wired at the top of `Sessions.control` and in its
`clearTranscript` branch, in `controlAsync` and in the id-routed answers. The **runtime view** gains a clause in §3 and a
paragraph after §5's table; the **sequences view** gains one bullet in §2; the **state-ownership view** gains a volatile
row for the run's away mark — owned by the run host, set only by the gate's timeout arm, cleared only by `Sessions`'
input arms, never persisted. No package, edge, process, channel, message kind or store column changed;
the two transitions are session-log lines because the timeline vocabulary has no word for them (OQ-76).

**Hook faults reach the application log (defect repair, 2026-09-28, R-062).** `HookPortContext.log` and `HookSinks.log`
were documented "the application log only" and wired by `Sessions` to the per-session log at `INFO`, where the
`WARNING` default of `session_log_level` dropped them, so a hook fault that reduces to a log entry (REQ-HOOKS-079/128/129)
and the run host's account of an unresolvable hook set (REQ-HOOKS-085) were recorded nowhere at the default
configuration. `SessionsDeps` gains `log`, the application log at `info` (PD-MONITOR-002), which the run host fills with
its `log` event; both hook-port construction sites write through it. `CheckpointPortContext.log` is decided the other
way and says so: it stays the per-session log, since `run-host/checkpoints.ts` already writes every checkpoint line to
the application log through `CheckpointRootDeps.log` as well. The **process view**'s application-log paragraph gains
the sentence. No package, edge, process, channel, message kind or store column changed.
**Three permission-gate defects repaired (2026-09-28, R-062).** The path scope of REQ-TOOLS-018 joins each path argument
to the workspace root before the resolver, so a workspace-relative read no longer resolves against the run host's process
directory; `realPathOf` rebuilds a relative path's missing tail with `basename` and drops no character; and PD-TOOLS-004's
`publicTool` predicate now decides whether a rule's tool set holds a call (`toolSetHolds` in `agent-tools/src/policy.ts`)
and whether the plan gate withholds it (`withheldUnderPlanGate(name, isPublicTool)`, passed `false` by the run host's MCP
loop and by the gate for a name it serves with something other than the public tool or removed itself), so an MCP tool
offered under a public name is ruled as the undeclared tool it is. The **sequences view** §2 gains two sentences on the
approval bullet and the **runtime view**'s MCP-surface passage one clause; no package, edge, process, channel, message
kind or store column changed.


**A session approval of a file write covers that path (`PD-TOOLS-004`, built 2026-09-27, R-057).** A grant made by
"approve for session" on a call of the public `write_file` or `haet_edit` (`haet` folded in) now stores the set of
paths its REQ-TOOLS-018 path arguments resolved to, against the workspace root, when it was made, and matches a later
call of that tool from that persona whose set is exactly that one, whatever its other arguments and its
`write_file` operation. An unresolvable path never matches; a call carrying no path key falls back to REQ-TOOLS-024's exact
match, which every other tool keeps — an MCP tool offered under the name `write_file` or `haet` included, since a
server's tool is prefixed only when its name is taken. The rule is `resolvedPathSet` and `approvalMatches` in
`agent-tools/src/policy.ts`; `PolicyContext.grant` now takes the root, the resolver and `publicTool`, which the gate
passes from its new `GateDeps.publicTool`, and `run-host/tools.ts` supplies that predicate: true when the callable map
holds the very executor `executorsFor` built for the name. The **sequences view** gains one bullet on the grant in §2;
no package, edge, process, channel, message kind or store column changed.

**`PD-ORCH-004` repaired after review (2026-09-27, R-057).** One behaviour moved: a file-writing call is recognised by
its lower-cased name, as the gate's own fallback dispatches `Write_File` to `write_file`, so such a write is now listed
among a cut-off child's changed paths. The rest is record: four end-to-end cases in `run/ladder.test.ts` pin the paths
across REQ-ORCH-088's retry, the rule read at the failing attempt's expiry, the landing grace and a role's
`stall_timeout`. The `delegate` field `continuation_of` is raised as **OQ-66** against REQ-TOOLS-152. The **runtime
view**'s child-timeout passage names the lower-case match and the lexical resolution, and its continuation paragraph
names the same-iteration limit and OQ-66. No package, edge, process, channel, message kind or store column changed.

**A child cut off while making progress hands its work back (`PD-ORCH-004`, built 2026-09-27, R-057).** REQ-ORCH-088's
expiry path is unchanged; at the expiry instant a child's `ProgressLog` (`engine/children/cut-off.ts`, fed by the turn's
new `onToolCompleted`) answers whether it completed a tool call within the final stall window, and if it did, its failed
report gains a runner-owned `cut_off`: the statement, the workspace paths its own file-writing calls changed, and —
unless it is a continuation — the offer. `delegate` takes `continuation_of`; `IterationChildren.delegate` refuses it
before a record exists unless it names the caller's own child that made the offer and was not yet continued.
`runtime.child_stall_timeout` and a role's `stall_timeout` reach the run for the first time. The **runtime view** moves:
the child-timeout passage, a §4 paragraph, and §7 names v22 and `children.continuation_of`; the **state-ownership view**
gains the progress log. No package, edge, process, channel or message kind changed; one store column was appended.

**The application log keeps `info` and above (`PD-MONITOR-002`, built 2026-09-27, R-055).** Main's standard output
carried the level of a forwarded line as text inside it and none on main's own, and recorded every level. Each line now
carries its level in a column of its own, and a line below the threshold is not written; the threshold is `info`, moved
only by `ROTARIS_APP_LOG_LEVEL`, read once at start. Main's own reports of a loss are `error` — a `shutdown` a child
refused or left unanswered while still running among them, since an exit of 0 does not prove one — so a crash is still
recorded at a higher threshold. The quit races each child's `shutdown` against its exit (`main/exit.ts`), so an answer
lost to the exit neither stalls the quit for the bound nor writes that line. The level, the predicate and the line are
the new `main/app-log.ts`; `index.ts` keeps the wiring. The **process view** gains a paragraph on the application log,
the `log` event names its fields, and the MCP-child paragraph says `debug` is now a filter; the **state-ownership view**
gains the threshold as a fact nobody writes after start. No package, edge, process, channel, message kind or store
column changed.

**The `FAILED ` marker matches in capitals only (`PD-TOOLS-003`, built 2026-09-27, R-055).** Of REQ-TOOLS-113's five
literal failure markers, `FAILED ` alone is now matched case-sensitively; the other four, the error count, the banner
and the pipeline check keep their casing. The rule lives in the marker list in `agent-tools/src/terminal/classify.ts`,
and the search and the quoted line share one predicate. No view states the terminal's marker rule at this depth, so
no view changes beyond this entry; no package, edge, process, channel, message kind or store column changed.

**The run's model calls outside an agent's turn are counted (defect round, 2026-09-27, R-054).** Compression, the
child-report summariser, the intent classifier and the loop supervisor's classifier discarded the usage their
requests reported, so the run's tokens, its cost and `usage.update` missed them (REQ-EVENTS-053, PD-MONITOR-001).
Each now calls through `meteredBackend` (`engine/run/metered.ts`), a decorator on the `AgentBackend` port that hands
every completed request to the new `Run.countUsage`. `PreflightContext` gains `countUsage` and the `Sessions`
`supervisor` factory a third argument, so the run host's two classifiers are wrapped where they are built. The
**runtime view** moves: one passage in "What a step costs". No package, edge, process, channel, message kind or
store column changed.

**The `/skills` listing (REQ-CHAT-162, `first-release-plan.md` §2.2, built 2026-09-27).** One renderer command,
`skills.list`, relayed by main's skills facet to the run host with the followed session named by main (a window
following none is refused there, OQ-67); the run host writes the listing as ONE `system` row through that session's
own writer (`run-host/skills.ts`'s `writeSkillListing`), and the one row renderer draws a system row whose text is
the listing as the listing (`transcript/Row.tsx`, the text fixed once in `contracts/skills.ts`). The **process view**
gains the command and its reply, and the run host's row says it writes the listing; the **component view**'s skills
row names the three places; the **runtime view**'s `transcript_rows` line says the listing is a row like any other.
No package, edge, channel, store column or state owner changed. The two repairs its gate asked for — the listing's
fields drawn through the plain-text path so a URL stays a link, and the prompt-file registrar holding `/skill` and
`/skills` — are below the depth any view describes, so no view changes beyond this entry.

**Workspace-context injection, measured and proven in the built app (first-release-plan §3.2 and §3.3, 2026-09-27).**
`SkillHost.workspaceContext` times its cold path on the monotonic clock port. It covers the policy read, the
discovery and the merge, and logs one line, which is REQ-WORKSPACE-049's figure. The policy read moved **out** of
the discovery step into its two callers, `workspaceContext` and `instructionFiles`, so that it can be timed apart;
`enabledUnder`, a private step, now takes a policy already read. The machine-wide instruction base's directory is
injectable (`machineDir`, `/etc/codex` when absent). Two verification seams, both compiled out of a packaged build,
reach the built app: `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, read by the run host and the workspace service, and
`ROTARIS_CAPTURE_MODEL_REQUESTS`, through which the scripted client alone appends what each call received. The
**runtime view** gains the timing and the injectable base. The **process view**'s file table gains the instruction
files, which it had never listed, and the capture file. No package, edge, process, channel, message kind or owner
of state changed.

**The version guard and the reported version (first-release plan §4.1, built 2026-09-27).** `tools/release-guard` is a
new build-time package — `pnpm release:guard <tag>`, the pre-build guard of REQ-STARTUP-028 over the product version and
REQ-STARTUP-059's package pins — and `tools/release-naming` gains the release-tag grammar (REQ-STARTUP-027/029). Tools sit
outside the component view's runtime matrix (`boundaries/ignore` covers `tools/**`), so `module-map.md` names the package
and no edge moves. In main, `shell.hello`'s version now comes from `main/version.ts`, which reads the application
manifest beside the bundle, rather than from `app.getVersion()`, which answered Electron's own version for the unpacked
entry. The gate round that reviewed it moved the reader into `@rotaris/platform` (`version.ts`, an existing edge for
both roots) because the **run host** reads the same file: the MCP client's `clientInfo.version`, a literal `0.1.0`
until then, is now the declared version on all three connection paths. The **process view** says so in the About
paragraph and gains the manifest as a file main and the run host read; the **runtime view**'s MCP paragraph names who
the client says it is. No process, channel, message kind or state owner changed.

**The two bundled assets (first-release-plan.md §4.4, built 2026-09-27).** `tools/build-id/` joins `tools/notices/` as a
build-time tool: `pnpm build-id` writes `apps/desktop/resources/build-id.txt`. `pnpm package` runs both tools before
freezing, and `electron-builder.yml` carries both files to the root of `process.resourcesPath`. It leaves the tool
server's dist-info licence out of the artifact (REQ-STARTUP-015). The **component view** gains a section for the writer
and the two script modules, and the **process view** gains the identifier's row in "Files and directories on disk", an
updated notices row and a corrected About paragraph. No package, edge, process, channel, command or message kind
changed. `about.ts` reads what it read before. The gate review later that day renamed `lib/bundled-assets.mjs` to
`lib/about-assets.mjs`, ~~because REQ-STARTUP-143's "bundled asset" is a font family or the icon set~~ because
`tools/notices/bundled-assets.json` already holds the bundled assets that carry a licence file. It moved
`package.mjs`'s closing lines into a third script module, `lib/package-verdict.mjs`. The **component view**'s section
says both. The scripts now import two constants and `normalize` from the tools, which is not an edge the boundary rule
governs. Nothing else in the views moved. *The review's second round struck the reason: the specification counts both
About files among its bundled assets (domain 12's appendix, REQ-SHELL-140). The component view's sentence saying
otherwise is corrected, and the section now names the flag's usage check and the proof's use of the writer's list of
git's redirecting variables. The stash's ledger and removal branch stay inside its module. Nothing else in the views
moved.*

**The notices generator, and the About page's lookup (first-release-plan.md §4.3, built 2026-09-27).** `tools/notices/`
is a build-time tool, not a package: `pnpm notices` computes the shipped closure offline and writes
`apps/desktop/resources/THIRD-PARTY-LICENSES.txt` only when REQ-STARTUP-143's validation passes. Main's About reader now
looks for the file under REQ-STARTUP-141's name; it had looked for a lowercase name. The **component view** gains a
section for the tool, and the **process view** gains the file's row in "Files and directories on disk" and a corrected
About paragraph. No package, edge, process, channel, command or message kind changed. The gate review later that day
changed two things inside the tool. A licence file that only refers to the licence, or only attributes, is no longer
counted as the text (OQ-75). The LGPL address must now have an address's shape. No view changed for either: both
are internal to `notices.mjs`, and it still reads and writes what the component view says. The review's second round
changed three more things inside the tool. The address check refuses the placeholders it still accepted. An input that
is not a JSON object fails as unparsable. A directory where the output goes is a handled error. No view changed.

**Product-drawn main-window chrome (`PD-SHELL-003`, built and revised 2026-09-24).** On Windows, Linux and macOS the main
`BrowserWindow` is frameless with its native menu hidden. The existing title bar now ends in minimize,
maximize/restore and guarded close controls; four renderer commands reach the sending window in main.
Auxiliary-window senders are refused before those commands act. The **process view** gains those command
kinds. No package, process, channel or state owner changed.

**The terminal on Linux (defect round, 2026-09-24).** Two repairs, no structure moved. A background session is started
as the leader of its own process group on POSIX (`spawnChild`'s new `processGroup`), so `send_signal` and the tree kill
reach it. PD-TOOLS-001's POSIX capture is encoded so the emulated screen cannot wrap it. No view text describes either
at this depth, so no view changes beyond this entry. *Falsified 2026-10-06, kept as written above:* the screen does wrap
the capture's 76-column rows below 76 columns (REQ-TOOLS-128 narrows it to 20), and the parse now joins the rows back
([the note](../../defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md)); still no
view text at this depth.

**An immediate exit closes the child windows first (defect round, 2026-09-24).** On Linux, `app.exit` over an open
modal child window segfaults inside Electron, which is how every live-run sign-in there ended. The capture seam's exit
and the driver's `quit` now go through `exitCleanly` (`main/exit.ts`). The **process view** gains one sentence; no
package, edge or message kind changed.

**Configured rates price a request (`PD-MONITOR-001` revision 2, built 2026-09-23).** A request the provider did not
price is priced at the ladder cell from the configured rates of the model it was sent to, exactly, and the run's
total carries one of four qualifiers, persisted in the new `sessions.cost_qualifier` column (appended migration
**v21**). A configured price is read from the YAML scalar's source text (`config/prices.ts`), in the configuration
files and in the discovery snapshot. The **runtime view** moves: "What a step costs" is rewritten, and §7 names v21
and the column. No package, edge, channel or message kind changed; the `usage.update` payload is unchanged.

**Money moves to `kernel` (ADR-0031 accepted narrowed, R-049).** `engine/money.ts` becomes `kernel/money.ts` and
gains the two operations pricing needs: exact multiplication by a whole token count, and `amountFromText`, which
reads a number's text as the decimal it states. A price is read in `config` and summed in `engine`, and `config`
may not import `engine`. `model/reported-cost.ts` now expands a reported figure through the same reader.
`rotaris/money-only-in-money-ts` (ADR-0031 consequence 2) makes `money.ts` the one place arithmetic on an amount
lives. The **component view** (the kernel box), `module-map.md` (the kernel row) and the runtime view's file
reference move. No edge changed: `model` → `kernel` was already allowed.

**A delegated child's write scope (`PD-TOOLS-006`, built 2026-09-23).** `delegate` takes `write_scope`; a live
scoped child claims the paths it matches, and the gate refuses a `write_file` or `haet_edit` write into a claimed
path to every other agent of the run except the child's descendants, ahead of the permission resolution. Each child
is told the live scopes in a block after the workspace-root line of its payload. The glob compiler moved from
`agent-tools/tools/search.ts` to `kernel/glob.ts`, because the engine and the tools both read the dialect and
import neither each other. The **component view** (the kernel box), the **runtime view** (§4 gains "Write scopes"),
the **state-ownership view** (one in-memory row) and `module-map.md` (the kernel row) move. No edge, channel, message
kind or store column changed.

**A child's provider requests reach the run's totals (defect round, 2026-09-23).** `IterationChildren` built a
child's turn with no `onRequestUsage`, so the session's tokens, its cost and every `usage.update` counted the
entry agent alone. `ChildrenDeps` now carries the run's own callback into every child's turn, at every depth.
Only the **runtime view** moves: one sentence in "What a step costs". No package, edge, message kind or store
column changed. It is the prerequisite `PD-MONITOR-001` revision 2 names; the defect note moves to
`docs/defects/fixed/`.


**One instruction-file set, two readers (defect round, 2026-09-22).** The retrospective held its own copy
of REQ-WORKSPACE-041's discovery rule — the two names at the workspace root, and no policy at all — so it
read files the user had switched off and could still propose edits to them, while injection honoured every
switch. `SkillHost.instructionFiles` is now the one computation: `workspaceContext` calls it, and
`dispatch`'s `retrospective.capture` hands its result to `captureRetrospectiveJob`, which discovers nothing
of its own and reads nothing when handed nothing. `02-process-view.md`'s retrospective paragraph and
`03-runtime-view.md`'s context-unit paragraph both move. Whether a switch stated over what agents are
*given* binds an *analysis* is **OQ-65**; the build proceeds under "it does". The defect note moves to
`docs/defects/fixed/`.
*Added 2026-10-13 (`PD-LIBRARY-002` revision 2, OQ-235):* the one computation still decides the switches for both
readers, but the retrospective reads only its workspace-root part — `SkillHost.retrospectiveInstructionFiles`, which
`dispatch` now passes — so a file under the global, home-relative or machine-wide bases reaches agents and not the
analysis. `02-process-view.md`'s retrospective paragraph and `03-runtime-view.md`'s context-unit paragraph move.

**Workspace-context injection fills the first context-unit slot (PD-WORKSPACE-002).** The slot
`03-runtime-view.md` carried as "not built" since ADR-0063 now holds the merged instruction context:
`SkillHost.workspaceContext` discovers the present files over the workspace root plus five further bases,
drops the ones the per-file `instructions.overrides` policy switches off, merges the rest in discovery
order, and caches the block per workspace root for the session's lifetime. Both the runtime view's prompt
section and its configuration section move; `04-seams.md` §5 gains the files a Settings-**editable** key
needs past the six a plain key needs. **`REQ-WORKSPACE-050`'s worktree half is now built** (2026-09-22): the
instruction files are read from the root the run executes in while the skill catalog stays with the base
workspace, the execution root travelling through `configure`'s context, and the merge cached per base root
**and** per execution root. The defect note moves to `docs/defects/fixed/`.

**The requested permission mode always applies (PD-TOOLS-002).** No unattended downgrade: the
requested mode is the effective mode for every agent, for the whole run. `03-runtime-view.md`
carries the announcement without a downgrade row; the sandbox proof's scenario 4 keeps the mode.

**A mid-session mode change reaches the agents built after it (REQ-TOOLS-073's second half).** The
recorded defect — a switch to `autonomous` leaving every delegated child asking — was the missing
half: `Sessions` now holds a per-run override, the run records the requested name into it, and the
tool port selects at construction through `selectRequestedMode` (pin, then override, then
`runtime.permission_mode`, REQ-TOOLS-048), with the persona pin carried out of the configuration at
last. A change that would loosen a pinned agent does not reach it and names the persona
(REQ-TOOLS-074). `03-runtime-view.md` §5's control row states both halves.

**The relay sheds dead sinks (REQ-MONITOR-226 intent).** `relaySequenced` and `broadcast` isolate per sink:
a `send` that throws (disposed render frame) detaches the sink and delivery continues to the survivors.
`render-process-gone` detaches at once; the channel-3 limiter sheds the same way; `ProcessLink` isolates
per event listener. Recorded in `04-seams.md` §2.

**The member card opens by its row identity (REQ-CHAT-059/061/166).** A group member's card is keyed by
`memberKey` (`Row.tsx`) — the member's own `rowKey`, the identity step 4 holds the caps against — instead
of `callKey ?? index`, which stranded from `rowKey` on every member without a call key. No view file moves:
the projection (`project.ts`) reads one spelling from the one set, both surfaces toggle the same spelling
through one definition, and `RowProof`'s seeded-open variant (`activityProofDisplaysMemberOpen`) is the
projection half of the same gesture, so the change is recorded here and not in a view.

**The composer's compact strip (PD-CHAT-001 revision 3).** The strip shortens its controls to
their icon behind its own `data-compact` state — `tight` below 900 px, `narrow` below 700 px of the
dock's own width, read by a `ResizeObserver` on the dock (`stripDensity` in `WorkspaceView`).
`tight` shortens reasoning, run-start mode, permission mode and the estimate; `narrow`
additionally shortens persona and model; attach, stash, steer, pause and the send pill never
shorten. A shortened value stays mounted for the probes while CSS hides it; the compact tooltip
names control and choice. The token estimate is drawn once, on the strip. The seams view's §8
carries it; no view diagram moves, because no package, edge, process, message or ownership moves
with it.

**The composer's docked strip (PD-CHAT-001 revision 2).** The field and the strip share one outer
contour (`WorkspaceView`'s `composer__dock`: textarea above, 34 px `composer__strip` below); every
composer control stands on the strip and no second chip row is drawn. The pickers are shared
objects — `SearchableSelect` and `PopoverMenu` take a `strip` prop that switches only their
trigger's shell — and the send is `SendPill` in `design-system/forms.tsx`. The seams view's §8
carries it; no view diagram moves, because no package, edge, process, message or ownership moves
with it.

**The Start session dialog fits the minimum window (REQ-SHELL-022/125).** The panel caps at the
viewport with the three sections scrolling under a fixed head and foot; run-start mode stands first.
No view file moves — the dialog is drawn by the renderer composition root, not by a primary view —
so the change is recorded here and not in a view: `StartSessionDialog.tsx` (`START_SESSION_LAYOUT`
containment + hit-test contracts), `shell.css` (the cap, the scroll region, the fixed actions row),
`layout-regression.test.ts` (the pinned rules).

**The `plan_cycles` cascade (store v20, REQ-SESSION-166).** `03-runtime-view.md` §7 carries v20: the
plan-cycles table rebuilt with `REFERENCES sessions(session_id) ON DELETE CASCADE`, so a session
delete takes the VERBATIM plan text with the record; already-orphaned rows are dropped by the
migration. Fifteen dependent tables, not thirteen.

**The retrospective pass (Part AT — `PD-LIBRARY-002`, ADR-0065).** A second analysis pass over the workspace's own
record, reached by a gesture rather than by a run ending, and reusing the post-run lifecycle whole. `02-process-view.md`
gains the message (`retrospective.capture` to the run host, answered with the existing `improvement.job` event or
`retrospective.no-model`) and the run-free branch of `improvement.analyze`, which takes its backend and credential from
the configured workspace instead of a run context. `03-runtime-view.md` §7 carries store **v19** — `source_kind` on the
artifact and a `source_session_id` relaxed to nullable, by a table rebuild inside the migration's transaction — and the
three configuration keys the directive fixes (`retrospective_model`, its thinking companion, `retrospective_timeout`).
`05-state-ownership.md` gains who owns which pass is running, and who may write the activity a surface draws. What did
NOT move is the point: the FIFO, the cancel, the shutdown discard, the save, the review surfaces, the executor, the
checkpoints and the rollback are the same objects, because a retrospective proposal is an ordinary proposal. The two
activity indicators (REQ-LIBRARY-125/126) were specified in Part AF and drawn by nothing until this part built them,
once, for both passes.

**The plan gate takes the reading area (PD-ORCH-002 revision 2).** `03-runtime-view.md` gains the two states
the gate is drawn in and who owns the choice between them: expanded it takes the free space and no transcript
is drawn beneath it, collapsed it is a bar above a transcript reading under REQ-CHAT-010's floor, and the three
answers stand in both. `WorkspaceView` holds the state because the grid is what changes with it.

**The run host stopped starting itself at import.** `apps/desktop/src/run-host/index.ts` held thirty-six
module-scope bindings, which meant that IMPORTING the run host started one: the MCP host, the confinement
service, the terminal manager and the code-intelligence launch all came up as a side effect of the module being
loaded, so nothing in this process could be reached from a test at all. They are `createRunHost()` in `host.ts`
now — the same bindings in the same load-bearing order, built when the function is called. The five hundred
lines that answered requests are `dispatch(req, host)` in `dispatch.ts`, taking what they need as an argument
rather than closing over module scope; two bindings that change after the host is built (the terminal manager,
which arrives asynchronously, and the live state, which a command writes) are reached through the host every
time rather than copied out of it once. The scripted model client — two hundred and fifty-seven lines of
verification-only stand-in that every proof runs against, read past by everyone editing the dispatch — is
`scripted-client.ts`. `index.ts` is 53 lines: build it, listen, announce ready. **No product behaviour moves**:
the dispatch answers the same kinds with the same bodies, and `pnpm part-h-proof` and `pnpm skills-proof` both
drive the rebuilt binary end to end. The seams view's stop 4 and the process view's **run host** row carry it.

**The renderer root became five modules, and its first test.** Five hundred and ninety-four lines came out of
`apps/desktop/src/renderer/main.tsx`, which is now the main window and nothing else. What a window HAS is
`shell.ts` — the bridge, the replica, the two stacks, the terminal registry, the display preferences, the theme
and the session gestures, wired to the numbered channels once per window. What those gestures ARE is
`session-actions.ts`: eleven functions that take the bridge and the replica as **arguments**, which is the whole
difference, because `session-actions.test.ts` now drives all eleven with two plain objects and no window, no
preload and no main process — the first tests renderer code has ever had, and they pin the refusal discipline
that was already wrong once (a refused control carries the ENGINE's words, not the caller's sentence). What the
other windows ARE is `windows.tsx`: six roles over one `mountWindow`, which is the four copies of "ask main for
the payload this window was opened for, and draw its headline instead when main refuses" written once. What a
transcript surface READS is `session-view.ts`, shared with the persona window so "which persona is the entry
role" has one answer (REQ-MONITOR-057/058) rather than two. The theme moved the same way: adopting one is three
moves that must happen together, it was written out four times, and a fourth copy that forgot the third would
have left the document restyled and React drawing the old palette. **No product behaviour moves**: every body
is the body it was. The seams view's §1 gained the rule for choosing which side of the renderer a send belongs
on; the process view's **renderer** row and the module map carry the rest.

**Every renderer command became a module, and the seam that names them a table.** One thousand and fifty-six
lines came out of `main()`'s `runCommand` and into `apps/desktop/src/main/commands/` — sixteen facets, one per
family, beside `context.ts`. What the switch could only do by being read, the table now does by compiling:
`CommandHandlers` is **total** over `CommandRequest['kind']`, so a kind the contract declares and no facet
answers fails the build where it used to answer `command.unimplemented` at run time. Building it found one such
kind already there (`shell.switchView`), which is now a named line rather than an absence. `CommandContext` is
the other half: the closure `runCommand` was written inside, given a name, so a facet can declare the slice it
uses and a test can satisfy that slice — `commands/mcp.test.ts` drives real handlers in six milliseconds with a
plain object where the run host is, which was not possible at all before. The checkpoint family's seven gates
moved with their commands; main keeps only the holder the quit path waits on (REQ-GIT-101). **No product
behaviour moves**: every handler body is the case body it was, `runCommand` still answers for the window that
raised the command (REQ-SHELL-020) and still lets nothing throw (ADR-0019). The seams view's §1 carries the new
stop 2 and the rule for choosing a facet; the process view's **main** row and the module map carry the rest.

**The capture script became a module.** Six hundred and forty-six lines came out of `main()` and into
`apps/desktop/src/main/capture/` — the step grammar and the host main gives it (`host.ts`, and the grammar
now has a test), the part a shipped build still answers (`probe.ts`), the scriptable half (`seams.ts`) and
the theme proof's pass (`theme-proof.ts`). The last two are reached only by a dynamic import inside
`if (__ROTARIS_SEAMS__)`, so a packaged build does not merely branch past them: the chunk is unreferenced
and never emitted. **No product behaviour moves** — the seams fire at the same times, on the same
variables, through the same `runCommand`. What moved with it is the check that guards the gate: it now
reads every emitted file of the main section rather than `index.js` alone, since a chunk is exactly the
shape that surface could come back in. The process view's **main** row carries both. Measured the same day:
the package-mode build carries none of the eleven forbidden names anywhere in `out/main/`, the dev build
carries them in one chunk and the widened check refuses it, and the built app captured a window driven
through `_VIEWS`, `_EVAL_AT` and `_PROBE`.

**The navigation pass** (2026-09-16). Three views became six, and nothing about the system changed with it: `04-seams.md`
(the ordered edit path for the eight additions this product makes most often), `05-state-ownership.md`
(six homes, one writer each, consolidating facts that were already written down in three places) and
`06-sequences.md` (launch, the approval round trip, and the board's release → run → review → accept — the
three flows that cross every process and had no home). Each existing view gained a section router, and the
reconciliation chain moved to [`reconciliation-log.md`](reconciliation-log.md) so that "consult before
modifying" costs a page. **No package, edge, process, message kind, channel, command, window role, store
table, run-loop step or control operation moves**, because no code changed: this commit is documentation
only, and the three views that existed before it say exactly what they said.

The code reconciled the same day is in the log with everything before it: the cost a metered provider
reports (`PD-MONITOR-001`), no loop supervision while the plan gate holds a run (`PD-ORCH-001`), one activity
line per working agent (`PD-CHAT-004` revision 2 and `PD-CHAT-005`), the timed-out child asked to land, the
MCP child's stderr and the catalogue readers' duplicate read. This pass moved those entries; it did not
change what any of them says.

---

Last reconciled with the code: **2026-09-16** — **a cost the provider reported** (`PD-MONITOR-001`,
minted and first executed this day): a completed provider request can carry the cost that provider computed
for it, asked for in the endpoint's own body field and read back through the SDK's metadata seam, because the
SDK's usage mapping drops every field but the token counts. The run's total is exact decimal addition on
`bigint` — the only money arithmetic in the product, and addition only, which is why it does not wait on
OQ-21 — and the label carries REQ-MONITOR-166's fourth qualifier. Only the **runtime view** is affected — a
new paragraph in the turn section says where the figure enters, what adds it and what the label says. No
package, edge, message kind or store table moved; `sessions.cost` was already a decimal string.

Previously reconciled, the same day: **no loop supervision while the plan gate holds**
(`PD-ORCH-001`, minted this day): a held run has its write and execute tools withheld, so it greps and reads,
which is REQ-ORCH-101's repetition trigger read literally — and the corrective goes in as an unmarked user
message, so the run reconciles an instruction no user gave while it waits for the user's decision. `Run` now
attaches no supervisor for the turn the hold covers, and attaches one again on the first turn after the gate
resolves. Only the **runtime view** is affected — the plan-gate paragraph and the turn's step order say where
the supervisor is and is not. No package, edge, message kind or store table moved.

Previously reconciled, the same day: **the MCP child's stderr, measured after its repair**:
a child server's stderr does reach the log at `debug` and never at `info` (141 lines against 0 in one
driven launch), and `debug` is a label rather than a filter, because the application log reads no level
at all — raised as OQ-63. Only the **process view** is affected — the MCP-child paragraph says what the
level does and does not do. No code moved for it; no package, edge, message kind or store table moved.

Previously reconciled, the same day: **what the model is told about a tool, and who is
speaking to it**: the advertised parameter schema is now the INPUT form, so a field with a default is
advertised optional as the parser treats it, and `todo`'s five operations reach the model as an enum;
`todo`'s refusals name the operation that takes a batch instead of six words that name nothing; and the
plan gate's resume section names the product as its speaker rather than narrating the user inside a
`role: 'user'` payload. Only the **runtime view** is affected — the executors paragraph says what
`toolSpec` hands over, and the plan-gate paragraph says whose voice the two sections are in. No package,
edge, message kind or store table moved.

Previously reconciled, the same day: **a timed-out child is asked to land** (REQ-ORCH-088's
graceful-pause arm, first executed): the ceiling no longer aborts the child mid-tool-call, it raises the same
flag REQ-MONITOR-123's pause raises, so the turn stops before its next model step and the step in flight keeps
its words; a hard-abort backstop 30 s behind it (`run/grace.ts`, ADR-0014 rule 1's one allowance) still bounds
REQ-CONFIG-113's ceiling for the child that cannot land. The timeout report carries the last assistant message
that SPOKE, rather than the last one, which is usually the one that opened a tool call. Only the **runtime
view** is affected — the resilience paragraph says what expiry now does. No package, edge, message kind or
store table moved.

Previously reconciled, the same day: **one activity line per working agent** (`PD-CHAT-004`
revision 2 and `PD-CHAT-005`, first executed): a run is bounded by its agent alone, so concurrent agents
interleave two lines instead of chopping each other's into fragments; the collapsed line carries one segment
per tool family with that family's totals; the role line takes the persona's colour and a delegated agent's
rows indent one step per level. Only the **component view** is affected — the `ui/transcript` note says what
`project.ts` now decides and where the depth comes from. No package, edge, message kind or store table moved.

Previously reconciled, the same day: **the catalogue readers' duplicate read** (defect AO-3):
a `prompts.roots.read` or a `skills.read` still in flight is the window's answer, so a second caller joins it
instead of starting another; a launch had put two identical reads on the wire in the same millisecond, because
the registrar's effect and the configuration key's both start one before either has an answer to find. Only the
**process view** is affected — the prompt-commands paragraph says when a read is joined. No package, edge,
message kind or store table moved.

Previously reconciled, the same day: **the MCP connection's noise** (ADR-0033's first
execution against a real third-party server): the protocol era a server has already answered with is
remembered for the process, keyed by what is launched, so `ToolDiscovery`, `SessionConnections` and
`HealthProbe` probe it once between them rather than each; and a child's stderr is forwarded at
**debug**, which the run host had been flattening to `info`. Only the **process view** is affected —
the run host's held state gains the era memory, and the MCP-child paragraph says what level a child's
stderr reaches the log at. No package, edge, message kind or store table moved.

Before that, the same day: **the plan gate's three repairs** (REQ-ORCH-153,
REQ-ORCH-082, REQ-TOOLS-032): the held segment's one turn now carries `planRequestSection` on both the task
string and the initial content parts, so the producing role is told a plan is what is wanted; the dispatch
check refuses a name that IS a tool and lets a name that is no tool reach the unknown-tool answer, for which
`createToolPort` hands the gate the set of names it removed at the gate; and a cancel taken at the gate writes
REQ-ORCH-082's first arm in the same durable act that resolves the cycle. Only the **runtime view** is
affected — no package, edge, process, message kind, command or store table moved, and the new module sits
inside `engine`'s existing `run/` directory. Three defect notes, each archived on landing.

Previously reconciled: **2026-09-15** — **`PD-CHAT-004` revision 3 and `PD-CHAT-006`**: the activity
line's colour moves from the whole line to the `N failed` / `N blocked` facts inside the segment that holds them,
and a row still being written draws no animated indicator of its own. One module gains one export
(`segmentFacts` in `ui/src/transcript/project.ts`, the summary becoming its join); no module, edge, process,
channel or file on disk changes, so only the component view has a line to add. Measured in the built product by
`pnpm rows-proof` — one fact red of twelve, the chevron and the run's span not, two reasoning segments not, and
zero animated indicators beside one live message row. **No implementation condition is raised or discharged.**

Previously reconciled: **2026-09-15** — **the complete reviewed-improvement lifecycle**: the Library and
Overview read one proposal store; review, edit, delete, export and Undo flow through main to the workspace service;
approved proposals become an `improvement_run` todo; verifier blocks use the shared configuration writer; dedicated Git
checkpoints provide previewed, confirmed rollback with a pre-rollback safety point. The process view carries the new
renderer commands, run-host `initialTodo`, workspace-service actions, revision bumps and outcome notices. Schema v18
continues to carry the immutable session run type, durable session-to-artifact association, current records, immutable
versions and both gap counters.

Previously reconciled: **2026-09-15** — **project initialization** (ADR-0064, first executed): the
task registry, the persisted marker and the five set derivations in `config/src/init/`, the coordinator in
**main** because the marker's one writer is the workspace service and the one shipped task's work is the run
host's and neither may import the other, `initialization.*`'s five commands and the run host's new
`mcp.setupStatus` push, channel **12** carrying REQ-WORKSPACE-105's nine values to every window, and the
`initialization:`/`project_init:` pair read **outside the layered merge** because REQ-WORKSPACE-078 names one
file. The component view carries the module and the placement reason, the process view the commands and the
channel, the runtime view the pair's place among the configuration tiers and why the execution re-reads before
each recording. **No implementation condition is raised or discharged**: every behaviour is demonstrable on
`win32` and was demonstrated there (`pnpm init-proof`, five scenarios).

Previously reconciled: **2026-09-15** — **the activity line** (`PD-CHAT-004`, first executed): one
agent's uninterrupted run of tool and streamed-reasoning rows is a single displayed row that **changes rather
than grows**, so a working agent appends nothing and two working agents cannot contend for the tail. The change
is confined to the `ui` package's transcript module and adds **no edge and no message**: `project.ts` decides
the run boundary from the agent and `display/showReasoning`, `types.ts` gains `ActivitySegment`, and `Row.tsx`
draws the segments and the one continuous persona rule the revealed members hang from. Only the **component
view** is affected; the process and runtime views are unchanged, because no process, file or message moved. The
same change repairs a defect note (removed once repaired): a folded run's role is now its agent.

Also **2026-09-15** — **the search pattern dialect**: `grep` and `read_file`'s
`grep` filter compile through one helper that reads leading `(?flags)` groups, so a pattern the pinned
accelerator accepts is not refused in process (a defect note, removed once repaired,
[R-018](../../product/requests.md#r-018)). The runtime view carries it beside the executor list; no package
edge, message or process changed.

Previously reconciled: **2026-09-15** — **OS-level confinement** (ADR-0022, first executed): the
`confinement/` module inside `agent-tools` (the shared specification, the two thin renderers, the single-purpose
quoting, the availability probe), the probe settled in the **run host** before a launch does anything else and
the gate that refuses such a run before the lease, the session row or the lock exist, `confinement.status` as the
one message the settings label and the launch dialog both read, and the store row's stale "recorded, not
honoured" note corrected. The component view carries the module, the process view the message and where the
verdict lives, the runtime view the gate's place in the start sequence. **IC-8 is open**: the renderers are
written and unit-tested, and `REQ-SANDBOX-127`'s six observable effects have been demonstrated on neither
supported platform.

Before that: **2026-09-15** — **portable skill discovery** (ADR-0063): the pure discovery
library in `config/src/skills/` (the run host may not import `workspace`, and injection happens at agent
construction), the catalog the run host owns because REQ-WORKSPACE-058 clears it at session creation rather
than per run, skills as ordered context units composed at every agent construction, the cataloged directories
as additional read roots, the four `skills.*` commands renderer→main→run-host, and one native chooser. The
component view carries the package and the responsibility row, the process view the run-host ownership and the
message family, the runtime view the system prompt's composition and the `skills:` block's place among the
tiers. **No package, no allowed edge, no process, no channel, no store table and no control operation moves.**

Earlier — **2026-09-14** — **the continuation lease**: `session.continue`, `session.prompt`
and `session.planDecision` re-ask main for the credential lease before the continuation run resolves its setup
(REQ-PROVIDER-066), so a resumed session's first model call no longer goes out without a bearer after an
application restart; the runtime view carries the mechanism. Earlier the same day: **the post-run improvement
analyst** — the run host captures a fixed, bounded terminal-state snapshot and executes a no-tools analyst; main
owns one application-wide FIFO, cancellation and the activity publication; the workspace service remains the
single improvement writer. Schema v18 carries the immutable session run type, durable session-to-artifact
association, current records, immutable versions and both gap counters. The component, process and runtime views
carry the package responsibilities, messages, channel and tables.

Earlier the same day — **`PD-LIBRARY-001`'s closeout (the hundredth defect)**: the engine
artifact port's private section list is replaced by contracts' `ARTIFACT_SECTIONS` (an internal definition, not a
new edge — the port already imported `@rotaris/contracts`), and `pnpm artifacts-proof` gains its sixth launch with
a verification-only `terminal:<key>` scripted-dialect step. The closeout follow-up makes the model-facing filtered
read byte-exact, records the observed value, opens the report in the inspector, and reconciles REQ-TOOLS-148 with
the directive. **No package, edge, process, message kind, store table, run-loop step or control operation moves**;
the `artifacts` table's `commands` column (v16) is already recorded in the runtime view and the diagrams are unchanged.

Previous reconciliation: **2026-09-13** — **the workspace chrome density pass**: the Inspector's persona
tab strip is replaced by a `PopoverMenu` picker (the design-system's `overlays.tsx` unchanged, one more consumer;
`REQ-MONITOR-050`'s grouping kept, no spec figure touched), the composer's input is capped at 120 px and its
actions band is one row at ≥1180 px (UIR-009's two-row composition kept below the breakpoint), the run header /
toolbar / intent bands tighten to the mockup's rhythm, and the agents panel header becomes the mockup's 40 px bar
with a live agent count. All spacing craft under the adopted design language — no requirement narrowed.

Earlier the same day — **the composer declutter (R-010, PD-CHAT-001)**: the component
view's `ui/design-system` section gains `overlays.tsx` (`PopoverMenu`, the press-revealed value chip), taking the
brief count to twenty-nine; the Workspace view's reasoning-effort, run-start-mode and permission-mode chips present
through it, the persona and model selects gain leading icons, and the explanatory hints of the composer's
attachment, stop and queue controls moved into tooltip-plus-accessible-description pairs. **No package, edge,
process or window role moves, and `CONTROL_OPS` is untouched.**

Earlier the same day — **run-local launch permissions (R-009, REQ-TRACE-470/471)**:
the process and runtime views record the per-launch board grant, configuration capture before credentials,
session-owned run ports, and runtime launch-audit evidence.

Earlier the same day — **the plan gate (REQ-ORCH-152 to REQ-ORCH-154, ADR-0062)**: the
runtime view's run-start order gains the hold, a new paragraph covers the plan cycle and the park, its
session-command paragraph gains the two answers and the one-way release, and its store section moves to **v17** with
`plan_cycles` beside two new `sessions` columns; the process view's renderer → main family gains `session.planEdit`
and `session.planDecision`, stated as session commands and **not** control operations. **No package, edge, process
or window role moves, and `CONTROL_OPS` is untouched.**

Earlier the same day — **the session-lifecycle work package (A3, A6, A9, OQ-8, OQ-12,
OQ-41, OQ-42, OQ-46)**: the runtime view's teardown paragraph is corrected — it still put **the lock release inside
the terminal transaction**, which A3 moved to the end of guaranteed cleanup, and the code had not done that since A3
was applied; it also now records that main does not present `run.result` as a notice when that result carries
`persistence: {confirmed: false}`, the run host having already published the one failure notice REQ-EVENTS-088
allows. The process view's `run.result` gains that optional field. The repair's timeline entry is
`session.interrupted_recovered` throughout, REQ-SESSION-062's fixed shape, where three views and two ADRs carried the
invented `session_marked_interrupted`. **No package, edge, process, window role, store table or control operation
moves**; one message kind gains an optional field and one run-loop step changes cadence (`usage.update`, now one per
completed provider request rather than one per iteration — OQ-8). Earlier the same day — **UIR-014 repaired and its whole class made deterministic**: the
component view's `layout-contract.ts` paragraph gains `shrunkBoxes`, the one question asked of every marked box
rather than only of the boxes that published a relation — a box standing smaller than the content inside it, on an
axis that does not scroll, where nothing is clipped and the remainder pays out under whatever paints next. The
repair itself is one declaration (`.page-header { flex: 0 0 auto }`), and **no package, edge, process, message kind,
channel, command, window role, store table, run-loop step or control operation moves**. Earlier the same day —
**all twelve critic findings, repaired** (R-008): the component
view's design-system section gains `Checkbox` (the twenty-eighth brief, closing **OQ-57** — the adopted material
defines none, and the owner ruled that the product draws one), and the count moves to twenty-eight briefs and thirty
exports. Six named sizes join the theme data — two control heights read off the adopted `.btn` and `.btn-compact`, a
prose measure read off `.empty-state-hint`, and a label column, a field minimum and a tick width the material does not
state — so nothing in the repairs resolves to a dangling token. **No package, edge, process, message kind, channel,
command, window role, store table, run-loop step or control operation moves**, so the process and runtime views are
unchanged: what changed is what a surface measures, not what crosses a boundary. Before that, **2026-09-12** — **the
adopted design language, drawn once**: the component view gains
`ui/design-system` and a responsibilities row for it — the twenty-seven component briefs as one typed layer, the
verification-only `UiLayoutContract`, and the guard (`tools/check-ui-language.mjs`) that makes it the only place in
`packages/ui/src` or `apps/desktop/src/renderer` where a design-equivalent control is written. **Edges are unchanged**
(`ui → kernel, contracts, ui-core`; the layer imports only `react`), and no process, message kind, channel, command,
window role, store table, run-loop step or control operation moves with it, so the process and runtime views are
unchanged: sixty-nine drawing files changed what they *call*, not what crosses a boundary. `pnpm ui-review` and the
theme matrix drive the existing driver seam the process view's main row already carries, and add no seam of their own.
Earlier the same day, **PD-LIBRARY-001, the commands a child ran**: the store moves to
**v16**, one column (`artifacts.commands`), which is the whole of the change these views can see — no package, no
allowed edge, no process, no message kind, no channel, no command and no run-loop step moves, and the column is
noted on the `artifacts` row of the runtime view beside the v12 that created the table. Earlier the same day,
**deepening main-window lifecycle**: the inline main-window
lifecycle, registry, startup resolution, chooser gates, add/replace flows, hand-over routing, and per-window deferred offers
are now encapsulated in `MainWindows` (`apps/desktop/src/main/main-windows.ts`) with Electron and in-memory adapter seams;
window records and listener registrations are guaranteed prior to renderer loading, and failure to load unregisters and
destroys cleanly; earlier the same day, **opening a project from inside the application**: every main
window is built by one builder and lives in a registry keyed by `webContents` id, which is what makes a
second main window possible and makes a command answerable for the window that sent it; the renderer gains one
command, `workspace.choose`, carrying no folder so that main owns the gates and the chooser; and main gains the
`workspace/lastOpened` preference key that no renderer may name. Both are in the process view — the main row and
the renderer → main command list. Later the same day, the two product directives: that command gains a `newWindow`
flag (an added main window, no gate evaluated, nothing closed) and **channel 8's payload gains an optional
action** — the transient acknowledgement may carry exactly one, a closed one-member type that leaves
REQ-NOTIFY-044's banner vocabulary and REQ-SHELL-115's closed list untouched; the process view's command list
carries both. No process, channel, message kind, store table, run-loop step, control
operation or package edge was added or moved, so the component and runtime views are unchanged, and the window
role set is unchanged with them: a second main window is another window of the `main` role rather than a new
role. Before that **2026-09-11** — three times that day. Third, the **driver seam**: main gains a
loopback control socket under `ROTARIS_DRIVER` (verification only — `main/driver.ts`, `pnpm app:drive`,
`pnpm driver-proof`), carried in the process view's main row beside the capture seams — which the same day stopped being shipped at
all: the seams are now compiled in behind `__ROTARIS_SEAMS__` and a packaged build carries none of the
scriptable ones, the main row saying which three survive and why; no process, message kind,
channel, command, window role, store table or control operation was added or moved with it, so the component and
runtime views are unchanged. Second, the **OQ-38 ruling**: the run host's flush is armed by input the USER has directed at a stream whose control they have taken, never by output and never by an agent's own `is_input` call (`REQ-CONFIG-117`), and the process view's run-host row carries the narrowed condition; no message kind, channel, command, role, table or control operation moved with it. First, wave 3, Parts R″/T″/C″: channel 3's delivery bound is **one budget across every window taken together**, not one per window — defect T2-1, and the process view's live-terminal and main-to-renderer paragraphs carry it; no message kind, channel, command, window role, store table or control operation was added or moved by any of the three lanes); before that **2026-09-10** (wave 2, Parts AJ′/AK′/AP/AL′/AO: the requirements board and its five panes, the board's run half of the `requirements.*` family that only the system may speak, the terminal window's five commands and its role, `prompts.roots.read` and `notice.report`, and the renderer's board preference keys with the per-workspace fold key main resolves); before that **2026-09-09** (wave 1, Parts AJ–AN: store v15's `delivery*` tables — the runtime view's §7 row for them was written at the merge-1 proof pass, after this line had already claimed it — and channel 10 `requirements:changed`; the `requirements.*`, `traceability.*` and `terminal.*` message families; channel 3's first producer and its per-window delivery bound; the workspace service's worker thread; `ui/terminal`, `ui/slash`, `workspace/traceability`, `workspace/delivery`); before that **2026-09-08** (Part AH — context compression: the threshold's place in the turn's step
order, the ladder's `context_window` arm, the `Conversation`, the reconstruction and the `context_compressed` timeline
entry, `AgentRecord.compressions` and `contextLimit` now carrying the model's own maximum, and
`SessionRecord.compression`, all in the runtime view. No package, edge, channel, command or store version changed, so
the component and process views are unchanged. Earlier the same day, Part AG — the undrawn Settings categories: `shell.openThirdPartyLicenses`
and `shell.hello`'s three new local facts in the process view; the `display:` section's surface, its file spellings and
the Instructions presence check riding the configuration snapshot in the runtime view's tier section. No package, edge,
channel or store version changed, so the component view is unchanged. Before that, 2026-09-07, Parts AB and AC — the composer and the structured questions:
`composer.readDraft`/`writeDraft` and the three `display/*` keys plus `panels/workspace` in the process view's
command list, and the control channel's value space with the reason `answerQuestion` carries two flat maps rather
than widening it; the two new control operations, the `ask_questions` executor and its registry, and store **v13**'s
`queued_prompts.context_snapshot` in the runtime view. Before them, Parts Z and AA — the transcript: `ui/transcript` with the recycled
slot pool, the projection and the two bounded caches, `transcript/Row.tsx` as the one row renderer and
`TranscriptSurface.tsx` around it, `config/display-section.ts` and `model/reasoning.ts`, in the component view;
`shell.openExternal`, the three `display/*` preference keys and `session.pageOlder` now actually called, in the
process view; the `thinking` row, `upsertMessageRow`'s stable segment key, the stall detector, the `display:`
configuration section and a new §9 for what a surface does with a publication, in the runtime view. Earlier the same
day, Parts X and Y — the Library view: `ui/library` and `ui/markdown` in the
component view; the three `prompts.*` requests, the three `artifacts.*` requests and the ninth channel `library:changed`
in the process view; store **v11**'s two workspace-scoped prompt tables and **v12**'s `artifacts` row with its declared
index, and the artifact body files beside the session's other files, in the runtime view. Before that, **2026-09-06** — the repair of Part U's thirty-second defect — store **v10**'s
`timeline.id` and `timeline.severity` in the runtime view's table, and `timeline.append` named in the process view's
main → run host request list with the `severity` it now carries; then Parts V and W — the notice store's serialised chain with its record,
channel 8 and the per-window acknowledgement stack, `timeline.append` to the run host, `window.modality` and the family
modality in main's registry, `ui/commands`; and before them Parts T and U — the sentinel branch as a process shape under the run host, the
`mcp.setup` request, the `session.*` commands and requests, the fourth checkpoint ask and the save-dialog seam, process view; the
resources tree, the generator scripts, the sentinel and the generated module, component view; the enabled entry per run, the
binding, the probe, the setup steps, the repair unit's order, the delete's four steps and the export's read, runtime view. Before
that, 2026-09-05, Parts R and S — the persona window as a renderer instance, the window registry in
main, the `window.*` and `mcp.*` commands, the run host's `mcp.*` requests and its MCP child processes, process view; the record's
eight new fields and two MCP fields, the owner's coalesced publication, the session connections' lifetime, runtime view; `mcp`
no longer a placeholder, `kernel` gaining the code-point order, no edge changed, component view. Before that Parts P and Q — the checkpoint asks, requests and commands, process view; the
iteration-close capture, store v9, the ladder at the model step, the wait state and the two timeline memories, runtime
view; no package or edge changed, component view unchanged. Before that Parts N and O — the `fetch` executor and its per-call policy read, the entry
port at depth 0, runtime view; `git.view`/`worktree.*` between main and the workspace service, the `git.read`,
`worktree.*`, `session.newId` commands and `session.start`'s isolation fields, process view; store v8 and the isolated
session's effective root, runtime view; no package or edge changed, component view unchanged. Before that Part M —
`repository.read`/`repository.state` and `token_samples`).
