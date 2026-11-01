# The codebase — how the architecture is laid out in code — What the walking skeleton does, and nothing more (continued)

Part 9 of 22 of [the codebase record](../codebase.md), which indexes every part.

**What `pnpm resilience-proof` does.** It builds Electron and launches the app nine times with scripted fault steps: a 429
with `retry-after: 2` (the countdown, the auto-resume); a 429 with no header (the 60 s local wait, cancelled from the
header with REQ-NOTIFY-063's notice); a quota with a same-tier candidate (the transparent fallback); a quota with none
(the indefinite wait, `setModel` from the header, the override honoured after a relaunch); an unresponsive model with
and without a role fallback; a hung child under a small `child_timeout` with and without a fallback; a 503 (one
transient retry) and a 401 (no retry). Evidence under `.proof/resilience-proof/`. **Since 2026-09-28 (R-062)** the override
launch is driven (the header's `SearchableSelect` chosen by real clicks, `override.steps.json`), every launch is
bounded — the ten seam-driven ones by `spawnBounded`, the driven one by the driver's `stopApp`, both ending an overrun
through `lib/bounded-launch.mjs` by SIGTERM, a grace, then SIGKILL and reporting it with its log tail — and every
scenario runs to its end with its failure listed in `results.json`
([note](../../defects/fixed/resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md)).
`spawnSync`'s own timeout could not bound a launch: it closes the pipes as it signals, and the application's quit then
loops on its own EPIPE ([note](../../defects/fixed/a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md); repaired
2026-09-29 under R-067 — the application log's writer, `standardStreamWriter`, absorbs a failed write and stops).
Since 2026-10-01 every scenario's workspace carries the answered project-setup section (`lib/initialization-marker.mjs`)
and every launch fails if the setup started in the background anyway, so a bundle-less checkout's "Project setup did not
finish" no longer stands in the one notice slot `cancel` and `fatal` read; `fatal` asserts the 401's own notice (its
failure text as detail) rather than only "not a provider limit"
([note](../../defects/fixed/resilience-proofs-cancel-scenario-reads-a-failed-project-setup-in-place-of-the-limit-notice.md)).
Since 2026-10-02 a `switch-back` scenario follows the same-tier move with a switch of the entry model back to the
configured key from the run header, and a follow-up queued beside it: iteration 2 runs on the configured model, as the
switch's REQ-MONITOR-142 row says (OQ-177;
[note](../../defects/fixed/an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md)); since
2026-10-06 (plan fin21) `keep-waiting` drives PD-MONITOR-004 revision 2's retry of an out-of-quota pair from the wait header (pressed
twice in one frame since that plan's repair round 1: one retry, no switch of the entry model) and
`switch-over-override` PD-ORCH-013's take-back of an earlier wait's override by a header switch, the switch rows reading
PD-MONITOR-006's "for the rest of this run"; `same-tier` and `two-waits` read PD-MONITOR-007's helper calls (the
classifier and the analyst following the override, and making no call on a pair held out of quota); and
`--only=<name>[,<name>…]` runs the named scenarios alone. **Since 2026-10-02 the authentication class (the 401 note's four
parts) is the proof's.** A failed run is classified in REQ-NOTIFY-060's order by main (`main/failure-class.ts`) and published
through the focus gate (`main/run-failure-notice.ts`, which also holds a failed run's class publication until its session
is followed by a main window, REQ-NOTIFY-030/032, and since 2026-10-02 raises REQ-NOTIFY-031's notice naming the session for
a non-failure ending no main window follows — `notice-proof`'s `background-ending` drives it — and, since fin10, holds
REQ-NOTIFY-063's quota notice for the focus of such a session whose run ended on a provider limit, which
`notice-proof`'s `background-quota` drives; since finacc2's A1 of 2026-10-06 a session counts as on screen in the window
that is starting it, before its subscription — `MainWindows.showingSession` — and REQ-NOTIFY-070's restart clears the
session's notice as a run start does, REQ-NOTIFY-058; `auth-fallback`, `auth-fallback-dialog` and `generic` assert both
[note](../../defects/fixed/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md));
an authentication failure asks the automatic fallback first
(`main/auth-fallback.ts`, parts A and B) and opens the recovery dialog (`main/auth-recovery.ts`,
`packages/ui/src/AuthRecoveryDialog.tsx`, parts C and D) only where that answers it is the dialog's — a second failure, or
a first with no usable fallback (REQ-NOTIFY-072). **`fatal` is driven** (`drivenLaunch`, its steps in `fatal.steps.json`):
a 401 with no usable fallback — the automatic fallback finding none — opens the dialog, read in its own window (560 px, its
title, the error in the failure colour, the other providers' models), Cancelled with the run left failed and the class's
notice on screen, reopened by a second failure, answered with beta (refused too, `fail:401:only=scripted+scripted-b`, which
reopens it naming beta, with neither beta nor alpha offered — REQ-NOTIFY-068, both failed with the credentials their
providers still hold) and then gpt-4o, on which the run completes; the pins are read from the timeline
(`Sessions.authRecoveryFacts` / `restartAfterAuthFailure`). A `reauth` scenario (part D, REQ-NOTIFY-076/077) signs an
OpenAI-compatible instance in with a stale key against a loopback catalog stand-in, fails the run on it
(`fail:401:unless-key=fresh-key`), types the new key into the dialog's masked field, and reads the key validated against
the catalog, saved, and carried by the restarted run on the same model to completion, no pin written and the key in no log
line. A `generic` scenario (scripted `fail`, an HTTP 400) reads REQ-NOTIFY-064's notice — the run failed, the session and
the draft were kept, the failure text as detail, persistent, scoped to the session — and follows its **Back to the
workspace** action from Overview; every run-ending notice's words are `main/run-failure-notice.ts`'s. The `auth-fallback`
scenario (`fallback_model: beta`, the scripted step `fail:401:only=<alpha's provider>`) asserts the pin of the fallback keyed
by the failed pair, the acknowledgement naming both models and the restart with the same prompt completing on
`scripted-b/beta` (REQ-NOTIFY-070, REQ-MONITOR-147, REQ-SESSION-026), no recovery dialog opening — in plan mode too, where
the 401 falls on the plan cycle's turn and the restarted cycle parks at the gate on the fallback (`auth-fallback-plan`) — and
the non-modal re-authentication prompt beside the continuing run with the composer, every title-bar control and every
notice button usable beside it and no control under it, at the opening size and at 1000x680 with an API-key provider's key
field (REQ-NOTIFY-071, ADR-0048), and beside an expanded plan gate at 1000x680 drawn as its bar with the gate's three
answers reachable and the plan the largest part of the gate (REQ-ORCH-153, PD-ORCH-002), drawn in flow as the Workspace
view's own `reauth` row for the followed session alone (REQ-NOTIFY-030, OQ-181). `auth-fallback-dialog` (driven,
`fail:401:only=scripted+scripted-b`) follows the fallback refused too: the second failure opens the dialog naming beta,
the prompt is closed as it opens (REQ-NOTIFY-079), neither alpha — the automatic fallback's primary — nor beta is offered
(REQ-NOTIFY-068), and the run completes on gpt-4o. `auth-fallback-revise` (driven, plan mode) fails a **revise** cycle's
turn on a first 401 and reads the restart relaunch the same revise on beta — cycle 2 with the changes stated, no prompt
re-submitted, the gate reading "You asked for: …" (REQ-ORCH-154, the fourth repair round's `relaunchAfterAuthFailure`).
**What the 401 recovery does not do:** a device-code or browser provider is told its method is not provided by this build,
the sign-in flows being owed (REQ-NOTIFY-076's second branch,
[note](../../defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md)).

**A probe is a deadline, not an appointment (2026-09-12).** Three of this proof's assertions were mid-run DOM probes
fired at a fixed instant — `.wait-header@1700` — and they failed intermittently on a busy machine with nothing wrong
under them: measured that day, 4/5 green quiet and 1/4 green while three worktrees were building Electron.
`ROTARIS_CAPTURE_PROBE_AT`, `_CLICKS`, `_SELECT` and `_PNG_AT` now accept `@~ms`, which WAITS for the selector to match
and acts as soon as it does, giving up at `ms`; plain `@ms` is untouched, because a proof that samples one selector at
7500, 8500 and 9500 ms is watching a value change and waiting-for-present would collapse the series into three readings
of the first match. **The margin the old form had was 169 ms**: the header lands at ~1531 ms and the appointment was at
1700. That is the whole defect, and it is why the failures moved between three different probes rather than settling on
one. The clicks were worse — the cancel dialog's button was clicked at a fixed 2800 ms whether or not the click at 2200
had opened it. **What could not be shown:** the ambient flake was not reproducible on demand afterwards (the baseline
went 6/6 green under CPU load and under a concurrent Electron proof), so the mechanism was demonstrated directly
instead — an appointment moved to 300 ms reproduces the original error text verbatim, `the wait header was not on
screen 1.7 s into the run`, and the deadline form passes on the same machine in the same minute. An absence still
cannot be waited FOR, so the one probe that reads the header GONE stays an appointment and was moved out to 9 s.

**What `pnpm mission-proof` does.** It builds Electron and launches the app eleven times for nine items: the Mission view
painted with the run row, the tree and the table, elapsed advancing between two probes; two children waiting behind a
model slot cap of one showing their elapsed time in the table and the tree, advancing (since 2026-09-29, OQ-124); the three trees' parity and a
23-agent republish timed against the 250 ms budget; a pause refused with a child selected and honoured with the run
selected; a cancel naming the agent and its cascade; open-agent under both preferences — the inspector pinned, then one
persona window per persona reused, hidden on close, shown again, destroyed on a new session; the inspector following the
latest author, pinning, steering, the chips' order across a state change; the strategy and depth controls written to
`agents.yaml` and read back in Settings; every surface showing a planted running child settled. Figures — the refresh
time, the persona window's first paint — land in `.proof/mission-proof/results.json`.

**What `pnpm continuation-proof` does** (since fin42, 2026-10-13). It builds Electron and launches the app four times over
two scratch stores, the per-agent timeout at 3 s and every child scripted to complete a call and then hold past it, so each
is cut off while making progress (PD-ORCH-004). `later-iteration`: one launch in which a prompt typed while the run goes is
queued as iteration 2, whose root takes up the offer iteration 1's root left (the scripted `continue:` step); the
continuation, cut off too, is offered none. `later-run`: the run that cut the child off; a launch that sets Settings ›
Runtime › Per-agent timeout to 1 minute and saves (`lib/settings-runtime-field.mjs`), the field's description reading the
stored 3 s until Save and 60 s after it (REQ-CONFIG-446/419, since 2026-10-15); a relaunch whose follow-up root reads
the offer in the handoff and takes it up, the continuation succeeding. Each reads the store — the cut-off report, the later
root's first recorded message, `continuation_of`, no offer left open — and the sidebar's timed-out tag as it appears; results
in `.proof/continuation-proof/results.json`; `--only=<scenario>`.

**What `pnpm mcp-proof` does.** It builds Electron and launches the app nine times against hand-written fixture servers
(`scripts/fixtures/mcp-fixture-server.mjs`, four protocol eras, pid files per launch): discovery and the byte-exact prompt
section with the inert grant reported once and the discovery file hashed unchanged; a call end to end with `tool.start`
before the answer and a `request_timeout` exhausted; one process per server for two concurrent children and the next
child; a mid-run narrowing refused; a server crashing after connect, warned once, re-established by the next call; the
drop rules per persona and a session toggle gone after a relaunch; the Settings category probing every row twice with the
`.cmd` stand-in for `browser` healthy through the wrap; two fatal YAML defects reported together and the same defects
dropped from a discovery file; a server that never answers `initialize` bounded at 35 s with the exit 1.5 s after the
quit. Evidence under `.proof/mcp-proof/`. **Launches 6 and 7 are driven (2026-09-28, R-062):** the toggle, the prompt,
both `Check status` presses, the secrets choice and every read wait for their conditions through `lib/driver.mjs`
rather than firing at offsets, each step recorded in `<name>.steps.json`; the offsets had made two REQ-MCP-115 reds on a
loaded Linux host that the product had not earned
([note](../../defects/fixed/mcp-proofs-drop-rules-launch-clicks-at-a-fixed-offset.md)).


**What `pnpm sessions-proof` does.** It builds Electron and launches the app ten times against a scratch store and
repository: a stale session repaired one at a time and all at once (a live lock held by a child process this script
spawns is left alone; "nothing was stale" on a second press); a delete with two checkpoint refs, an isolated session's
refs in the shared repository, a session whose repository moved, a live run refused; the four-record export of a
capped audit and of an empty session, and the trajectory export of one, of two in reverse order, of a resumed and of a
capped history — every file parsed by a SEPARATE node process holding no product code; an unreadable session listed
and deleted; the backup disclosure panel. Evidence under `.proof/sessions-proof/`. The planted locks name this machine through the
identifier where the product mints it on the running platform (`machineIdFileFor`), and a "dead" pid is chosen per platform
(`plantedDeadPid`: one the script saw exit on Linux and macOS, `4242` on Windows, where a freed pid is soon reissued); until 2026-09-28 the Windows spelling made the proof crash at `repair-all` on Linux (R-062;
[the note](../../defects/fixed/sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md)). The delete's
premise — every reference to `sessions` is `session_id` → `session_id` `ON DELETE CASCADE`, and `delivery_runs` alone
carries the column as a fact — is read from the schema by `scripts/lib/session-cascade.mjs`; the count pin of sixteen it
replaced stopped the proof before the delete on every run once v23–v24 made the cascading tables twenty (R-067;
[the note](../../defects/fixed/sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md)). The delete now
also asserts that A's agent record (`iterations`, `agent_messages`, `agent_terminals`, `agent_fingerprints`) was there and
leaves with it (PD-ORCH-005 clause 12); the scripted runs start no background terminal, so A's `agent_terminals` row is
planted, as its `plan_cycles` row is.

**What `pnpm code-intel-proof` does.** Once it has set the runtime's home aside and wiped its previous evidence, and before it
reads the bundle's marker, builds the app or makes any launch, it asks `bundle.mjs --check` and builds the git-ignored bundle when it is
absent or stale for the host, under `--skip-build` too, the build's output streamed as it runs (since 2026-10-20) (since fin47, A4: it used to build only an absent one and ran a
superseded recipe-3 bundle without a word, [note](../../defects/fixed/code-intel-proof-uses-a-stale-code-intelligence-bundle-without-checking-it.md);
`results.json`'s `bundle` now names the recipe, pins hash and target). It then
runs fifteen numbered launches (`--steps` picks among them; launches 2 and 3 share one app launch, launch 5 is five, launch 6
starts no app, and launch 7 runs only against the packaged binary; *corrected 2026-10-20: this read "launches the app seven
times", the count before fin32*): the branch guard on the dev entry and, under `ROTARIS_CODE_INTEL_PACKAGED=1`, on
`win-unpacked` (JSON-RPC and nothing but a tolerated blank line on standard output, no window, the exit status
propagated); discovery of the real runtime through the token with the tier's names in the prompt and the memories
block; the workspace binding on the launch line; a real `get_symbols_overview` call; the three-step project setup —
completed, skipped on the marker, `skipped-no-code`, a launch-less entry refused, a cancel mid-step; the manifest's
drift refused; the packaged binary with outbound traffic blocked, which names the fetch it needs (IC-7); and, since fin32,
a delegated tester's EDIT-tier content replacement read back as an edited path from its stored report and its artifact
(PD-ORCH-004, the a68f121 duress run's D1); and, since fin35, a delegated tester's cross-file replacement across the whole
project read back with both files it changed, observed by the run host around the call (`observeReach`,
`agent-tools/src/tools/observe.ts`; OQ-245); and, since fin42 (N59), a refactorer's symbol rename across two TypeScript
files through the runtime's TypeScript language server after a reference search, both files read back, the same rename with
nothing before it — red until
[the note](../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)
it found was repaired (OQ-273): the pinned runtime renamed the declaring file alone; since fin43 (`PD-MCP-004`) the run host
sends the reference search itself before every rename, writing no row, and the eleventh launch is green with both files renamed
and no search row, `PD-MCP-004`'s acceptance gate, re-run on every pin change; since fin47 a thirteenth launch,
`child-rename-cold-js`, makes the same cold rename in a JavaScript workspace with no `tsconfig.json` or `jsconfig.json`, the live
run's shape, which was red there until [OQ-362](../../archive/architecture/open-questions/65-spikes-and-later-questions-32.md#oq-362) was ruled and built (the note reopened); since
`PD-MCP-004` revision 2 (2026-10-20, loc1) the run host places a `jsconfig.json` of the product's own at the root for such a rename
and removes it when the rename has answered, so launch 13 is green, joined by a fourteenth (`child-rename-opened-js`, a symbol
overview of the declaring file first) and a fifteenth (`child-rename-cold-ts`, two TypeScript files and no `tsconfig.json`), each
asserting the log's one placement and one removal and no project file left at the root, and launch 11 asserts none was written
beside its `tsconfig.json`; launches 11, 13, 14 and 15 are re-run on every pin change — and a cross-file replacement renamed by
the global configuration's `tool_name_map`, read back with both files (REQ-MCP-005). Evidence under
`.proof/code-intel-proof/`. The runtime's home, which it keeps across runs, is the product's own on the running platform
(`join(dataDirFor(local), 'code-intelligence')`, as `main/sentinel.ts` joins it) since 2026-09-29 (R-067; the Windows
spelling kept a directory the product never used off Windows,
[note](../../defects/fixed/slice-proof-and-code-intel-proof-spell-the-windows-data-directory-on-every-platform.md)). Its branch client is `scripts/lib/line-rpc-client.mjs` (2026-09-28, R-062): every pending
request rejects when the child exits, errors or is killed by the guard, with the exit status and standard error's tail,
so a branch that dies fails the launch in seconds instead of hanging it (`line-rpc-client.test.ts`, 12 cases). It launches the token first and the sandbox switch after it, the
product's order, which `lib/launch-sites.test.ts` holds for every token launch; its workspace file records
`code-intelligence-setup` as skipped so ADR-0064's background task does not collide with section 5; off Windows it builds
with `pnpm` and records the no-window check not measured; its setup launches open Settings with the Ctrl+7 chord rather than
the shared category seam, and press the category, Start and Cancel only once the open's notice has drawn and the
control is there (2026-09-28, R-062; repaired again 2026-09-29 after the fix round's verifier found `setup-cancel` red
three times in seven runs: four `--steps=5` runs and then three whole runs in a row green as root on Linux). On Windows it
samples for windows and has run whole there (2026-10-21, a Windows ARM64 development tree, three runs green; ADR-0035, "The
proof on Windows 11 ARM64").

**What `pnpm config-proof` does.** It builds Electron and launches the app five times against commented files at
both scopes: Settings → Runtime toggles "Allow outside workspace" through its confirmation and saves (every other
line as written, the global file untouched); Settings → Models chooses a slot and its strength and saves; a toggle
then Discard writes nothing; the composer's control writes `runtime.permission_mode` with no run active; a file
with `max_depth: many` refuses the run naming the file, the workspace scope and `runtime.max_depth`, and the corrected
file runs to completion. Its evidence lands under `.proof/config-proof/`; the load time is read from the app log. The
Discard scenario is seeded as a workspace already initialized, because a never-initialized one gets the
initialization record written into the same file during the launch wherever the code-intelligence bundle is present.
Its Runtime steps wait for their controls and are read back from the log (2026-09-28, R-062;
[the note](../../defects/fixed/config-proofs-discard-scenario-counts-the-initialization-record-as-a-discard-write.md)).
Since 2026-10-23 that scenario alone is driven (`startApp`, `clickLanded`) rather than captured: a capture press measured
before the provider notice filled its slot met the banner instead of Discard
([the note](../../defects/fixed/config-proofs-discard-leaves-the-save-status-unsaved.md)).

**The control channel.** `contracts/src/control.ts` (the twenty-two operations, the pause payload), store v6
(`queued_prompts`, `sessions.message_limit`, `sessions.paused_at_count`), the writer's units, `engine/src/run/run.ts`
(pause, the limit, the queue's consumption, steering, todo edits, the entry switch), `run/turn.ts` (the injection,
the extra round, the stuck producer), `Sessions.control` and `Sessions.continueSession`; `run.paused` and
`session.continue` cross the boundary; main opens the pause window (`?role=pause`) and relays the continuation;
`ui/src/PauseDialog.tsx` and the composer's queue panel, Steer, Pause, Continue, the confirmations and the run
header's selectors. Decisions taken here for the owner: a manual pause ends the run as `user_cancelled` (the closed
set has no `paused`); the pause at the limit writes no terminal pair; operations with no mechanism answer false.
`ROTARIS_CAPTURE_TYPE`, `ROTARIS_CAPTURE_PAUSE_ANSWER` and `ROTARIS_CAPTURE_QUIT_MS` are verification seams.

**What `pnpm part-j-proof` does.** It builds Electron and launches the app eleven times against scratch stores (seven
until scenario 6 and the steer-early launch were added): a
message typed during a run is queued and consumed once as a completed task; a steer is submitted from the composer's
card and injected — since 2026-10-01 with the steer-rest launch's steer (`STEER_CLICKS` in `lib/steer-rest.mjs`: Steer
the run waits for its control and the settled send, and the launch fails by name on a step it never pressed), where it
had pressed at fixed appointments a late run start misses
(`../../defects/fixed/part-j-proofs-steer-launch-presses-steer-at-an-appointment-the-runs-start-can-miss.md`); a steer whose dialog opened while the composer's send was still settling reaches the root's record
with the text typed into it — since 2026-10-01 the composer takes the focus back after a submission only when nothing
else took it meanwhile (`composerReclaimsFocus`), and main holds the `session.subscribe` reply under
`ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS` so the launch opens the dialog inside that window every time
(`apps/desktop/scripts/lib/steer-early.mjs`,
`../../defects/fixed/a-modal-opened-while-the-composers-send-is-settling-loses-its-focus-to-the-composer.md`); Pause then the composer's Continue run leave the pause row and two run starts, and a worker thread
sampling the store while the app runs shows the pause released the lock and the continued run held it throughout
(ADR-0005, 2026-09-29, R-067) and the paused session's summary naming no stop (REQ-ORCH-082 rule 1, OQ-118); a steer
submitted while the entry role's step is held, then a pause, reaches the root's record at the rest, injected once, and
the Continue's resumed root reads it (REQ-MONITOR-134, OQ-128, 2026-09-29, R-067) — since 2026-10-01 its Pause
waits for the steer dialog to close (`apps/desktop/scripts/lib/steer-rest.mjs`, the capture grammar's `@from~ms`), the
launch fails by name on a step it never pressed, and the store must show the steer pending when the pause was asked for
(`../../defects/fixed/part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md`); a `message_limit`
of one pauses the run, the dialog answers "double" and the doubled limit persists; a session left paused at the limit
is resumed on relaunch through the one reap and its dialog answers "cancel"; a user-initiated close during a run
records `application_shutdown` with the terminal pair and no lock. Its evidence lands under `.proof/part-j-proof/`. *On Windows (2026-10-20, the Windows ARM64 session's C5) it went red five times of five, none on the control channel: four runs lost `pause`'s first store to an EPERM on its sibling (`../../defects/a-first-store-on-windows-is-refused-with-eperm-on-its-sibling-and-the-workspace-does-not-open.md`), and the fifth met every scenario up to the two-window launch, which names a window by a forward-slash suffix (`../../defects/part-j-proofs-two-window-launch-names-a-window-by-a-forward-slash-suffix-that-never-matches-on-windows.md`).* The queue
launch's capture sat on a knife-edge the Parts R and S merge found (2026-09-05): the launch reaches `session.start` about
1.2 s in and the run needs about 8 s from there — a silent 4.2 s gap at the iteration boundary of a scripted run,
identical on both branches and on main, not diagnosed — so three runs landed 100 ms either side of the 9 s capture; it
waits 13 s now, the assertion being consumption, not a budget.

**The Library view.** `contracts/src/library.ts` (the two prompt lists, the closed four a "library change" is, and
`LIBRARY_TABS` left where it already was in `notices.ts` rather than restated), store **v11** (`prompt_history` and
`prompt_stash`, the first workspace-scoped tables here), the DAL's four prompt calls with the adjacent-duplicate rule
and the caps beside the insert, the run host's three session-less `prompts.*` requests, main's `library.ts` (the
revision, whose `bump` takes a member of a four-valued union so a settings write cannot reach it) and channel 9
`library:changed`; `ui/src/library/` (the shell with the one search field, the Prompts tab's resizable split under
`panels/library`, the stash dialog) and the composer's Stash control. `contracts/src/artifacts.ts`, store **v12**
(`artifacts` and its declared index — REQ-LIBRARY-087's "record and index written as one indivisible step" is one row
and one index on rows, and the file-era reading is kept beside it), `engine/src/artifacts/` (record, sidecar, store,
context, port), `agent-tools/src/tools/artifacts.ts` (the three executors the registry had named since Part B),
`ui/src/markdown/` (**ADR-0051's first execution** — parse to a tree, render the tree to elements, never a markup
string, with the bounded cache) and `ui/src/library/{ArtifactsTab,ArtifactInspector}.tsx`. Artifact bodies are files
named flat beside the session's other files (`artifact-<id>.md`), because REQ-SESSION-002 closes that directory to
three kinds of file and a subdirectory's standing under that sentence is arguable. `ROTARIS_CAPTURE_PROMPTS` and the
scripted client's `artifact:<tool>[:<key>]` step are the verification seams. *Since 2026-10-15 (fin47, `PD-TOOLS-006` revision 10, OQ-334)*
every agent is told that the run keeps a child's report as a `child_report` artifact: `delegate`'s description carries
`REPORT_ARTIFACT_SENTENCE` where the run holds a store, its catalogue names "publishes artifacts" on an entry whose resolved grant
holds `artifact_write` (`catalogueWords`, `agent-tools/src/tools/delegation.ts`), and every child payload carries
`CHILD_REPORT_ARTIFACT_SENTENCE` after its workspace-root line (`engine/src/children/notify.ts`); the live run counts children's
unknown `artifact_write` calls and briefs asking a non-publisher to publish (`routingMissReading`'s `unknownArtifactWrites` and
`publishBriefs`, target 0 each).
