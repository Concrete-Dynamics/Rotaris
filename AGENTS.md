# Agents working in this repository

`CLAUDE.md` states what governs this repository: the clean-room boundary, the approved inputs, the process
state, the architecture views and the design language. Read it first — nothing here relaxes any of it.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the vocabulary those documents fix: one `CONTEXT.md` per context, every
term derived from `docs/spec/` and citing the requirement that owns it. Read it before naming anything new,
and prefer its word over a synonym you would otherwise reach for.

[`docs/module-map.md`](docs/module-map.md) is the shallowest map — which package owns a thing, the file to
open first, and where its tests are. Read it when the question is *where*; the proof index below answers
*what re-verifies it*.

This file covers the two checks `CLAUDE.md` does not spell out: **`pnpm app:drive`** (free, interactive
debugging of the built app) and **`pnpm live-run`** (the only check that spends real money) — and indexes the
proof scripts, so the evidence for an area can be found without reading forty script headers.

## The proof scripts — which one covers what

`pnpm check` (symbols, typecheck, lint, tests) is the gate every change passes before it lands on main: an agent
working alone runs it before each commit; in an orchestrated build it runs on the exact head each landing
pushes, its builders committing on the quick checks (the owner, 2026-10-07; the skill's CHANGELOG). Beside it
sit the **proof scripts**: each launches the **built** application against a scratch profile and measures a
mechanism in the product rather than in a unit test. Every one is a first execution's evidence, and the area it
covers is the area it re-verifies.

Two rules about them. **Run the whole suite a part touches, not the one script named after it** — a change
that moves a shared seam breaks a neighbour's proof, and that is the point of having them. And a proof is
**evidence, not a test of the harness**: a red is a defect of the product until the harness is shown to be
wrong.

No proof hangs on a launch that overruns. Every launch a script starts itself goes through
`lib/bounded-launch.mjs`'s `spawnBounded`, and a driven one through the driver's `stopApp`. Two launches are neither,
and `lib/launch-sites.test.ts` names them with their reasons: `code-intel-proof`'s branch, a stdio server whose RPC
client fails every request when it dies or hangs, and `live-run`'s `runElectron`, whose bound is SIGKILL reported as
a signal, never as a clean exit. Any other bare `spawn` of Electron fails that test. At its bound the
application is sent SIGTERM with its pipes still open, and it answers: its quit path runs and it exits within a
fraction of a second. SIGKILL follows a grace only if it does not. The proof then fails with the launch's last log
lines. `lib/launch-sites.test.ts` refuses a `spawnSync` launch of Electron: its timeout closes the pipes as it signals,
so the quit path's lines are lost, and it reports the overrun as exit status 0 with only `error.code` `ETIMEDOUT` to
show it, which a check of the status passes as a clean exit. (Before the application's EPIPE loop was repaired on
2026-09-29 it did not return at all.)
([note](docs/defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md)).

A launch ends with its whole process group, not with its main process alone. Since 2026-10-07 a driven launch leads a
process group of its own as a `spawnBounded` one does, and both drain it once the main process has exited
(`drainGroup`): whatever of that group is still running three seconds later, an Electron helper or a child the app started
in it, is ended with SIGKILL and named on the proof's standard error as `bounded-launch: … outlived it …`. Since fin34 the
drain also reaches a child the app puts in a process group of its own (a project-setup step, `packages/mcp/src/setup.ts`),
on Linux, by an `XDG_DATA_HOME` the launch was given in its environment (since `3c54f02` never one it inherited from the
proof's own shell, so a launch given none is not swept this way): it is given REQ-WORKSPACE-092's 5 s and a second's margin to
end by itself, then ended with SIGKILL and named as `bounded-launch: … in group(s) of their own outlived …`
([note](docs/defects/fixed/a-proof-can-exit-while-a-setup-step-the-app-started-in-its-own-process-group-is-still-ending.md)). A proof that exits or is
signalled takes every live group with it. Before that, `layout-proof`, `driver-proof` and `workspace-proof` exited beside
their own zygotes and a Git view's `git diff`
([note](docs/defects/fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md)).

| Area | Script | What it measures |
|---|---|---|
| **The run** | `part-h-proof` | the loop supervisor and `continue` (ADR-0059); since 2026-10-07 (`plan-correction`, PD-ORCH-015, OQ-225) a coordinating root that answers while its plan's report item is `PENDING` is corrected in its own conversation at the default configuration, records the item, and closes in one `succeeded` iteration with no held-answer row (two iterations, `partial` then `succeeded`, without the directive); and its resume launches read each closed iteration's `iteration_end` timeline entry, the record REQ-SESSION-115's "Recent iterations" reads (live-run finding P4); since fin32 (PD-ORCH-016, OQ-232) its `raw-count-varied` and `raw-count-same` launches hold the classifier past its 2.0 s bound on a raw-count trigger: four `read_file` calls of four files in one step (the scripted `reads4:varied` step) record no activation, and four of one file (`reads4:same`) one `raw-count` activation naming it (`raw-count-observed.json`); since fin35 (REQ-CONFIG-467) its `raw-count-long-bound` launch sets `runtime.loop_classification_timeout: 30` and still records that activation inside the 12 s window, the call cut within what remains of REQ-NOTIFY-106's 2 s budget; and each of the three launches must show one loop classification dispatched (the trigger fired and the call was cut), so a launch with no activation cannot pass with the trigger never fired; since fin42 (N56) its `plan-held` launch has the root ignore its one correction (`planopen,report,report,plandone,report`): iterations `partial` then `succeeded`, PD-ORCH-015's held `system` row, and iteration 2's root handed the marker and the held answer in its first message (read from `agent_messages`); and its `answerless` (`silent,silent`) and `answer-when-asked` (`silent,report`) launches meet PD-ORCH-009's silent root through the scripted `silent` step: asked exactly once, then "The run ended without an answer: …" and one warning `incomplete_execution` issue, or the answer and neither |
| | `part-j-proof` | the control channel: a queued message at the iteration boundary, a steer (since 2026-10-01 its Steer waits for the control and the settled send, `lib/steer-rest.mjs`'s `STEER_CLICKS`, and an unpressed step fails by name), a steer whose dialog opened while the composer's send was still settling (since 2026-10-01, `lib/steer-early.mjs`: main holds the `session.subscribe` reply, `ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS`, and the root's record must hold the text typed into the dialog), a graceful pause (its rest's summary, and the session lock the Continue holds for its run, sampled while the app runs), a steer still pending at a pause reaching the resumed root, which carries on with its next scripted step rather than its first (the scripted client reads where a resumed agent stood from its record; since 2026-10-01 the launch's Pause waits for the steer dialog to close, `lib/steer-rest.mjs`, and the store must show the steer pending when the pause was asked for), the message-limit pause, a person's close during a run asking REQ-STARTUP-046's active-run confirmation in REQ-SHELL-119's words, answered Yes (the run stopped for shutdown) and declined (the window stays, takes a message typed into its composer after the Cancel as a queued prompt, and the run goes on to its own end; since 2026-10-06, `docs/defects/fixed/closing-a-window-while-a-run-is-active-asks-no-confirmation.md`), two main windows driven through their own title-bar close (`pair-app`, since 2026-10-07, PD-SHELL-009): the idle window's close asking nothing and the other project's run going on, then the running window's close asking "Close this window while a run is active?", answered Yes, and its session resting `paused` by `stop` before the window closed (since fin29 the running window closes over its run's open approval dialog, under `permission_mode: ask`: the store must record `approval_withdrawn` and no `approval_denied`, the stopped run's outcome must be logged as held back from the window that stays, and no notice of that session may be relayed; and, PD-GIT-001, B's launch dialog read while A's project runs must show isolation unchecked and enabled, and B's unchecked launch must end `completed` on B's base tree with no worktree binding), and a later iteration's root the quit cut before its first reply there, resumed by the relaunch's Continue at the step after the one cut (since 2026-10-01: the scripted client's standing ledger, `scripted-standing.json` in the data directory, carries an agent's place across clients where its record holds no reply) |
| | `continuation-proof` | PD-ORCH-004 revisions 3 and 4 in the built app (since fin42): a child cut off at a 3 s per-agent timeout while making progress leaves a continuation offer that a later root takes up — (`later-iteration`) iteration 2's root, the queued prompt's, told the offer in its first message, its continuation cut off too and offered none of its own (continued once, never chained); (`later-run`) a new run's root, after a relaunch that opens the session from the Sessions browser with the limit raised to 60 s, told it in the continuation handoff, its continuation `succeeded`. Each asserts from the store the cut-off child's report ("Child timed out after 3s", the cut-off statement, the offer), the continuation's `continuation_of` and the later root that delegated it, that the delegating root's own first message listed no offer, and that no offer is left open. The scripted root takes an offer with `continue:<persona>:<name>` (`offeredTaskId`). `--only=<scenario>[,…]`; every scenario runs to its end and failures are listed in `results.json` |
| | `plan-gate-proof` | the plan gate held, edited, answered (ADR-0062); since fin42 (`revised-by-hand`) the capped "You asked for" line is reached with a real Tab and scrolled with PageDown, and the revision field dragged taller by its grip with the pointer (`ROTARIS_CAPTURE_GRIP_DRAG`), PD-ORCH-002 revision 3's two readings left unmeasured; since 2026-09-29 a fresh session whose plan cycle root called a tool is reopened at its gate, and the inspector's run-level agent must mark that tool `used` (`docs/defects/fixed/the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`); since 2026-10-01 the same reading after an iteration, with `plan` chosen and the entry persona switched before the plan cycle, must mark the plan cycle root's tool `used` and not the iteration root's (`docs/defects/fixed/a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`), and must name the run-level agent, and draw its chips, as the latest root's persona (`docs/defects/fixed/after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md`); since 2026-10-01 the entry role carries the MCP fixture server, and every captured request of the held cycle must print it with no tool while the approved run's print its tools (`docs/defects/fixed/an-mcp-tool-withheld-at-the-plan-gate-is-still-printed-in-the-prompt.md`); since 2026-10-06 the expanded gate is read at 1000x680 beside REQ-NOTIFY-032's persistent warning, in preview and in edit mode, each with the revision field closed and then opened by its summary, where the plan must still be the largest part and the only one that grows, no other part may shrink below its content, and the three answers must be hit (`docs/defects/fixed/the-expanded-plan-gate-gives-the-whole-loss-to-the-plan-when-a-notice-shares-the-window.md`) |
| | `resilience-proof` | the model ladder, the waits, the fallbacks, against scripted faults, and (`quota-wait`, OQ-173) that a provider-limit wait past the stall threshold is logged as a wait (at `INFO` since OQ-127's ruling, the scenario's session log kept at `INFO` to read it) and raises no `stall` issue, and (`override`, REQ-MONITOR-194/303, OQ-186) that the wait header's change-model chooser lists the pair the quota answer put out of quota with its reason and choosable, and (REQ-CHAT-006) that the composer's model chip then names the override in force, and (`switch-back`, OQ-177) that an entry switch back to the configured key after a same-tier move applies from the next iteration as its row says, and (`quota-retry`, REQ-MONITOR-194, since 2026-10-02) that the waiting pair chosen on the quota-wait surface clears its exclusion and is retried, re-recorded on a further quota response, and REQ-NOTIFY-060's authentication class (since 2026-10-02): (`fatal`) that a 401 with no usable fallback, after the automatic fallback found none, opens REQ-NOTIFY-072's 560 px recovery dialog in its own window, whose Cancel leaves the run failed and its notice standing and whose Retry restarts the run on the chosen model, a chosen model that fails too reopening it; (`reauth`) that its masked key field stores a new key — validated against a loopback catalog stand-in — and restarts the run on the same model with it; (`auth-fallback`) that a first 401 with `fallback_model` set pins it and restarts on it, no dialog opening — in plan mode too, the plan cycle restarted on the fallback — and opens the non-modal re-authentication prompt with the composer, the title bar's controls and the notice's buttons usable beside it and no control under it, measured at the opening size and at 1000x680 with an API-key provider's key field, and beside an expanded plan gate as its bar with the gate's three answers usable; (`auth-fallback-dialog`) that the fallback refused too opens the dialog naming it, closes the prompt and offers neither model that failed; (`auth-fallback-revise`) that a revise cycle refused on a first 401 is restarted as the same revise, its changes reaching the fallback and no prompt re-submitted; and (`generic`) that a failure of no earlier class raises REQ-NOTIFY-064's notice whose action returns to the workspace view; and (in `auth-fallback`, `auth-fallback-dialog` and `generic`, since finacc2's A1, REQ-NOTIFY-032/058) that main never reads the failure of the session the window started as another session's, and that no REQ-NOTIFY-032 warning stands beside the prompt after the fallback restart; and (`next-run-choice`, fin10) that the composer's next-run model chip clears the exclusion of the pair it chooses (REQ-MONITOR-194/146) — since fin11 the excluded key it already shows, chosen directly — and that the inspector's Model field names the key the root runs on (beta) during the held run (REQ-MONITOR-052/066); and (`child-timeout-inspector`, finacc F7, REQ-MONITOR-052/066/049) that a child retried on its role's fallback after REQ-ORCH-088's timeout is drawn in the inspector on beta, against beta's maximum input, while the retry runs, and on alpha, against alpha's, before; and (in `same-tier` and `two-waits`, PD-MONITOR-007, since 2026-10-06) that the helper calls — the intent classifier and the post-run analyst — follow the session's override and make no call on a pair held out of quota; and (`keep-waiting`, PD-MONITOR-004 revision 2, since 2026-10-06) that the wait header's Keep waiting in an out-of-quota wait retries the waiting pair at once, its exclusion cleared and no override persisted, and that a second press in the same frame retries nothing more and switches no model; and (`switch-over-override`, PD-ORCH-013 and PD-MONITOR-006, since 2026-10-06) that an entry switch from the run header onto a pair an earlier wait overrode takes the override back, the next iteration runs on the pair chosen, and the row says the switch holds for the rest of this run; `--only=<scenario>[,…]` runs named scenarios alone; the `override`, `quota-retry`, `keep-waiting`, `switch-over-override`, `next-run-choice`, `child-timeout-inspector`, `fatal`, `reauth`, `generic`, `auth-fallback-dialog` and `auth-fallback-revise` launches are driven (the chooser the wait header draws; the recovery window, addressed as `auth-recovery`), every launch is bounded (`lib/bounded-launch.mjs`: an overrun is ended by SIGTERM, a grace, then SIGKILL and reported with its log tail), and every scenario runs to its end with failures listed in `results.json` |
| | `compression-proof` | context compression and its timeline entries (ADR-0060); a child's count in the Mission table (REQ-MONITOR-281); since 2026-10-02 the run-wide count, the root's own compression included, on the inspector and the run-level agent's persona window (scenario 6, REQ-MONITOR-086/281); and (`after-a-move`, fin10) that the trigger follows the root's cell to the pair a same-tier fallback moved it to (REQ-MONITOR-078/079/080), and since 2026-10-06 that the configured compressor, held out of quota, yields to the root's own model (PD-MONITOR-007); and (`excluded-before-pass`, fin10's first repair round) that a root resumed on a pair its child just excluded moves before its compression check, so no pass runs at the excluded pair's trigger (REQ-MONITOR-194, REQ-MONITOR-080) |
| | `checkpoint-proof` | the capture at iteration close through to the desktop restore (ADR-0039); since 2026-10-13 (N68) its `hook-capture` launch has a global `iteration_end` hook write a file and reads it in that iteration's checkpoint (REQ-HOOKS-082, POSIX hosts); the `live` launch's lock is probed dead the moment it returns (`lib/lock-holder.mjs`), so a lock that outlives the application fails there and is not blamed on the `repaired` step (`docs/defects/fixed/checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md`); since 2026-09-29 the `loaded-restore` launch restores a session still loaded after its run, once a second holder has taken its lock, and fails on a restore that writes under that holder (`docs/defects/fixed/a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`) |
| | `sessions-proof` | the session browser's actions: repair, delete with ref cleanup, the exports; its planted locks read the machine identifier where the product mints it on the running platform (`machineIdFileFor`; `docs/defects/fixed/sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md`); the delete's cascade premise is the schema's shape, never a count of tables (`lib/session-cascade.mjs`; `docs/defects/fixed/sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md`); since 2026-10-06 its repair reads the repaired session's `summary.md`, whose Outcome block must be the correction entry (OQ-60 as ruled), and its seed reads REQ-SESSION-140's sections in order (fin22; both files kept as `seed-summary.md` and `repaired-summary.md`); since fin23 the seed's script is `write,badterm,answer`, whose `badterm` step sends a terminal call its schema refuses, and the seed asserts that `summary.md`'s Tool errors line counts it once, agreeing with its Issues line (`tool_error 1`) though the call's outcome is `invalid_request` (REQ-SESSION-136; `docs/defects/fixed/summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md`); since 2026-10-07 the seed's Mostly-elided artifacts line must read a plain `0` naming the timeline's `context_selection` entries, where it read `n/a` (`PD-SESSION-002`; `docs/defects/fixed/summary-md-counts-no-mostly-elided-artifacts-until-oq-207-is-ruled.md`); and its Terminal failures, Terminal suspicious successes and Timeouts lines must read plain over whole rings (finacc3 A2-09; `docs/defects/fixed/summary-md-terminal-failures-and-timeouts-read-short-past-the-cap-with-no-flag.md`) |
| | `restore-kill-proof` | ADR-0058's restore killed between its two renames (README B2; since fin41, 2026-10-13): `restoreStore` runs in a plain Node child bundled with esbuild from `packages/store/src/restore-kill.child.ts` — no Electron, no display — and is SIGKILLed at its `betweenRenames` hook, `--trials=N` times (default 10); it FAILs when the kill missed the gap or the disk is not the model's (target empty, the restore's journal `<id>.restore-pending` beside it, displaced and staging stores whole), and, since fin43 (2026-10-14, OQ-266 ruled), unless the workspace service's next open put the displaced store back: the two previous sessions listed, nothing migrated, `cutRestore` naming it, the reinstated `workspace.db` byte-identical to the displaced one, the journal gone and the staging copy kept (until then the next open's empty store was a FINDING only) |
| **Tools** | `fetch-proof` | `fetch` and its egress policy, read from saved configuration at **every** call; since 2026-10-06 its `timeout` launch also reads that the `terminal_timeout` issue names the fetch, never a terminal command (REQ-SESSION-136, finacc3 A2-08, since 2026-10-07); its first launch, `explicit_trivial`, also reads the instructions the model port received: the coordinator granted the direct-work bundle is told to do the work itself (OQ-202, `PD-ORCH-006`), and its playbook's ROUTE slot is the entry role's own wording, never the `routed` text that says a coordinator routed the task to it (K3 of the live run at `c2fdd6a`, since 2026-10-06); since 2026-10-07 its eighth launch, `swarm-granted`, saves `rotaris.delegation_strategy: swarm` on the same `explicit_trivial` run and reads that the coordinator is told the direct-work statement, carries no `## Run override` heading, and is offered `write_file`, `terminal` and `delegate` (OQ-205 as ruled, `PD-ORCH-006` revision 3; the scripted client's capture records the offered tool names); since 2026-10-13 its ninth launch, `cancelled`, quits the application by SIGTERM while the server holds the fetch, and reads the record `interrupted`, `InterruptedError`, with no issue for it (`PD-TOOLS-013` revision 2, OQ-238) |
| | `edits-proof` | since fin42 (N52): the edit directives PD-TOOLS-014 to PD-TOOLS-018 through the run host on a CRLF, tab-indented fixture the proof generates (`lib/crlf-fixture.mjs`; a committed CRLF file is normalised away), one scripted run of `tool:<key>` steps (`ROTARIS_SCRIPT_TOOL_ARGS`, `@content_hash` filled from the newest hash): a level-1 edit, an insert and a multi-line `replace_all` keeping CRLF and saying so, a level-2 window edit, its no-op refused in PD-TOOLS-016 clause 4's words, an endings-only edit refused in PD-TOOLS-017 clause 3's, a level-3 shift with a `\r`-carrying `old_string`, and a `haet_edit` near miss at level 2 quoting the window with its `\r`s, retried with the quote and applied; asserted from each file's bytes, the stored results and `lib/near-miss-edits.mjs`'s reading. Since fin43 (`PD-TOOLS-019`, OQ-280) a one-tab-shallow LF `old_string` on a CRLF file is asserted at level 3 — `shift-lf` through `write_file` (the shift sentence, then the CRLF sentence, the exact bytes) and `near-lf`/`retry-lf` through `haet_edit` (the near miss naming the line endings, its quote applying); until then it was recorded only, landing at level 4 as given (`docs/defects/fixed/on-a-crlf-file-an-lf-old-string-one-indent-off-skips-match-level-3.md`). The live run's `crlf` scenario is its real-model half |
| | `questions-proof` | `ask_questions`, the trailer row, the stepper, the two control operations |
| | `approvals-proof` | approval waits through real dialogs under `ask` (since fin42, 2026-10-13; the dialogs answered or left by `ROTARIS_CAPTURE_APPROVAL`'s per-tool form, `<tool>=<answer>[,…]`, `none` leaving one to its timeout): `away` drives PD-TOOLS-005 revisions 1 and 2 and PD-TOOLS-011 at a 12 s timeout — the first wait times out and writes `user_away`, a wait queued behind it ends in the same tick unshown, asks while away are denied at once with no dialog, the question tool's own approval survives the mark and is shown, and answering it writes `user_returned` (read through `lib/approval-readings.mjs`); `session` drives PD-TOOLS-004 — one `write_file` dialog answered for the session, the edit of the same path that follows allowed by the session rule with no dialog, and a terminal dialog left to time out read as `user_away` in the audit; `--only=<launch>` picks launches. The live run's `away` and `approvals` scenarios are their real-model half, and its `plan-gate` scenario the plan gate's |
| | `todo-proof` | the todo source priority, write-through edits, the pane |
| | `attachments-proof` | content validation, ceilings, the capability gate, durable metadata |
| | `artifacts-proof` | the session artifact store, the Artifacts tab, the inspector; since 2026-10-13 item 4 also presses a link in the inspector's Preview and reads its `shell.openExternal` request (ADR-0051 decision 4), since 2026-10-14 (fin43) before the save, so Save is pressed under the acknowledgement it raises (REQ-NOTIFY-020); since 2026-09-29 (live-run finding K1) item 2 also reads the agent inspector while the delegating run is still active — the run-level agent's chips (its live root port's resolution) marked from its history, the link to what it published — and follows the link into the Library's artifact inspector (first written "at rest", which it never was), and item 5 reads it at rest in a reopened session, the declared tools standing in; since 2026-10-01 (acceptance A20) item 2 also holds the run-level agent's meta line to at least one call per tool its chips mark used, which read `0 tool calls` while its turn ran; since 2026-10-03 item 1 reads the empty Library when its Artifacts tab has loaded rather than at an appointment a startup stall can close (`lib/library-refresh.mjs`); since 2026-10-07 item 4 holds the inspector's Preview below the document's frontmatter (PD-LIBRARY-003) and captures it as `inspector-preview.png` (fin30), its orchestrator is granted publishing with both keys REQ-CONFIG-106 names, and launch 3b declares `artifact_write` without `can_publish_artifacts` and reads the `artifact_publish_not_granted` removal in the session log (OQ-212); since 2026-10-07 launch 7 attaches two long artifacts and a short one to a delegated child and holds the delegate observation, the `context_selection` entry, the child's block and `summary.md` to one selection within REQ-TOOLS-152's 100,000 characters, the overflowing one left out by id and the later short one still carried (PD-TOOLS-006 revision 5, OQ-221); since 2026-10-13 (fin42, N57) launch 8 publishes `travel-plan` and a person edits and saves it in the Markdown tab (caret taken below the frontmatter first, OQ-272; since 2026-10-14, fin43, PD-LIBRARY-003 revision 2: no caret move — the tab draws the frontmatter read-only above the editor, a press and typing there change nothing, and the saved block is the record's with `edited_at`), reading `edited_at` stamped and `key_findings` kept, and launch 9 continues that session, reading the fresh root's first message carry the edited document marked `edited` with no frontmatter (REQ-SESSION-115) and a superseding publish rewrite the older document's frontmatter and keep the edit below it (PD-LIBRARY-003 (c) to (e); the capture records each call's first user message) |
| | `mcp-proof` | MCP declared three ways, against a real fixture server (ADR-0033/0034); launch 1 also reads the system prompt the model port received and asserts the workspace's `AGENTS.md` is closed by the end comment and followed by the MCP section with nothing between but the product statement every agent receives last (REQ-WORKSPACE-043 with REQ-MCP-101, since 2026-10-06; the statement, PD-TOOLS-012 revision 2, since fin32), its workspace a repository of its own so that no skill of this checkout's `.agents/skills/` reaches the catalog (`docs/defects/fixed/the-mcp-proofs-runs-list-the-repositorys-own-skills-in-their-catalog.md`); launch 2's `slow` call beyond its allowance files a `terminal_timeout` issue naming the call, never a terminal command (REQ-SESSION-136, finacc3 A2-08, since 2026-10-07); launch 2b refuses an MCP call that fails its server's advertised input schema at the gate and reads at the fixture that it was never sent, while a valid call arrives exactly as written (REQ-TOOLS-032, live-run finding G3); launches 3b, 6 and 7 are driven (3b: a child whose `tool_restrictions` leaves no native tool, its empty grant recorded and its inspector listing none; 6: a server whose tool discovery fails recorded and drawn dropped for `discovery-failed`, REQ-MCP-114), each step waiting for its condition (`<name>.steps.json`); launch 7's `.cmd`-runner check (REQ-MCP-113's wrap) is asserted on win32 only and **stated not applicable elsewhere**, the rest of the launch measured on every platform; launch 9 (`exit-bound`) closes the window at 40 s while a server never answers and bounds the exit, and since 2026-10-06 answers REQ-STARTUP-046's active-run confirmation Yes (`ROTARIS_CAPTURE_ANSWERS=1`) where its run is still active at the close (the last window's close, PD-SHELL-009); since fin42 (N51, PD-TOOLS-013 revision 2) launches 2c, `cancel` and `cancel-throw`, quit the application by SIGTERM while the fixture holds `slow`: the MCP executor's catch and, through the run host's `ROTARIS_CAPTURE_THROW_ON_ABORT` seam, the gate's catch must each record the call failed / `interrupted` in revision 2's words, file no `tool_error` or `terminal_timeout` issue, and count under `summary.md`'s `interrupted` bucket with Tool errors 0 |
| | `code-intel-proof` | the bundled code-intelligence runtime and its manifest (ADR-0035); since fin35 (OQ-245) its ninth launch, `child-across`, a delegated tester's whole-project cross-file replacement read back with both files it changed from the child's report and artifact (no language server needed); it builds by platform; its window sampler is Windows-only, and elsewhere section 1 records the no-window check **not measured** (the instrument is missing, not the requirement), with its reason, in `results.json`; its setup launches open Settings with the Ctrl+7 chord rather than the shared category seam, and every press waits for the open's notice to have drawn and then for the control it presses (`docs/defects/fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md`); a press step that never matches logs `never matched`, which is expected for the `MCP Servers` step whenever Settings already opens there; its branch launch is the product's order, the token first and `hostSwitches` between it and `--`, which `lib/launch-sites.test.ts` holds for every token launch (`docs/defects/fixed/code-intel-proofs-branch-launch-puts-the-sandbox-switch-ahead-of-the-token.md`); its branch client (`lib/line-rpc-client.mjs`) fails every pending request when the child exits, errors or is killed, with the exit status and standard error's tail, so it no longer hangs (`docs/defects/fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md`, `docs/defects/fixed/code-intel-proofs-branch-client-waits-forever-on-a-child-that-has-exited.md`); since fin32 its eighth launch (`child-edit`, `--steps=8`) delegates a tester whose one call is the EDIT tier's single-file content replacement and reads the edited path in the child's stored report and its child-report artifact (PD-ORCH-004, REQ-ORCH-109; `docs/defects/fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md`); since fin42 (N59) its tenth launch (`child-rename`, `--steps=10`) has a refactorer search for a TypeScript function's references and rename it across two files with `rename_symbol` through the runtime's TypeScript language server, both files read back from the report and the artifact; its eleventh (`child-rename-cold`) makes the same rename with nothing before it, which renamed the declaring file alone until `PD-MCP-004` (OQ-273, fin43; `docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md`) had the run host send the reference search before every rename, and asserts both files renamed and no search row — that directive's acceptance gate, **re-run on every pin change**, recording what it read in `results.json` first; its twelfth (`child-renamed-tool`) renames `replace_in_files` through the global configuration's `tool_name_map` and reads both files a call by the new name changed (REQ-MCP-005) |
| | `skills-proof` | portable skill discovery, with a scratch home and a scratch machine-wide root (ADR-0063; `ROTARIS_CAPTURE_SKILLS_MACHINE`, off Windows only); the `/skills` listing written as one saved system row and read back after a reopen (REQ-CHAT-162) |
| | `injection-proof` | workspace-context injection as the model port **received** it — order, the per-file switches, OQ-64, a worktree's execution root (since 2026-10-03 also the code-intelligence server's launch lines: the isolated launch's must name the worktree's root and the base launch's the workspace, REQ-MCP-034; `docs/defects/fixed/an-isolated-runs-code-intelligence-server-is-bound-to-the-anchoring-checkout.md`; and since 2026-10-06 two fixture servers a user might add, whose filesystem fill-in, working directory and `lsp_init` root the isolated launch must hand the worktree, PD-MCP-002) — and REQ-WORKSPACE-049's cold-cache p95 over 20 separate processes (`--skip-latency` skips it; cold only on Linux); and (launch 5, `undecodable`, since 2026-10-13) a workspace `AGENTS.md` that is not UTF-8 contributes nothing beside a valid sibling, with the run host's warning naming its path and the decoder's error (REQ-WORKSPACE-045) |
| | `sandbox-proof` | OS-level confinement (ADR-0022). The proof reads the host's own verdict (`process.platform`, the launcher on `PATH`, its own trial) and asserts the product's answer for that case (`docs/defects/fixed/sandbox-proof-asserts-the-windows-verdict-on-every-platform.md`). On `win32` and on Linux without `bwrap` it proves the refusal path. On every host it reads REQ-SANDBOX-130's disclosure on both surfaces, the settings card and the launch dialog (scenario 2b), and expects it only where no mechanism exists. **Where the backend is available it also runs REQ-SANDBOX-127's six effects (IC-8)** with `.git` present, plus a third confined launch with `.git` absent: REQ-SANDBOX-077's case (c). On Linux with `bwrap` that launch expects every command refused (`sandbox_unavailable`, 126, read from `tool_calls`) and `.git` still absent afterwards (`docs/defects/fixed/the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`, OQ-140). Read `results.json` → `effects` |
| | `terminal-stream-proof` | the stream in the run host against a **real PTY** (ADR-0021), each command spelled in the host's shell: PowerShell on Windows, the POSIX shell elsewhere (REQ-TOOLS-104). Before 2026-09-28 it spoke PowerShell everywhere and measured nothing off Windows (`docs/defects/fixed/terminal-stream-proofs-real-pty-half-speaks-powershell-to-a-posix-shell.md`). Since 2026-09-29 the deltas carry what the command wrote and no marker (`deltasCarryOnlyTheCommand`, live-run L9), and a second command on the same stream starts on its own row of the renderer's display (`reopenedStreamStartsOnAFreshRow`) |
| | `tool-shapes-proof` | two single shapes of a tool call the live run could not be sure to ask (since 2026-10-13, fin42, N60): `hard-cap` saves `runtime.shell_command_timeout: 4` and a scripted `terminal` call with no `timeout` that prints every 0.5 s for 15 s, and reads it ended by that cap — hard timeout naming 4 s, exit 124, `session_reset`, the printed lines kept, a `terminal_timeout` issue referencing it — never by the soft pause (REQ-TOOLS-097's `hardMs`, REQ-CONFIG-116); `inferred-create` sends `write_file` with a path and content and no `operation` (the scripted `writeinfer` step) and reads the file created, PD-TOOLS-007's sentence in the result and `operation: create` in the record; `inferred-existing` sends it again over an existing file and reads the refusal saying so, the content untouched, and its `tool_error` issue (REQ-SESSION-136) |
| | `delegation-proof` | three delegation features no built-app run had driven (since 2026-10-13, fin42, N57), scripted: `follow-up` delegates a `codebase-analyst`, waits, and follows it up by `session_id` (the scripted `delegate:<persona>:<name>:followup` step), reading one child row, the follow-up's task in its record once, a `child_resumed` entry and the child ended again (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22); `delegates-to` gives the orchestrator `delegates_to: [codebase-analyst]` and reads the offered `delegate` description narrowed (the capture records it), one delegation admitted and one to `docs-writer` refused naming the list (OQ-229); `swarm` saves `delegation_strategy: swarm` on a run the mapping does not grant and reads the swarm layer, no direct-work statement, and `delegate` offered with no writing tool (REQ-ORCH-025, PD-ORCH-006 revision 3; `fetch-proof` launch 8 reads the granted half) |
| **Configuration and startup** | `config-proof` | hand-authored, commented files surviving every write (ADR-0036/0037) |
| | `init-proof` | project initialization resolved once per workspace open (ADR-0064); scenario 3 reads the dialog **before** its Escape (the reading marks the document and the key waits for the mark), and since 2026-10-02 that no title-bar or notice-slot button has the dialog at its centre, photographing it (`consent-dialog.png`, OQ-187), and asserts that the background task starts and completes beside the consent prompt. Scenario 4's background banner must name its project, the folder's name after the headline and the folder at the head of its detail (PD-WORKSPACE-005, OQ-171). Before the repairs it failed on Linux in both orders: a skip landing ahead of the resolution swallowed the background task (`docs/defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md`), and the background run drew itself in the dialog, which then refused Escape when the resolution came first (`docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`). It needs the bundled code-intelligence runtime: it builds it when it builds, and with `--skip-build` refuses before any launch naming `pnpm code-intel:bundle`; a setup that fails anyway is quoted from the app log (`docs/defects/fixed/init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md`) |
| | `workspace-proof` | reaching a project folder from inside the application: resolution, gates, switch; scenario 8b switches away from a workspace whose initialization run is under way — its two projects point `code_intelligence` at a stand-in runtime written into the evidence directory, whose `project create` holds for 90 s and takes 2 s to end once asked — and asserts the outgoing run is cancelled, its step's process ended within 5 s, nothing recorded for it, the replacement's own setup followed to its recorded outcome once the outgoing one has ended, and a return to it resolved again (REQ-WORKSPACE-013/084/092/102/109; `docs/defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`, `docs/defects/fixed/a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`); scenario 8c holds the run host's one setup slot with the MCP category's setup and asserts that Initialize's refused start fails retryably in the refusal's own words, not as "not a local launch" (REQ-WORKSPACE-093/094; `docs/defects/fixed/a-refused-setup-start-is-reported-as-not-a-local-launch.md`); scenario 8d kills the run host (Linux, found through `/proc` above the stand-in's held `project create`) while a second window's setup is queued behind the first, and asserts the first run ends as a retryable failure saying the run host exited and the queued run is then attempted, its unanswered start failing retryably in REQ-WORKSPACE-093's summary rather than as a task with no outcome (REQ-WORKSPACE-084/093/103/109; `docs/defects/fixed/nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`, `docs/defects/fixed/a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md`); scenario 8e opens a second main window on another project while the first window's setup holds `create`, and asserts the first window reads its own initialization state and its Cancel cancels its own run, the second window's queued setup then running to its own recorded outcome (PD-SHELL-001, REQ-WORKSPACE-013/105; `docs/defects/fixed/initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`); 8f quits the app in order (`driver.quit()`) while a stand-in step holds `create` with a process of its own, both ignoring SIGTERM, and asserts the quit ends within 5000 ms through the run host's shutdown ending the setup, neither process running 5 s later, and no warning that the close's cancellation could not be delivered (REQ-WORKSPACE-092/109, PD-MONITOR-002; `docs/defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`); 8g opens a documentation-only project carrying the runtime's marker and one whose stand-in creation writes to both streams and exits 3, and asserts the step rows read REQ-WORKSPACE-091's fixed sentences and the output's tail with no prefix, in the row and the error, while the run host's log lines keep its own words (REQ-WORKSPACE-091/092/093; `docs/defects/fixed/the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`), and that a documentation-only project carrying the marker and no source file, whose every step ends before its start is answered, is followed to `success` with the three steps and the non-code summary within 15 s rather than at the follow's bound (REQ-WORKSPACE-084/109; `docs/defects/fixed/a-setup-that-finishes-before-its-start-is-answered-is-never-seen-to-finish.md`); and scenario 13b (fin30), off Windows, launches from its deep profile with `XDG_RUNTIME_DIR` unset and then empty and asserts the window paints, the instance record names an absolute socket inside the platform's address limit and outside the data directory, a second launch is handed over through it, and no socket is left in the working directory or behind the ended launch, and (fin36, OQ-248) that the socket sits in a private `rotaris-XXXXXX` directory of the instance's own below the temporary directory, the handed-over launch leaves no such directory, and the ended instance takes its own with it (REQ-STARTUP-145/161/162/164; `docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`, `docs/defects/fixed/a-handed-over-launch-can-leave-the-private-socket-directory-behind.md`); and scenario 13c, on Linux, launches with `XDG_CONFIG_HOME` and `XDG_DATA_HOME` relative and asserts the store, the machine identifier and the instance record are below the launch's home and none of the product's own directories was made in the working directory, and (fin34) that Chromium's own profile is written below the data directory (`<data>/chromium`, its `Local State` there) and nothing at `rel-config` (REQ-STARTUP-145; `docs/defects/fixed/a-relative-xdg-config-home-or-xdg-data-home-is-used-as-it-stands.md`, `docs/defects/fixed/electrons-own-profile-is-written-outside-the-per-user-directories.md`) |
| | `settings-proof` | the Settings categories and the save bar; the Display category's three desktop-preference switches, REQ-CHAT-167's "Show reasoning bodies" among them since 2026-10-13, written at once and read back after a relaunch; the About page's two files (`build-id.txt`, `THIRD-PARTY-LICENSES.txt`), absent and present (it stages them in `apps/desktop/resources/` and gives back what was there); the About page's network-activity disclosure, its three statements naming no host and read by a real pointer selection at REQ-SHELL-022's 1000×680 (launch 1″, REQ-STARTUP-160); the Runtime category's run-start mode hint, with no session followed and over a released session (PD-ORCH-003); the Personas Scope column's Unset, found by its accessible name, read while pending and after Discard (REQ-CONFIG-341); one role's model Unset at Workspace and reasoning Unset at Global saved each into its own file (REQ-CONFIG-259), and one field's Unset at Workspace kept beside a pick of it at Global (launch 10, REQ-CONFIG-341); a configuration change announced while Settings is open leaving a clean form clean, with no `unsaved settings` on the strip, and a real edit dirty across it (launch 11, REQ-CONFIG-419, REQ-SHELL-041); two announcements handed over in one tick leaving it clean, and a permission mode written through the composer's path displacing an unsaved selection (launch 11′, REQ-CONFIG-419, REQ-CONFIG-423) |
| | `updater-proof` | the updater on the one path a development host can execute: a launch that is not a released artifact performs no check and issues no request (REQ-STARTUP-106/114/150) — the log's one `info` line, and a proxy sink every request of Chromium's stack would reach that records none for the feed and **none at all** from launch to first paint and quit (REQ-STARTUP-160, REQ-SHELL-005 — the spellchecker's dictionary download it once caught), with a net-log naming the URL of any connection it does record; and a second launch, started with both artifact variables set, whose one scripted `terminal` call finds neither in its shell's environment (REQ-STARTUP-147); the check, the download, the apply and the restart are unit-tested over fakes and their run against a real artifact is owed to the next Windows package (IC-3) |
| | `exit-trace-proof` | the exit trace's crash handlers in the built app (PD-MONITOR-002; since 2026-10-13, fin42, N60): an orderly launch and quit writes its quit lines and no GONE line at `error`; a second launch's run host is killed with SIGKILL from outside (its pid read from main's `hello` line) and main writes `run host exited (9)` and `CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)` at `error`, then its renderer is crashed with SIGSEGV and main writes `RENDERER GONE (crashed, exit 11) for <URL>` at `error`, and the application's quit (`app.quit()`) then ends the process, exit 0, through the orderly path (the dead renderer's close guard cannot answer, so it allows), with `quit: exiting with status 0` and `main process exiting with status 0` (since 2026-10-14, fin43: until then the quit was held for good, `docs/defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`); `unhandledRejection` and `uncaughtException` cannot be raised in main from outside and stay unmeasured |
| **Surfaces** | `overview-proof` | the Overview painted from the run and the store |
| | `transcript-proof` | the projection, the caches, the empty state (ADR-0045/0046), and REQ-CHAT-055's append comparison — alternating launches pooled to thirty a side, in frames and milliseconds with their spread, plus one traced launch of each fixture read back by `lib/trace-summary.mjs`, which since 2026-09-29 also carries V8's CPU profile: `append.json`'s `profile` names the script per increment by function and by source module, loaded minus empty; stage 3b also expands the planted activity line and reads the twelve frames after the click, opens a planted user row's image attachment (a growth under an unchanged measurement key) and reads the twelve painted frames after it, and holds a pair of rows already drawn to 1 px (2026-10-01); stage 3c (`capacity`, 2026-10-01) resizes the window to 1440x4300 over 400 one-line notices and holds every row on screen bound — Xvfb with no window manager does not clamp the window, so the standard `-screen 0 1600x1000x24` asks it, and a host that clamps the window records the stage NOT ASKED in the verdict; stage 3d (`interleave`, 2026-10-06) runs two scripted children that each hold a terminal command open while the other appends, so rows settle below later rows, and holds the renderer's replica to every row the store recorded (REQ-MONITOR-214); since 2026-10-14 the behaviour stage also opens the search panel from the transcript toolbar's search control and closes it by window-level Escape pressed on its Next button, reading the composer focused (`behaviour.searchControl`, REQ-CHAT-074, REQ-SHELL-055); `--only=<stages>` runs named stages after the `empty` launch; since 2026-10-02 a run fails when any launch's log carries Chromium's "ResizeObserver loop" line (`results.resizeObserverLoops`, ADR-0045) |
| | `rows-proof` | the one row renderer, in both of its surfaces at once |
| | `update-depth-proof` | (since 2026-10-13, live-run finding D8) two children streaming long deliberations at once on the Workspace view, with the `pendingLanes` trap (`scripts/lib/lanes-trap.mjs`) installed through `ROTARIS_CAPTURE_EVAL_AT`: the trap installed, its `rotaris-lanes-trap: installed` line was relayed into the log (OQ-278), and it counted the commits, both children succeeded, and no relayed line names React's update-depth error; it records the simulated nested-update run's high against React's 50, its holders, the components re-rendered and the longest synchronous burst. The duress live launch installs the same trap |
| | `composer-proof` | the composer's chips, drafts, history recall and run header, and (launch 4b, `stop-run`, since 2026-10-13) the composer's own Stop run pressed: "Cancelling…" and "Force stop" while the graceful stop waits, held across a permission-mode change (OQ-165, REQ-SESSION-186; red with `Run.stopAccepted`'s hold removed) |
| | `slash-proof` | the composer's slash-command catalogue; every eval is read by offset AND expression (`lib/capture-evals.mjs`), and REQ-CHAT-027's ground is the first opaque background from the input up, asserted to be the palette's `--rt-surface` (the dock's, `COMPOSER_GROUND` in `highlight.ts`); ~~**red on the product** since the composer dock: the partial shade is corrected against `--rt-bg` and painted on `--rt-surface`~~ green again 2026-09-29, the colours derived on the dock's ground (`docs/defects/fixed/the-slash-token-colours-clear-their-floor-on-a-ground-the-composer-no-longer-paints.md`) |
| | `chat-controls-proof` | manual compression, the transcript clear, the prompt-file commands |
| | `palette-proof` | one action vocabulary reaching the screen three ways; since 2026-10-13 (N71) its stage 6 presses Ctrl+F on Mission and reads Workspace with the caret in the transcript search field (REQ-SHELL-049), and runs the palette's "Toggle reasoning bodies", reading its acknowledgement and `display/showReasoning` in the preference file (REQ-CHAT-167); since 2026-10-14 its stage 7 (`persona-follows-display`) pops out a persona window holding a reasoning row, runs that toggle in the main window and reads the persona window's row opened (channel 14, `display:changed`); `--only=<stages>` runs named stages alone. ADR-0048's **host-input** reading (`os-input.ps1`: a real Win32 click and keystrokes, and `IsWindowEnabled`) runs on `win32` only. Elsewhere `results.json` → `modality.hostInput` states it not applicable and why, and the application's own `isEnabled` reading is still asserted (`docs/defects/fixed/palette-proof-reads-the-win32-host-input-on-every-platform.md`) |
| | `notice-proof` | the notice store and its chain (ADR-0049), and (section 6b, `review-other`, ESC-34, OQ-267) that a hook-review notice naming a workspace no window holds adds a window for it, asking nothing and closing nothing, and opens that workspace's review there (`docs/defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md`), and (section 7, `retry-action`, OQ-178) that a notice's `retry-run` resubmits the failed session's last submitted prompt, and (`retry-image`) that it does so for a prompt released from the resident window, with the image it carried, digest for digest, to the model, and (section 8, `background-ending`, driven, REQ-NOTIFY-031) that a run completing after "New session" released it raises the `success` notice naming the session without moving the window, whose "Open the session" focuses it, and (section 9, `background-quota`, driven, REQ-NOTIFY-093/030/031) that a provider-limit wait cancelled while another session is on screen raises REQ-NOTIFY-031's `info` notice naming the session without moving the window, and REQ-NOTIFY-063's notice with "Open Models settings" arrives once "Open the session" focuses it, its action opening Settings (`docs/defects/fixed/a-background-run-ended-on-a-provider-limit-loses-its-quota-notice.md`); every scratch workspace carries an answered project setup, and a launch that starts the background setup anyway fails by name, so "Project setup did not finish" never stands in the slot it reads (`docs/defects/fixed/notice-proof-reads-a-failed-project-setup-in-place-of-the-hook-review-notice.md`); and (section 1b, `hook-load-fault`, since 2026-10-13) that an invalid hook entry fails the configuration load before the hook port sees it (REQ-HOOKS-012 before REQ-HOOKS-085), the run refused with REQ-CONFIG-478's file, scope and key path |
| | `library-proof` | the Library shell and its Prompts tab |
| | `mission-proof` | the Mission view, the per-agent inspector, the persona windows; since fin35 (item 1f) a child stalled past a 3 s `child_stall_timeout` shows REQ-ORCH-089's `stalled Ns` tag on a line of its own in the Workspace sidebar's row (the persona on one line) and in the Mission table's state cell (the card unscrolled), with their geometry, and since fin36 the table's persona cell read on one line ("coding-agent" broke at its hyphen in a 71 px column before); since 2026-10-07 (item 1d, PD-CONFIG-003 revision 3, OQ-234) a child cut off at a 3 s per-agent timeout says so on all four agent surfaces — the tree and table tags on a line of their own, the inspector's and the persona window's line naming Settings › Runtime › Per-agent timeout — with and without progress, and their geometry; since 2026-09-29 a waiting agent's clock (item 1b: two children waiting behind a slot cap of one show their elapsed time, advancing — REQ-MONITOR-107/111, OQ-124); since 2026-10-07 (item 1c, OQ-213, live-run finding K2) a coordinator that delegates twice before writing its own todo list has the second delegation refused (`blocked`, `todo_list_owed`, no child, no `tool_error`), writes its list and repeats the call, and its stored todo carries an agent plan — the proofs whose scripted coordinator delegates more than once open with the scripted `plan` step; item 6 reads the running run-level agent's chips — its run's resolution, a coordinator's withheld tools absent (REQ-MONITOR-060/061, live-run finding K1); item 3 reads the still-mounted view's Pause once the session rests `paused` — `Pause`, not `Pausing…` (REQ-MONITOR-296, 2026-09-29); item 4 records the rows just after the confirmed cancel (REQ-MONITOR-128's optimistic cancel, not asserted: it depends on the host's timing) and asserts the engine's record has overwritten them by 9 s (REQ-MONITOR-296, 2026-09-29), and that the cancelled child and its descendant each read `child_user_cancelled`, `child_end`, `child_result`, `child_conversation_closed` once (REQ-ORCH-098, 2026-10-01); item 4b cancels the run from the Mission view's run row and asserts that every snapshot taken after the confirm was handled (one selector list per sample, counted once the confirmation has closed) reads the subtitle and the run row `Cancelling` or the run at rest (the strip, which names no run state since fin10's REQ-SHELL-038 repair, is not read), never `Running` nor another active status; item 4c pops the run-level agent out from the inspector, confirms its window's Cancel (`ROTARIS_CAPTURE_PERSONA_CLICKS`) and asserts the same of the instance's state label — `cancelling` or at rest, never `running`; how many samples land inside the `Cancelling` window is host timing, recorded as `cancellingSamples` and not asserted (REQ-MONITOR-127/130, acceptance A35, OQ-165); since 2026-10-02 every fixed-instant persona probe reads a painted window — it waits from its instant for the window's first paint, bounded at 5 s, and logs the wait (item 8 records it as `personaProbeWaitedForPaintMs`, REQ-MONITOR-213); since 2026-10-07 (item 1e, PD-TOOLS-006 revision 6, OQ-220) a scripted coordinator that keeps a two-item list has a delegation naming the item another implementation child holds and one naming no item refused (since fin38 the latter's reason also says to add an item with `add_task` when none listed is the work, live-run finding Q3), and the named ones run with their items on the children's records; the scripted proofs whose coordinator delegates implementation after its list write `plan:<n>` open items, name them in turn and complete them with `done`, since 2026-10-13 one `update` per open item; since 2026-10-13 (item 1e, `PD-TOOLS-008` revision 2 and `PD-TOOLS-006` revision 7, OQ-249) each admitted delegation's observation says its PENDING item is now IN_PROGRESS, two items read active side by side while their children run, and none of the coordinator's `todo` calls is refused; since fin37 (item 1e, `PD-TOOLS-008` revision 3, OQ-255) the coordinator waits for both children to end and closes its plan as a model usually does, with one `replace` sending every item COMPLETED (the scripted `donereplace` step), which stores both items COMPLETED and names nothing kept, and the run completes in one iteration with no PD-ORCH-015 correction |
| | `git-proof` | the Git view and the worktrees, and the status strip's branch item: `main ↑1` after the accent-coloured branch icon, its tooltip REQ-WORKSPACE-020's sentence with its full stop, no icon with no git (launch 6, `no-git`) or outside a repository (launch 6b, `not-a-repository`), and those state words whole and never middle-shortened under a deep path; an unborn branch, a repository before its first commit, drawn as REQ-WORKSPACE-020's empty item — no text, no branch icon, no tooltip, no accessible description — for REQ-WORKSPACE-029's empty branch name (launch 6c, `unborn-branch`; `results.unbornBranch`; `docs/defects/fixed/the-status-strips-branch-item-draws-an-unborn-branch-as-a-branch-named-dash.md`); an isolated session's worktree branch with no marker before it has an upstream and `rotaris/session/<sid> ↑1` once it is one commit ahead of its own (launch 3b, `worktree-ahead`), the base sentence as its tooltip and the worktree named in its accessible description alone (REQ-SHELL-042, REQ-WORKSPACE-020, REQ-GIT-161, OQ-193); and no worktree cell, heading or body, painting into its neighbour or cut outside the two columns that elide — a bound row's `completed · ready` whole in its State column at 1440x900 and at the 1000x680 minimum, the base row's `main` whole beside its tags at 1440x900 (REQ-GIT-109, REQ-SHELL-022; `docs/defects/fixed/the-git-views-worktree-state-cell-overruns-the-ahead-column.md`); and a bound row's State cell drawing the presented status, `paused · ready` for a session persisted as `paused_message_limit` (launch 3c, `presented`; REQ-NOTIFY-048/049; `docs/defects/fixed/the-git-views-state-cell-renders-the-raw-persisted-execution-status.md`); and every row's Branch cell leaving room for at least its name's first character and the marker, a cut name cut by its own box's `text-overflow: ellipsis` (`runMarksElision`), no tag past the cell's edge, and every cell spanning its row, at both sizes — the base row's `m…` beside `base` and `active` at 1000x680 (UIR-002, REQ-GIT-077; `docs/defects/fixed/the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md`); and a configured `worktree_storage_subpath` honoured (launch 7, `configured-subpath`): an isolated session in a repository whose file names `trees/sessions` is bound, written and listed by Git at `.rotaris/trees/sessions/<sid>`, with no `.rotaris/worktrees/` created (REQ-GIT-073, REQ-CONFIG-068; `docs/defects/fixed/a-configured-worktree-storage-subpath-is-loaded-but-never-reaches-worktree-creation.md`) |
| | `terminal-proof` | the terminal grid, the pop-out window, the transcript preview (ADR-0047). Its live section spells the size probe, the motion command and the flood in the shell its harness reports (REQ-TOOLS-104). Before 2026-09-28 they were PowerShell everywhere, and off Windows four checks measured nothing (`docs/defects/fixed/terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md`). Since 2026-10-02 each key, click and wheel event waits until the page has counted it (`terminal-proof/fence.cjs`), and a fence that times out fails `harness.everyInputCounted`; the echo's 100 ms is read beside the host's load (`results.live.echoLoad`, OQ-176), and a red at a load average above the CPU count is run again alone. Since 2026-10-06 it runs a command longer than the PTY's input line through the real terminal manager and reads its status, its output and the window's grid (`live.longCommand*`; `docs/defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md`) |
| | `improvements-proof` | the reviewed-improvement lifecycle end to end |
| | `retrospective-proof` | the retrospective pass, driven from its surfaces against the built app (PD-LIBRARY-002); since fin42 (N58) launch 7 presses the gesture while a run's post-run analysis is held open (available beside it, queued behind it in REQ-LIBRARY-123's FIFO, then resting with its reason; both artifacts stored in order, revision 2 (e)), launch 5 reads the proposals card's empty label beside an empty artifact (g), and launch 8 runs the live `ask` scenario's own capture steps against the scripted provider — the Improvement analysis timeout set through Settings, a capture held until the run's analysis ends, the gesture pressed and waited for, then a 10 s limit and the notice naming it — the launch that found `fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md` |
| | `theme-proof` | the themes and scales, rendered — plus two counterfactuals that must stay red; since 2026-09-30 a text's contrast is read only from the part of it left on screen by the window and by every ancestor whose `overflow` is not `visible` (scroll, `hidden` and `clip` alike), and a fragment under one em is skipped with its size (`lib/text-sample.mjs`), so a status-strip item scrolled 1.2 px onto the screen no longer decides the verdict; since 2026-10-01 the contrast verdict is bounded by what it measured (`lib/contrast-coverage.mjs`: every capture needs a measured text inside its own surface and at most 25% of that surface's texts skipped, the run at most 10% skipped, skips counted by reason), and a third counterfactual, `theme-proof:counterfactual:offscreen`, pushes the Workspace view off the screen and must stay red |
| | `layout-proof` | the Workspace view's grid, **measured** at the sizes the specification names, a task whose text is one unbroken token kept inside the plan column (REQ-SHELL-022), and (section 7) the status strip's path link shortened from the middle at 1180 px under a deep workspace path, its head and folder name kept with one `…`, unclipped, the short branch name `main` beside it drawn whole, and re-measured at 1400 px (REQ-WORKSPACE-149 rule 2; `docs/defects/fixed/the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md`) |
| **Requirements** | `requirements-proof` | the delivery store and the board (ADR-0041); since 2026-10-02 its `ready-restart` stage quits and relaunches the built app over a card resting in `ready` and starts it from the queue's disclosure, its `ready-restart-automatic` stage has an automatic queue start such a card at the relaunch with nothing clicked, and its `disclosure-launch` stage shows one plain acceptance holding for the rest of the launch and the disclosure due again in the next (`review-rerun` and `blocker-resume` take their second run-starting action in a relaunch for that reason) |
| | `requirements-runs-proof` | runs started from the board, against a real scratch repository; its sixth assertion stands a second workspace service in for a relaunch and starts a card resting in `ready` from the queue on its recorded tree, and its seventh has automatic scheduling pick one up after a relaunch once the disclosure is suppressed permanently, the published queue naming it `next` before the dispatch (kicked, since 2026-10-02, through the coordinator's `opened`, as main's workspace open kicks it); its eighth rejects a reviewed card and has its next unit start on a fresh worktree beside the kept one |
| | `traceability-proof` | the traceability engine, including spike 7's scale store (ADR-0040) |
| **The record itself** | `directive-proof` | that a directive's precedence over a requirement is machine-checked, not asserted in prose |
| **Whole product** | `slice-proof` | sign-in through the product and one run on a real model — since 2026-10-02 (R-068) the live-run registry's endpoint (`~/.rotaris/live-run/endpoints.json`: its default, or `--endpoint=<name>`) with its stored key; `--paste-key` for one whose key is not stored. It asserts only what a requirement fixes about the model's answers (`lib/live-answers.mjs`), and every red is kept under `.proof/slice-proof-reds/`. Runs on `live-run`'s terms ([When to run it](#when-to-run-it)) |
| | `driver-proof` | the driver seam `pnpm app:drive` depends on — and that its `quit` brings a live run to rest, its shot straight after a navigation shows the new view, and it answers an approval in its dialog and probes a persona window; scenario 13c holds two main windows on two workspaces and asserts that a persona window's `config.read` and a terminal window's `session.list` answer for the main window that owns them, not the active one (REQ-MONITOR-069, REQ-STARTUP-163; `docs/defects/fixed/a-persona-windows-commands-answer-for-the-active-main-window-not-its-owner.md`); since 2026-10-07 launch 13d quits while a foreground `terminal` call runs and reads its record `interrupted`, with no exit code and no issue (PD-TOOLS-013; `docs/defects/fixed/a-foreground-terminal-call-the-run-cancels-reads-as-a-timeout.md`) |
| | `ui-audit` / `ui-review` | what the browser **built** at every size; the deterministic pack a report-only critic reads |
| | `live-run` | the built product against a real endpoint and a real key — **money; never automatic** against a metered endpoint. Since 2026-10-02 ([R-068](docs/product/requests.md#r-068)) the registered default (`katalyst`) is self-hosted and registered `unmetered`, and the owner's authorization to run against it is standing ("never ask for my persmission for it. you always have my permission."): it spends nothing and is run without asking, though still never by `pnpm check`, a hook or CI |

## Repository UI skills

Three portable workflows live under `.agents/skills/`, where REQ-WORKSPACE-051 makes them discoverable from
this repository: **`build-ui`** for creating or substantially restyling a surface, **`debug-ui`** for a bounded
rendered defect, and **`review-ui`** for a report-only external critique. Their `.claude/skills/` entries are thin
compatibility routers; the portable files are canonical.

A fourth, **`orchestrated-build`**, drives a large body of work (a release backlog, every open defect) through a
multi-agent workflow: per bundle an independent reviewer that repairs in place and lands it, repair rounds,
acceptance with the proof sweep and live runs, and recovery from container restarts out of the workflow journals.
It improves itself under the guardrails its `SKILL.md` states; `pnpm check` runs its self-test.

A fifth, **`run-autopsy`**, is the post-run forensic skill: it reads a live run's launch log, session store and
transcript as evidence and writes a fixed-schema friction and defect report, and the orchestrated build's acceptance
autopsy follows it (the profile's `autopsy.method`). Every portable skill has its thin `.claude/skills/` router, and
`tools/skill-routers.test.ts` fails on one without (run-autopsy's was added on 2026-10-13).

`build-ui` and `debug-ui` may change source within the authority of the current task. `review-ui` writes only
evidence under `.ui-review/`. Its critique is proposed evidence and reaches implementation through a separate,
authorized build or debug pass. A complete review loop has at most three iterations.

## Driving the built app — `pnpm app:drive`

The fastest way to see what a surface actually does without editing a proof script and waiting out a
launch. It spends nothing, talks to no provider by default (the scripted dialect), and runs against a
scratch profile under `.drive/`. Full usage is in the script's own header
(`apps/desktop/scripts/drive.mjs`) — `pnpm app:drive` with no command prints it.

```
pnpm build                                  # it drives the BUILT app, so build first
pnpm app:drive start [--workspace=PATH] [--fresh] [--dialect=scripted]
pnpm app:drive start --env=ROTARIS_APP_LOG_LEVEL=debug   # log every level; an exported variable never reaches it
pnpm app:drive waitFor ".app-shell"         # waits for it; never a fixed sleep
pnpm app:drive click ".nav-item" --text=Git
pnpm app:drive inspect ".composer"          # boxes, attributes, text, what holds focus
pnpm app:drive shot screen.png              # a PNG you can open, or read in a transcript
pnpm app:drive log --tail=40                # what the app printed: info and above unless started as above (PD-MONITOR-002)
pnpm app:drive windows                      # main windows, and each one's persona, approval and terminal windows
pnpm app:drive useWindow persona:coding-agent   # later commands act on that window; no name: the active main window
pnpm app:drive probe "#approval-title" --window=approval   # --window= on any command: that window, that command only
pnpm app:drive stop                         # the application's quit: close guards, then the run host's shutdown
pnpm app:drive stop --crash                 # the immediate exit: a live run is left as a crash leaves it
```

`stop` is a person's quit: a live run comes to rest with the stop reason `application_shutdown`, and `stop` waits for
the process to end; a close guard that keeps the application (unsaved settings) leaves it driven so the dialog can be
answered. `stop --crash` is the immediate exit, for a drive that means to leave a crash for the next launch to repair.

A window is named by its index in `windows`, by a suffix of a main window's workspace path, or by a role:
`persona:<persona>` (that persona's window), `approval` (the open approval dialog, answered with its own buttons) or
`terminal` (the terminal window). A name that matches no open window is refused with the list of what is open.

`click --settle` presses only once the match has held still across two frames and is what its centre would press, and
fails when the press met something else, naming it: use it for a control that a notice, a new row or a resize can move
between the measurement and the press (driver-proof's Pop out, 2026-10-06; a plain `click` is unchanged).
`type` types a line break as Shift+Enter, the composer's newline (REQ-CHAT-001), so a multi-line text keeps its breaks and
is submitted only by `--enter`; the capture seams' typed steps do the same.

`command` is relayed to main's own `runCommand` — the same path the renderer's channel reaches — so driving a
command drives the product, not a stand-in for it. The seam (`apps/desktop/src/main/driver.ts`) exists only
when `ROTARIS_DRIVER` names an endpoint file at launch; it is verification only, and `pnpm driver-proof`
is its proof.

Two habits worth keeping: **`shot` produces a PNG an agent can read directly** (it waits four of the renderer's
frames first, so it is never the frame before a click or a navigation; its reply's `painted: false` says a window
presented none), which is the cheapest way to meet
`CLAUDE.md`'s "match after drawing" obligation; and a step that needs a condition should `waitFor` it rather than
sleep, because the reason this seam exists is that fixed offsets have produced false reds three times.

## The live run — `pnpm live-run`

Every other check in this repository answers the model itself. `pnpm test` uses scripted clients; each
`*-proof` script scripts the dialect or the run host. They prove the mechanism and they cannot prove that the
product works against a real model: a real endpoint, a real key, a real catalogue, real tool calls, a real
workspace changed on disk.

`pnpm live-run` does exactly that, against whichever OpenAI-compatible endpoint the owner registered, in a
throwaway workspace, for a few cents.

### When to run it

After a major feature lands — a part closed, a lane merged, a store migration, anything that touches the run
loop, the tools, the providers or the shell. It is a smoke test of the whole product, not a unit check; it does
not replace the part's own proof, it follows it.

It is **never** automatic. It is not in `pnpm check`, `pnpm test` collects nothing from it, and no hook or CI
step may call it. It runs when the owner asks for it, or when an agent asks the owner and is told yes.
An agent must not run it on its own initiative: it costs money the owner pays.

**Against the registered self-hosted default, that last rule is already answered** ([R-068](docs/product/requests.md#r-068),
2026-10-02). The default endpoint, `katalyst`, is the owner's own server, registered `unmetered`, and the owner's
authorization to run against it is standing: "you may do the live run.never ask for my persmission for it. you always
have my permission." A run against it spends nothing and is not asked about again; it is still never automatic in the
sense above (no `pnpm check`, hook or CI step reaches it). The rule stands unchanged for every **metered** endpoint
(one whose registry entry does not say `unmetered`, OpenRouter among them): such a run spends the owner's money and is
asked for first. `pnpm slice-proof` signs into the same registry since that day and runs on the same terms.

An owner's yes is not always enough in an agent session. On the Linux agent host, the harness's automatic permission
classifier has refused some `live-run.mjs --confirm` launches as a real-world transaction even where the owner authorised
the run (R-066, R-067; [`docs/defects/fixed/no-live-run-has-executed-on-merged-main.md`](docs/defects/fixed/no-live-run-has-executed-on-merged-main.md)).
On 2026-09-30 it refused the launch over the default scenarios and the long `duress` launch, while it admitted targeted
`--only=ask` and `--only=ask,edit` runs on repair branches the same day. Which launches it admits is not established, so
an agent does not predict it. An agent that meets that refusal stops, and it does not reach the run by another route,
such as splitting the refused launch into admitted `--only=` pieces. It records the refusal where its task lives and
says so in its report. Only the owner can close the gap: by allowing `node apps/desktop/scripts/live-run.mjs --confirm`
for agent sessions in the harness's permission rules, or by running the command by hand.

On 2026-10-01 both refused launches ran on merged `main` `71ad8e8` and printed `live-run PASSED`. The orchestrating
session launched them after the owner authorised live runs in its conversation. Since 03:23 that day, the owner's
allow rule for the `--confirm --skip-build` launch forms has stood in the host's git-ignored
`.claude/settings.local.json`. `.agents/skills/orchestrated-build/references/live-runs.md` lists those forms. A
session that does not hold that rule, or a launch in any other form, can still meet the refusal, and the paragraph
above still governs it. `main` has moved past `71ad8e8` since, so a live run of the head that would be released is
still owed, and it is asked for like any other.

### Registering an endpoint, and storing its key

Any OpenAI-compatible endpoint works — a self-hosted or custom model as readily as a hosted one. Register it
once (`pnpm live-run --add-endpoint`; `pnpm live-run --endpoints` lists what is registered). The full flag
list is in the script's own header (`apps/desktop/scripts/live-run.mjs`, `USAGE`) — `pnpm live-run --help`
prints it.

The registry is `~/.rotaris/live-run/endpoints.json`. Keys live beside it, one file per endpoint, never in this
repository and never on a command line: on Windows `~/.rotaris/live-run/<name>.key.dpapi`, encrypted with DPAPI
— readable by **this account on this machine** and by nothing else — with the file's ACL reduced to the owner;
elsewhere `~/.rotaris/live-run/<name>.key` at mode 600. Where DPAPI is unavailable the key goes into
`<name>.key` with an owner-only ACL, and the script says so — the weaker protection is never silent.
`ROTARIS_LIVE_API_KEY` in the environment wins over the stored file, for a one-off or a machine where the hidden
prompt cannot run.

The script substitutes the key out of every log it writes and then asserts that no log holds a bearer or
anything shaped like an API key; the sign-in goes through the product's own dialog, so the credential lands in
the sandbox's credential store the way a person's would.

### Running it

```
pnpm live-run                        # the plan, the endpoint, the ceiling, the key's source — it does not spend
pnpm live-run --confirm              # the run, against the default endpoint
pnpm live-run --confirm --endpoint=openrouter
pnpm live-run --confirm --gui        # the same run, with the window on screen to watch
```

`--confirm` is required. The full flag list (`--endpoint`, `--model`, `--base-url`, `--budget`,
`--max-tokens`, `--only`, `--max-iterations`, `--gui`, `--keep`, `--skip-build`, `--keep-runs`,
`--session-log-level`, `--app-log-level`, `--no-record-traffic`, `--duress-fixture`) is in the script's own header —
`pnpm live-run --help` prints it.

**The bundled code-intelligence runtime is a precondition.** With `--skip-build` a tree without it refuses at once, naming
`pnpm code-intel:bundle`; without `--skip-build` the run builds it before the first launch. Every launch then states
whether its code-intelligence discovery succeeded (a failure, or a listing of no tool, is a FAIL; a launch that starts no run is a NOTE). Until
2026-10-03 a `--skip-build` run on a tree without the bundle passed while code intelligence never ran
(`docs/defects/fixed/the-live-run-runs-without-the-code-intelligence-bundle-and-passes-without-saying-so.md`).

**The default scenarios measure several mechanisms at once, so a feature is proved working beside the others and
costs no scenario of its own.** `edit` splits REQ-103 between two children writing in parallel under declared write
scopes (PD-TOOLS-006), and every scenario that reads a session asserts its price exactly (PD-MONITOR-001 revision 2).
A new mechanism joins an existing scenario where one exercises it; a scenario of its own is the exception.

**One scenario is not in the default set and only runs when named**: `duress`, the long run. The ordinary live
run is a smoke test and stays one; a scenario that trebles its wall clock belongs behind `--only=duress`, and a
scenario nobody can leave out is a scenario people stop running.

The `requirements` scenario waits for the board rather than for a clock: every press after the release
names the state it needs, `LIVE_RUN_BOARD_MS` (900 s) is the deadline for all of them, and the capture
ends when the accept lands. A quick model does not pay the deadline; a slow one fails **once**, saying the
window expired, and the presses it never made are noted rather than reported as faults of the board.

The run is **unattended and the window is hidden** unless `--gui` says otherwise. `--gui` changes one
thing, `windowsHide` on the spawn: the scenarios are driven from inside the main process with
`sendInputEvent`/`executeJavaScript`, which need no focus, so watching cannot disturb the run and the
evidence is byte-identical either way. Typing into a shown window does reach the product, so watch it
rather than use it.

### What it costs, and what stops it

Two bounds always hold: the model the owner chose, and `runtime.max_iterations` written into the sandbox's
`agents.yaml`, so one confused run cannot spend the lot. The third is whatever the endpoint allows, and the
script names which one it used rather than implying a number it cannot know: **nothing** for an endpoint
registered `--unmetered` (the owner's own hardware — tokens counted, nothing stopping on them, unless the
invocation names a ceiling itself); else the **provider's own figure** (OpenRouter's `GET /key`); else the
**registered prices** over the store's token counts; else **tokens alone** against `--max-tokens`.

Crossing whichever ceiling applies stops the run there, records the figure and reports a failure.

**`--max-iterations` defaults to 500, raised from 15 on 2026-09-22 by the owner's decision.** Fifteen was a
bound while every scenario was a short task; the long run made it the thing being measured rather than a bound
on it — a delegating run reaches 15 while it is still commissioning, and then reports its own ceiling as a
result about the product. What the raise gives up is worth knowing before running against a metered endpoint:
the accounting gate between scenarios still holds, and so do `--budget` and `--max-tokens`, but there is no
longer a tight bound **within** one run. The endpoint it was raised for is registered `--unmetered`, where the
cost of a long run is wall clock. Name `--max-iterations` yourself on an endpoint that charges.

`--context=<tokens>` is for an endpoint whose `/models` payload does not declare a context window in a key
discovery reads — vLLM's `max_model_len` is one such. The number is written into the sandbox's `agents.yaml` as
`max_input_tokens` on a `models:` entry that **replaces** the snapshot layer's entry for the same model as
a whole (provider, `model_id`, `auth_provider`, `base_url` with it), which is what keeps the leased bearer
reaching the right endpoint.

### What it does

The workspace is a copy of `apps/desktop/scripts/fixtures/todo-app` in the system temp directory — a small
React todo application, its `docs/requirements/`, pure list functions in `src/todos.js` and a `node --test`
suite that needs nothing installed. It is committed to a fresh Git repository before the app opens it, so the
change can be read back from `git diff`. Its store is the conventional shape of `REQ-TRACE-002` — an epic at the
root and its children in the sibling directory — and its identifiers are `REQ-TRACE-022` identifiers, so the
requirements board can read it as readily as the agent can. Two requirements are approved and deliberately
unimplemented, one per path: `REQ-103` (clear the completed todos) is the work the third scenario hands over in
the composer, and `REQ-104` (count the completed todos) is the work the fourth releases from the board, so
neither path depends on what the other did.

| Scenario | What runs | What is asserted |
| --- | --- | --- |
| `sign-in` | Settings → Models → Add endpoint, filled and pressed in the product's dialog | the credential file, the snapshot's authenticated record, the catalogue, the bootstrapped `agents.yaml` read by its starter content (since 2026-10-03, acceptance F3: the file's existence alone, which initialization's record satisfies, was checked before), no credential in any log, the outcome's model count worded with no literal "(s)" (REQ-SHELL-044; live-run L11) |
| `ask` | one real run: read `src/todos.js`, answer; since fin42 (N58) the Improvement analysis timeout first set to `LIVE_RUN_ANALYST_TIMEOUT_S` (default 300 s, the control's 10–600) through Settings › Runtime and Save, the capture held until the run's post-run analysis has ended, then `ask-retrospective`: the Library's retrospective gesture pressed (Ctrl+6, Proposals) and let finish; `agents.yaml` restored after | the leased bearer, a request to the endpoint, a completed session, settled tool rows, usage figures, an answer naming the real exports; the post-run analysis seen and ended, one artifact for the run with proposals or the timed-out notes (a NOTE names a timeout, and one that proposed nothing is a NOTE), and the notice that outcome owes (REQ-LIBRARY-124, REQ-NOTIFY-100); one retrospective artifact with no session that read the ask session, its notice, and the run host's "at the workspace root" line listing `workspace:` files alone (PD-LIBRARY-002 revision 2, OQ-235) (`lib/analysis-reading.mjs`) |
| `edit` | one real run: implement `REQ-103` through two scoped children, each told to run the suite in the terminal (the orchestrator holds none: `coordinator_only`, REQ-TOOLS-006), the plan closed with one `replace` once both have reported (`PD-TOOLS-008` revision 3, OQ-255) | `clearCompleted` exported and tested, a child's terminal call running `node --test` and none by the orchestrator, the session's tool-call total agreeing with the ring across every agent (`REQ-MONITOR-102`), `git diff` non-empty, and **`node --test` run again by the script itself** — the agent's own report is never the evidence |
| `resume` | one real delegating run, paused through the composer's Pause while a child runs and continued through its Continue (`PD-ORCH-005`) | the paused composer drew its children `paused` with the Continue action's count; the timeline's `iteration_paused` by `pause` and `iteration_resumed` for the same iteration; every child paused by the pause resumed under its own task id; each one's `agent_messages` continue across the pause, and its next request carried what it recorded last; the iteration closed `succeeded`, the session completed, and **both notes it asked for are read back from disk** |
| `requirements` | the board: `REQ-104` selected, the move control pressed, the release confirmed, the run watched to review and its decision taken | the card's own trail `backlog → running → review → done`, exactly one release and an accept in the delivery history, the run record carrying its session identifier and the permissions it was granted (`REQ-TRACE-464/472`), real usage from the endpoint, the run confined to a worktree of its own, `completedCount` exported and tested **inside that worktree**, and **`node --test` run there by the script itself** |
| `shell` | a relaunch with no prompt | Overview painted from the store: the sessions the runs left, the repository card's branch |
| `frictions` | one real run engineered to trip the inducible autopsy frictions, read back from the store; since 2026-10-13 its write is asked with only `path` and `content` (PD-TOOLS-007's inferred create, fin42) | first-use `write_file` with no operation repair, every settled create reporting the lines its content holds (a final newline ends a line; live-run L6), SIGINT delivered with no platform refusal, every call the tool gate refused as `invalid_request` referenced by a `tool_error` issue (REQ-SESSION-136, live-run a71-6) and PD-TOOLS-007's and PD-TOOLS-008's readings — since fin23 these three are read at the end over **every session the run kept**, not this one alone, a refused call's arguments read from the cut string the record stores them as, and a shape no session held is a NOTE naming the sessions read; since fin25 each session's create-shaped refusals are judged by the fence its own record names (a requirements run's worktree, not the workspace) and the create shape is the product's own (`createOnlyTarget` and the schema the gate applies) — **red by design until the fixes land**; the exit-trace friction is not induced here (it needs a crash: since 2026-10-13, fin42, `pnpm exit-trace-proof` fires its crash handlers in the built app), and the stall-abort one moved to `faults`; since 2026-10-06 (K3 of the live run at `c2fdd6a`) the root's requests — those carrying the direct-work statement, read from the recorded traffic — give its ROUTE slot the entry role's wording, never "the coordinator routed it to you"; since 2026-10-06 (M3 of the live run at `c2a9444`) a launch of its own after the probe (`frictions-cut`) runs one command that fails with about 5,000 characters of output, whose record must be cut to 2,000 characters ending with REQ-SESSION-194's `...`, and every session's error-path records are read at the end the same way (a result over 2,000 or unmarked at 2,000, or arguments stored as a string, is a FAILURE; `lib/error-record-cuts.mjs`); the probe's write with no operation read as a create, its result saying so and its record storing the create (PD-TOOLS-007; a write that named its operation anyway is a NOTE). The exit trace's crash handlers are fired by `exit-trace-proof`, not here |
| `faults` | three runs against an endpoint the proxy makes misbehave: a 429-then-500 ladder, a stream that stops mid-answer with the socket open, and a tool call whose arguments stream slowly | the ladder run still completes, and each injected refusal left the trace of the layer that retried it — the session log's dispatch-layer line or the ladder's own issue (OQ-110), never the call count alone; the stalled run does **not** report `user_cancelled` with nobody having pressed anything (defect 82's shape), **and the product is shown to have noticed the stall** in its own `issues` row — the negative alone would pass on a run that met no fault at all; and, since 2026-09-30, the entry agent's own stall watch wrote REQ-MONITOR-119's `stall` issue (`agent appears stalled: …`) before the idle bound, with a photograph taken between the two (`faults-stall.stalled.png`, OQ-153); and, since 2026-10-06, every stall wrote that issue no more often than its throttled warning (PD-MONITOR-005 revision 2: at entry, then no sooner than REQ-MONITOR-120's repeat; `lib/stall-issue-cadence.mjs`), where an issue at every evaluation passed before; and, since 2026-10-07, a third run (`faults-args`) whose tool-call arguments the proxy streams slowly under a 10 s stall threshold: no agent is reported stalled while it streams them, and the paced span must outlast the threshold for the run to count (`lib/paced-arguments.mjs`) |
| `terminal` | one run issuing the commands the record names verbatim: a multi-line here-string, forty long lines, off Windows a here-document of about 4.7 KB, longer than the PTY's input line (live-run M1, since 2026-10-06), off Windows an `exec bash` that replaces the session's shell (acceptance A9, OQ-144), off Windows a bash-ism `/bin/sh` cannot expand (live-run L1), off Windows an `exit 3` that ends the session's shell (OQ-144's sibling case), a wedge with no `timeout` and one empty poll of it (live-run L2), then `C-c` with `is_input` and one poll after it (OQ-147), a second wedge and a command issued while it is soft-paused (OQ-164), an exit-0 output carrying docker's lower-case `failed to connect` line, a `git diff` exiting 1, a pipeline through a pipe, and last (since 2026-10-13, fin42) `steady`, a command printing every 2 s for 130 s with no `timeout` | the here-string terminated; all forty lines arrived, none concatenated, none carrying an escape sequence; the long here-document ended inside the no-output window at exit 0 with its own byte count, never a soft pause with `>` (a copy the model sent shorter than 4,096 bytes is a NOTE: the line may have fit); the shell replacement ended at once as an `execution_error` with no exit code, never a soft pause, the session was restarted on its own shell (`kill_status` `session_reset`), and the next command the same agent issued met `/bin/sh` again (a next command from another agent, whose foreground session is its own under REQ-TOOLS-187, is a NOTE); the bash-ism ended at once with the shell's own error status, never a soft pause; the `exit 3` ended at once as an `execution_error` with no exit code, never a soft pause, the shell was respawned (`kill_status` `session_reset`), and the same agent's next command reported `session_reinitialized` true; a call with no `timeout` was still bounded; the poll stated no more waiting than had passed and did not claim the no-output window; the poll after `C-c` handed the wedge over as ended without an exit status of its own, never as still running; the command issued behind the second wedge named it and how it ended, with what it wrote (`slept`), never only its own exit; the docker line printed at exit 0 was neither `suspicious_success` nor given a failure-marker warning (`PD-TOOLS-003`); exit 1 from `git diff` was not `shell_failure`; **no end marker in anything the model read**. The pipeline is a NOTE — its deny fires as its requirements specify — and a shape the model never issued is a NOTE too, **but a run that ended `failed` before any terminal call fails the scenario** (one stopped otherwise before any is a NOTE), so a dead run is never green (`terminalRunEndReading`); `steady` was ended by the 100 s default hard cap (REQ-TOOLS-097's `hardMs`, REQ-CONFIG-116) between 100 and 130 s, never by the soft pause or its own end, with `session_reset`, its printed lines kept and the reset's report (the silent wedge soft-pauses 70 s before the cap, so the cap is read here; a `timeout` the model supplied anyway is a NOTE) |
| `cut` | since fin42 (N51): one run asked for a single foreground `terminal` call, `echo started > CUT-STARTED.txt && sleep 60` with a 90 s timeout; once its record is open and the file marked, the harness quits the application by SIGTERM (`lib/cut-scenario.mjs`) | PD-TOOLS-013 against a real model: the cut call recorded failed with failure and outcome kind `interrupted`, no exit code, `"timeout":false` and a session reset, its result saying the run cancelled it and never that it exceeded its timeout; no `terminal_timeout` or `tool_error` issue; `summary.md`'s Tool outcomes counting it under `interrupted` with Timeouts 0; the run not `failed`. A model that never ran the sleep, or ran it with no timeout (soft-paused, so no longer in flight), is a NOTE: nothing was cut |
| `crlf` | since fin42 (N52): three CRLF, tab-indented files generated into the sandbox and removed after, and four edits asked for with the tool named — a two-line `haet_edit`, a three-line `write_file` window edit, a `write_file` insert, a `replace_all` whose `new_string` is two lines (`lib/crlf-scenario.mjs`) | no line of a file only edits and inserts touched lost its `\r`; an insert and a multi-line replace-all that landed say they wrote the file's CRLF endings wherever the tool had a `\r` to add (a `new_string` or `content` the model wrote CRLF itself owes no sentence); a run that completed. Which shapes the model sent, the near-miss reading (misses, retried, probed, ambiguous) and the level the window edit reached are NOTEs, except that since fin43 (`PD-TOOLS-019`) a level-4 window edit whose `old_string` was a uniform indent off FAILS, a level-3 one must land at the file's depth, and a level-3 `haet_edit` near miss with an LF `old_string` must name the line endings; a file the model overwrote, or touched from the terminal, is a NOTE |
| `cutoff` | **opt-in** (`--only=cutoff`, a few minutes, since fin42): Settings › Runtime › Per-agent timeout set to `LIVE_RUN_CUTOFF_MIN` (default 1, whole minutes 1–240) through the control and its Save (`lib/settings-runtime-field.mjs`); one run delegating a child more work than that; then the session reopened from the Sessions browser and a follow-up asking for the continuation offer to be taken. `agents.yaml` is restored after | the control's Save stored `child_timeout: <min×60>` and the run read it; a child cut off at it ended `failed` with "Child timed out after <N>s" and, making progress, the offer; the sidebar's timed-out tag reads PD-CONFIG-003's line in the minutes form (revisions 3 and 4, CN1); each cut-off child's summarising request opened its facts with OQ-217's "Outcome of this agent, not of the session: failed — Child timed out after <N>s.", its summary's first sentence states the limit and never opens "The run failed", and no `child_result` entry of a completed session relays "The run failed" (D9); a continuation taken was delegated by the later run's root (PD-ORCH-004 revisions 3 and 4) (`lib/cut-off-reading.mjs`). No child reaching the limit, and an offer the follow-up's root does not take, are NOTEs |
| `delegation` | (since 2026-10-13, fin42, N57) three launches: `delegation`, the orchestrator's `delegates_to` set to `codebase-analyst` and `docs-writer`, asked to delegate one child, attach its report artifact to a second through `attach_artifacts`, and follow the first up by `session_id`; `delegation-edit`, that session reopened, its latest artifact edited and saved in the Library's inspector, and the session continued; `delegation-swarm`, `rotaris.delegation_strategy: swarm` on a three-part change | the root's `delegate` catalogue narrowed to its list and any delegation outside it refused naming it (OQ-229); an attachment given whole, the observation and the child's `context_selection` entry agreeing (PD-TOOLS-006 revision 5); the follow-up accepted under the child's own task id with its `child_resumed` entry (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22); the edit stamped `edited_at` and kept `key_findings`, and the continued run's first root request carried the edited document marked `edited` with no frontmatter (PD-LIBRARY-003 (c), (e)); the swarm root told and offered what the mapping in force says (PD-ORCH-006 revision 3, REQ-ORCH-025). What the model did not ask (no attachment, no follow-up, an edit the Library timing missed) is a NOTE; PD-MCP-002's agents in different trees cannot arise as built and are not asked |
| `rename` | **opt-in** (`--only=rename`, a few minutes, since fin42, N59): one coding-agent child asked to rename the fixture's `remaining` to `countRemaining` with the code-intelligence `rename_symbol`, then run `node --test` | the first rename row `ok`; `src/todos.js`, `src/App.jsx` and `src/todos.test.js` no longer calling or importing `remaining`; the renaming child's stored report and child-report artifact listing every one of the three that changed (OQ-245); `node --test` green, run by the harness; the workspace's three files restored afterwards. No rename call is a NOTE, "not reached"; a rename with no reference search of the agent's own before it that left the importing files behind, or had them mended by another tool, is a FINDING against `PD-MCP-004` (until fin43 a NOTE naming OQ-273; `lib/rename-reading.mjs`) |
| `plan-open` | **opt-in** (`--only=plan-open`, a few minutes, since fin42, N56): two runs whose prompt has the coordinator write a three-item plan and answer with the third item `PENDING`; `plan-held` also tells it to answer a correction with one word | `plan-open`: one "a correction is sent" warning, the correction in the root's own conversation saying the answer was shown, no answer re-prompt, one iteration `succeeded`, `completed` / `tasks_complete`; `plan-held`: PD-ORCH-015's held `system` row and the next fresh root's first request carrying the marker and an answer of the session labelled as the one the person was shown, its outcome noted. A root that closed its plan before answering is a NOTE, "not reached" (`lib/plan-open-reading.mjs`) |
| `empty-answer` | **opt-in** (`--only=empty-answer`, a few minutes, since fin42, N56): the recording proxy's `empty` rule answers the coordinating root's completions (`You are the orchestrator.`, the classifier excluded) with no content and no tool call, `stop` — both of them (`empty-answer`), then the first only (`empty-once`) | exactly one re-prompt sent and logged in each; `empty-answer`: "The run ended without an answer: …" and one warning `incomplete_execution` issue (`reprompted`, `run_ended`); `empty-once`: neither (PD-ORCH-009 revision 2) |
| `duress` | **opt-in** (`--only=duress`): one delegating run of **three dependent waves, six children**, under `LIVE_RUN_DURESS_MS` (default 40 min) against `--duress-fixture`, its Per-agent timeout at `LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN` (default **45 min**; OQ-214 re-ruled 2026-10-07, PD-CONFIG-003) | the run host's `child_timeout=<s> s` equal to the Per-agent timeout the harness wrote (`duress/agents.yaml` in the pack, `childTimeoutS` in `results.json`, a NOTE naming any value but the 1200 s default); the result inside the wait, with **where the time went** (endpoint, tools, launch, the product with nothing in flight; since 2026-10-06 a wait on children — `wait_for_tasks`, a `delegate` that waits — counts as what the children were doing, never as tools, so a pack recorded before then reads a higher tools figure and a lower product figure than the same run would now: 18 s and 2 s at `27a5127`, 12.1 s and 7.9 s re-read, `docs/defects/fixed/the-duress-time-split-counts-a-parents-wait-on-its-children-as-tools.md`) — an overrun the endpoint held while the run progressed — read only from requests and tool calls that ended on their own, never one the quit cut off — is a NOTE that the window was the bound; the autopsy's coherence section is clean (no null summary on a stopped run — `unasked`, a NOTE, for a session that never stopped — and no tokens against a zero cost where a request had a figure — the reader reads `cost_qualifier`); no child ended `failed` with nothing to say (`final_response`, `last_response` and `cut_off` each count, REQ-ORCH-110; an error entry alone does not — the product writes one on every failed child, and the eighty-second defect's children carried nothing else); a child that ran commands, found by its canonical name, reported them; the `compressions` aggregate agrees with the timeline; every call the tool gate refused as `invalid_request` is referenced by a `tool_error` issue (REQ-SESSION-136, live-run a71-6; `scripts/lib/refusal-issues.mjs`). Length, children and compressions are **reported** — a run that never compressed names its largest prompt against the REQ-CONFIG-134 trigger — so a run that was not duress says so. Readings in `scripts/lib/duress-checks.mjs` |

**Over every session the run kept, at the end** (besides the tool-record readings under `frictions`): since fin27 (OQ-213,
live-run finding K2) no coordinator's second work item ran before it wrote a todo list of its own, and every session whose
root ran two or more stores an agent plan (`lib/coordinator-todo.mjs`); each call the gate refused for want of a list is a
NOTE. By the K2 finding, the edit, resume and frictions sessions of the packs at `c2fdd6a` and `c2a9444` would have failed both.
Since fin32 (PD-TOOLS-014, OQ-231, live-run finding D5) a NOTE counts the `haet_edit`/`haet` misses that named a match level,
those followed by a terminal call of the same agent before its next edit (the directive's target is 0) and those whose next
edit succeeded on the same path (`lib/near-miss-edits.mjs`); a run with none says so. Since fin36 (PD-TOOLS-014 revision 2,
OQ-252) it also counts those whose next edit on the same path was refused "Found N occurrences" (target 0).
Since fin33 (`PD-TOOLS-008` revision 2, `PD-TOOLS-006` revision 7, OQ-249) no coordinator's plan records a running child's item
`PENDING` and none closes an item an implementation child still holds (`heldItemReading`, `lib/coordinator-todo.mjs`), with
single-active refusals in coordinating sessions a NOTE; since fin37 (`PD-TOOLS-008` revision 3, OQ-255) no closing `replace` leaves an
item IN_PROGRESS once every child serving it has ended (`restoredOverClose`, target 0; since fin41 a NOTE that the close is
unasked when no coordinator sent one, `closes`, and the `edit` prompt asks for one closing `replace`), and a `replace` that named a task it kept
over a different state is a NOTE (`namedRestores`); and (`PD-TOOLS-006` revision 8, OQ-250) a NOTE counts `delegate` calls
refused for a `write_scope` given to a persona that cannot write files and child calls of a tool they do not hold
(`lib/routing-misses.mjs`; OQ-216's target is 0 for each, the duress run at `a68f121` had one of each). Since fin38 (`PD-TOOLS-006`
revision 9, OQ-257) the write-scope refusals are read against a bound — at most one a run, each re-routed by the coordinator's next
`delegate`, the seconds to it printed — and a scenario over it is a NOTE of its own; and (OQ-256) a NOTE counts each hand-off answer
a child received cut, by the block's marker in its recorded messages (`lib/hand-off-cuts.mjs`; target 0 for answers of 100,000
characters or fewer; the duress run at `552d346` had two, under the 4,000-character block revision 9 replaced).
Since fin41 (item N67; OQ-258, `PD-ORCH-011` revision 2) a NOTE gives the intent classification per launch — category,
confidence and rung, or the fallback and its reason, from each session's launch audit; the seconds from the session's start to
its `intent:` line (`run_intent` has no elapsed field); each cut's bytes received from the recorded traffic, 0 being a queueing
endpoint's — and counts the fallbacks and cuts, naming OQ-258's reopening limb where 3 in 10 launches were cut after bytes
arrived (`lib/intent-reading.mjs`). Read over the `0bc3eee` pack it gives what that pack's autopsy found by hand: 10 launches,
1 fell back, the requirements cut at 12.0 s after 91,112 bytes, the other nine 2.4 to 9.8 s on the strict rung.

An endpoint that discovers no model catalogue is not a dead end. The sign-in takes the dialog's own "Continue
anyway" (the zero-model recovery), the catalogue check is recorded as a **NOTE** rather than a silent pass, and
the script writes the `models:` entry the run needs into the sandbox's `agents.yaml` by hand — provider,
`model_id`, `auth_provider`, `base_url`, and the prices if they were registered — which is the same shape the
snapshot layer would have produced (`REQ-CONFIG-082..097`, `REQ-PROVIDER-091`).

### The evidence pack, and what it is for

Evidence lands in `.live-run/runs/<stamp>/` (gitignored). **Packs accumulate** — `.live-run/latest.txt` names the
newest and `--keep-runs` (default 10) prunes the oldest — so two runs can be compared, which they could not be
while each run emptied the directory.

At the pack's root: `results.json` with every check, the accounting kind and the spend; `agents.yaml` as the run
saw it; `build.log`; and **`workspace.db`, the store copied out of the sandbox before it is deleted**. Then one
directory per scenario:

| file | what it holds |
|---|---|
| `app.log` | the launch verbatim, key substituted out and asserted free of a bearer, at `--app-log-level` (default: the product's own, `info`) |
| `app.filtered.log` | the same log with consecutive repeats collapsed and the sandbox path shortened, and a child MCP server's stderr dropped where the log holds any — two thirds of a launch log used to be one language server booting. Since `PD-MONITOR-002` the product's own log records `info` and above and that stderr is `debug`, so a live-run log carries none of it unless the run names `--app-log-level=debug` or a scenario sets `ROTARIS_APP_LOG_LEVEL=debug`, the one switch that restores it |
| `autopsy.txt` | `apps/desktop/scripts/autopsy.mjs` over that scenario's session |
| `session.log` | the product's own per-session log, at `--session-log-level` (default `INFO`) |
| `summary.md` | the product's own human-readable summary of the session (REQ-SESSION-140), as it stood when the scenario ended; the run checks it carries the requirement's sections in their order and that its Tool errors line agrees with its Issues line (`lib/summary-sections.mjs`; since finacc3's F10 the line reads `at least N` past the issues record's cap, and the agreement is read in either form); since fin25 a summary step that throws (the credential guard, the write, the check itself) records a failed check rather than none |
| `transcript.md` | every transcript row in full, not the 400 characters `results.json` keeps |
| `model-traffic.jsonl` | **what the model was sent and what came back** — request and response bodies, status and duration per call, in the file of the scenario that made the call, each naming how it ended (`outcome`: `complete`, `aborted` when the product let go — the endpoint is let go with it — `in-flight at close`, `stalled`, `released`, `cut`, `upstream-error`, `unreachable`). The product logs a method and a URL and nothing else, so this exists nowhere else |
| `*.png` | the end of the scenario, plus one a fifth and one three fifths through its wait |
| `node-test.log`, `diff.txt`, `changed/` | where the scenario produces them |

**That shape is the run-autopsy skill's input.** `.agents/skills/run-autopsy/SKILL.md` asks for a launch log, the
session store and a session id; the live run produced all three and used to delete two of them with the sandbox,
which is why every defect that skill has found came from a session somebody drove by hand. Read a pack with
`pnpm autopsy .live-run/runs/<stamp>/workspace.db <session-id>`, or point the skill at the pack directory.
The pack stays out of the repository; an autopsy the record cites is kept in
[`docs/architecture/live-runs/`](docs/architecture/live-runs/README.md) (since 2026-10-13), with no host, URL, key or token in it.

The sandbox itself is deleted at the end unless `--keep`. The record of what happened in it is not.

### The `faults` scenario — the endpoint misbehaving, on purpose

The proxy is in the path, so it can also be told to misbehave on a **named call**. Three launches:

- **`faults-ladder`** — a 429 on the second completion and a 500 on the third, neither of which reaches the
  endpoint, so the injected calls cost nothing. It asks whether the run survives both and whether each refusal left
  the trace of the layer that retried it: OQ-110 puts REQ-CONFIG-086's dispatch-layer retries before the ladder's
  (`REQ-ORCH-091..094`), so with the default budget of 5 the trace is the session log's WARNING line, and the check
  reads it (or the ladder's `model_wait`/`transient_llm_error` issue) for every injected status. `results.json`'s
  `traffic.faultsFired`/`faultsDeclared` are the run's figures (`proxy.totals()`), never the last launch's.
- **`faults-stall`** — the bytes stop mid-answer and the socket stays **open**. It asks the eighty-second
  defect's question: a model timeout once collapsed into the same `aborted` flag a user's stop sets, and the run
  reported `user_cancelled` with nobody having pressed anything. The check is that it does not do so again.
- **`faults-args`** (since 2026-10-07) — the proxy's `pace` rule holds every piece of every tool call's streamed
  arguments `LIVE_RUN_ARGS_PACE_MS` (120 ms) behind the one before it, and the stall threshold is lowered to
  `LIVE_RUN_ARGS_STALL_S` (10 s) for this launch alone, so one `write_file` of a 120-line list streams for several
  thresholds. It asks the question of L2 at `c2fdd6a` and N1 at `c2a9444`: is any agent reported stalled while it streams
  a tool call's arguments (`lib/paced-arguments.mjs`, `stallsWhileStreaming`)? A paced span shorter than the threshold and
  one evaluation is no evidence, and fails as such
  (`docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md`). Unlike the other two it names no call:
  the rule acts on every call of its path and fires on each that carried a piece. **First executed 2026-10-07 against
  `katalyst`:** red on the product before the repair (three `stall` issues inside paced spans, pack
  `2026-10-07T00-21-02-195Z`), green on the repaired head (220 pieces over 26.4 s, no `stall` issue, pack
  `2026-10-07T00-26-10-472Z`); its very first run, at a 60 ms pace, cleared the threshold and one evaluation by under two
  seconds, so the default became 120 ms.

This makes the first of the two frictions the `frictions` scenario reports as uncoverable inducible on demand;
that row's note points here. A rule names the **1-based index** of the call it fires at, deliberately: "the
second completion" is a reproduction, "some completion" is a coincidence.

**Both were executed against a real endpoint on 2026-09-22 and both passed on the product's side**
(`docs/architecture/first-executions.md`; pack `.live-run/runs/2026-09-22T09-05-35-955Z`). The ladder made five
calls against two refusals and completed *(falsified 2026-09-29: the two refusals were retried by the model client's
dispatch layer — REQ-CONFIG-086's `num_retries`, default 5 — before the ladder saw them, and the ladder was never
reached; the owner ruled that order as the specification's, OQ-110, R-067, so `faults-ladder` shows that a run survives
the refusals and not that the ladder handled them; each retry the dispatch layer absorbs is now a WARNING line in the
session log, so a pack's `faults-ladder/session.log` names both refusals with the delay waited)*; the stalled stream was noticed by the **idle bound at 120.5 s**,
classified `transient_llm_error`, retried at 121.5 s and finished — the first live evidence that the
eighty-second defect's repair holds.

Two things about the scenario itself were wrong and are repaired: the stalled call was **absent from the pack**
(its record was written only when the proxy let the socket go, and the product recovered first —
`docs/defects/fixed/the-stalled-call-was-the-one-call-missing-from-the-pack.md`), and
`stop_reason !== 'user_cancelled'` is a check that **cannot fail**, since a run that met no fault ends
`tasks_complete` too. It now carries a positive half: the product's own `issues` row must show it noticed, and
what it classified must not be fatal. `LIVE_RUN_STALL_HOLD_MS` must outlast the product's `llm_response_timeout`
(120 s) or the scenario measures the proxy letting go instead.

`faults-stall` holds the socket for `LIVE_RUN_STALL_HOLD_MS` (default five minutes) before letting go, so the
scenario is the slow one — it is opt-in with the others under `--only=`.

### The two duress scenarios, and the rule they obey

`terminal` and `duress` exist to enter one gap `docs/architecture/codebase.md` names: the live run "runs short
tasks against an unmetered endpoint, so it holds **no generation near the model timeout, no multi-line command,
and no re-spawn**" — and all seven defects one hand-driven session found lived in exactly that gap.

**The rule both obey is from the same page: replay the shape the record names, never a plausible family
resembling it.** Sixty real-PTY runs at four geometries could not reproduce a concatenation the live run had
shown, because the trigger was an *empty write between two non-empty ones* and none of the sixty carried it.
Sixty negative runs are not a negative result when none of them carries the input that failed. So `terminal`
issues the recorded commands verbatim, and asserts from `tool_calls` — what the agent passed, what came back —
rather than from what the model says it did.

**One of the shapes is a NOTE, on purpose.** The pipe-to-shell deny fires exactly as `REQ-TOOLS-036/038`
specify; its note exists to measure what it costs, not to accuse the product. A shape the model never issued is
also a NOTE. Reporting a faithful behaviour as a fault is how a scenario teaches its reader to ignore it — the
mistake the board scenario made twice. The `FAILED`-marker shape was the second NOTE until 2026-09-27: it now
replays the record's own lower-case docker line and checks that `PD-TOOLS-003` keeps it from warning, as
`diff-exit-1` guards ESC-41 — a regression guard, not a cost note.

`duress` asserts **coherence, not correctness**: a long run's failures are mostly records disagreeing with each
other, and `apps/desktop/scripts/autopsy.mjs` already computes most of them. What the model produced is never
asserted — a weak model doing the work badly is a fact about the model. Whether the run was long *at all* is
reported rather than assumed, including a note when it stopped at `--max-iterations` and was therefore bounded
by the harness rather than by the work.

**Since 2026-10-13 its launch carries the `pendingLanes` trap of finding D8** (`scripts/lib/lanes-trap.mjs`, the instrument
`pnpm update-depth-proof` runs on the scripted provider): installed before the prompt and read every two minutes, it gives a
NOTE with the commits it counted, the high of React's simulated nested-update count against the 50 at which React throws
error 185, the fibers holding the pending work and the components the commit re-rendered, and every `rotaris-lanes-trap:` line
the console relay carried into `duress/app.log` (one at each new high from 10, and one at any update-depth error). A pack
whose `reactUpdateDepthErrors` is not 0 is read beside those lines.

**Since OQ-278's ruling (2026-10-13, R-072) both are checks, not NOTEs.** Every launch, not only `duress`, FAILS when a relayed
renderer console line names React's update-depth error (React error 185), naming each line ("<name>: no relayed renderer
console line names React's update-depth error (D8, OQ-278)"); and the `duress` launch FAILS when its trap did not install or
its `rotaris-lanes-trap: installed` line did not reach `duress/app.log` through the console relay. What the trap saw stays a
NOTE. The first guarded duress pack is the D8 note's closing evidence under `docs/defects/README.md`'s rule for a note that was
never reproduced: trap installed and relayed, and `reactUpdateDepthErrors` 0 on every launch.

**Its length comes from the work asked for, not from the fixture's weight** — ruled 2026-09-22, when a larger
fixture was considered and not taken. A five-file repository and a five-hundred-file one delegate exactly as
much as the prompt commissions, and a second fixture is a second tree to keep in step with five other
scenarios' prompts. So the prompt is **three dependent waves** — three children, then two that reconcile what
the three produced, then one that verifies all of it — because the parent's conversation grows monotonically
across waves, which is what reaches compression and re-spawn. A single wave of parallel children finishes in
minutes and measures the short path under a longer deadline. `--duress-fixture` remains for the question that
is about size specifically.

The shapes and the readers (`diagnosticOf`, `longOutputReading`, `outputOf`, `hereStringLinesReturned`, `unexpandableReading`, `replacedShellReading`) live in `apps/desktop/scripts/lib/terminal-shapes.mjs`, pinned by
`terminal-shapes.test.ts` — a pattern that stopped matching its own command would turn every check in the
scenario into "never attempted" without anybody being told, so the test asserts the round trip in both
directions: every shape matches its own command, and none matches another's. Each shape is read from the first send that
reached execution (`shapeSends`, `reachedShape`): a send REQ-ORCH-029's todo gate or the schema check refused before it ran
(`todo_list_owed`, `invalid_request`) is counted beside the shape in the "what the model attempted" NOTE and never read, a
shape whose every send was refused is a NOTE ("not reached: refused at the todo gate"), and a permission block is read, since
`pipe-to-shell` is measured by it (fin40; the confirming run at 0bc3eee failed "all 40 lines" by reading the refused send,
`docs/defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md`).

**`terminal` was executed against a real endpoint on 2026-09-22 and every check passed**: all six shapes were
issued, the here-string terminated, forty distinct lines arrived with none concatenated and no escape sequence
surviving, `git diff` exiting 1 read as `outcome success` rather than `shell_failure` — ESC-41's carve-out
proven live on the same machine whose unit test for it is red for an unrelated timeout — and no `__rot_` marker
reached the model. One shape did not reach its question: the wedge **soft-paused before the hard cap**, so
`hardMs`'s own bound is still unmeasured live, and the scenario says so rather than implying otherwise.
**The `failed-word` guard has not run against a real endpoint**: it was written on 2026-09-27, after that run,
and the next live run of `terminal` is its first.

~~**`duress` has not been executed.** It owes its row in `docs/architecture/first-executions.md`.~~ **`duress` was
executed against a real endpoint on 2026-09-29** (pack `.live-run/runs/2026-09-29T03-06-14-929Z`; its row is in
`docs/architecture/first-executions.md`): eight children commissioned, 309 tool calls, and two checks failed. The deadline
check is genuine — 2,406 s of 2,400 s, about 98 % of it the endpoint generating — and the "failed with nothing to say"
check is the harness's false positive on a child cut off with a continuation offer. What the run let through is recorded
as notes in `docs/defects/` carrying "Live-run finding: D…" and "H-…" lines.

**Five of the scenario's own readings were wrong on that run, and were repaired on 2026-09-29 (R-067).** They now live in
`apps/desktop/scripts/lib/duress-checks.mjs`, pinned by `duress-checks.test.ts` against the recorded shapes, and in the
autopsy reader's null-summary line (`lib/autopsy-coherence.mjs`). A cut-off child's `last_response` and `cut_off` are
something to say (H-a); an error entry alone is not, because the product writes one on every failed child (corrected
2026-09-30 in the verifier's fix round 1, where the first repair had counted it and so passed the eighty-second defect's
shape). A child's terminal calls are found under its canonical name, the one `tool_calls`
records (H-b). A session that never stopped answers `unasked`, a NOTE, where it used to pass (H-c). A run that never
compressed names its largest prompt against the REQ-CONFIG-134 trigger rather than its iteration count (H-d). And the
deadline check says **where the time went** (H-h): endpoint, tools alone, launch, and the product with nothing in flight,
each from the traffic and the store. The notes are in `docs/defects/fixed/`. **Run again on 2026-09-30** (pack
`.live-run/runs/2026-09-30T05-29-56-712Z`, `katalyst`), the repaired checks read as they claim: the overrun was a NOTE
(2,406 s of 2,400 s, 99 % the endpoint generating, 1 s of the product with nothing in flight); the session came to rest
`paused`, `application_shutdown`, with its summary, so the null-summary question was asked and passed; no child
failed; the no-compression note named a largest prompt of 77,043 tokens against a trigger of 157,286; and the prompt
arrived with its line breaks (H-e). The commands question, asked at last, **failed falsely once more**: `f`, paused by
the deadline quit after 26 terminal calls, had no report yet. It is now asked only of a child with a report, and
an unsettled one is a NOTE — replayed over that pack, `b` is asked (6 commands) and `f` is noted. **Run a third time
the same day, after the verifier's fix round 1** (pack `.live-run/runs/2026-09-30T06-33-14-401Z`), the scenario
**passed**: the overrun a NOTE naming the one request the quit cut off (the last to end on its own 68 s before the
launch did), a cut-off child (`w2d`, `last_response` and `cut_off`) met live and not counted silent, the commands
question asked of the one settled child that ran commands and the paused `w3` noted.

**`LIVE_RUN_DURESS_MS` — the default stays 40 minutes, and the check says when the window was the bound (decided
2026-09-29).** The figure is the owner's of 2026-09-22, taken for this endpoint, and a harness repair does not reverse it.
What the first execution falsified was the check's reading, not the figure: 2,406 s of 2,400 s was a FAIL, and replayed
through the attribution it reads 99 % endpoint generating (200 requests, 178,627 reasoning tokens), 6 s of tools alone,
5 s of launch, 3 s of the product with nothing in flight, and a request ending 2 s before the quit. A verdict that
blames the product for the endpoint's throughput teaches its reader to ignore it (the rule above), so an overrun in
which the run was still progressing (the last request or tool call **to end on its own** ended within 120 s of the
launch's end) and the product had nothing in flight for at most a tenth of the wait is a **NOTE, "bounded by the window,
not by the product"**. "On its own" is a request the endpoint completed, or anything that ended before the instant the
wait ran out (the seam's timed-out line): a request the quit cut off ends at the quit whatever it was doing, and the
first form of this reading let a stream hung from early in the wait pass as progress (corrected 2026-09-30, the
verifier's fix round 1); such a request is named in the detail instead. The four figures are **occupancy, not a
critical path**: a request open while the run's next step waits on something else still counts to the endpoint. Any other overrun, or one with no traffic to attribute, stays a FAIL naming the shares. To ask for the
result on a reasoning endpoint like `katalyst`, give the run the time: `LIVE_RUN_DURESS_MS=5400000`, for example (90 minutes; the first
execution on `katalyst` was still in its third wave at 40, and the launch's own bound is the wait plus 180 s, so a
`timeout` around the command must sit above that).

**`LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN` — duress launches with the Per-agent timeout at 45 minutes (OQ-214, reopened and
ruled again 2026-10-07 under R-072).** The duress run at `a68f121` cut a verifier and its continuation off at the product's
1200 s while each worked on its own task (finding D2), meeting OQ-214's reopening condition (a). The ruling keeps the
ceiling, the 30 s landing and "continued once, never chained", and takes the relief its earlier ruling counts on:
PD-CONFIG-003's Per-agent timeout, which the harness sets for the duress launch alone as a user on a slow reasoning model
would, writing `runtime.child_timeout: <min×60>` into the workspace's `agents.yaml` (`lib/runtime-key.mjs`, the stored value
Save writes) and restoring it after. Whole minutes from 1 to 240, the control's range; anything else stops the harness
before any launch. `=20` measures the product's default. Every other scenario keeps 1200 s. A pass at a raised limit is
never a pass at the default: the NOTE says which it was. With the children's limit raised the run needs more time: on a
reasoning endpoint like `katalyst` run it with `LIVE_RUN_DURESS_MS=7800000` (130 minutes; at `a68f121` wave three began
about 1,550 s in, and a 45-minute life cut off, its continuation and both summaries take about 5,700 s more) under a
`timeout` above the wait plus 180 s. An overrun while the run is still progressing stays a NOTE.

**The traffic is recorded through a loopback proxy**, so the sandbox's `base_url` is the proxy and the endpoint
is one hop further on. Two consequences worth knowing before reading a pack: a `model request POST` line in
`app.log` names the proxy rather than the endpoint, and it is `model-traffic.jsonl` that says the call reached
the endpoint and what it answered. The proxy forwards chunks as they arrive and buffers nothing — a streamed
completion reaches the product exactly as the endpoint sent it, which
`apps/desktop/scripts/lib/model-traffic.test.ts` pins with a case that fails if it ever stops being true.
`--no-record-traffic` takes the proxy out of the path for the run where the proxy itself is the suspect.
Credentials never reach the file: `authorization` and the api-key spellings are replaced before it is written,
and the live run asserts that in `ask`.

The sandbox holds a **real credential** — the app writes the leased key into its own store, as it would on the
owner's machine — so the credential directory is deleted on every exit path there is: the normal end, `--keep`,
a thrown error, and a Ctrl-C. `--keep` keeps the workspace and the store to read and marks the directory `KEPT`;
the next run sweeps every unmarked leftover, and takes the credentials out of the marked ones too. Live runs may
**overlap** on one host: each writes `OWNER` (its pid and start) into its sandbox as it makes it, and the sweep leaves
a sandbox whose owner is still running — its key included — and one with no `OWNER` for twelve hours
(`apps/desktop/scripts/lib/sandbox-sweep.mjs`;
[fixed](docs/defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md)).

### Reading a failure

Each check prints `PASS`, `FAIL` or `NOTE` with its own sentence, so a red names the assertion rather than the
run. `results.json` holds the same list plus the per-scenario detail — iterations, tokens, tool names, the
answer, the diffstat. A failure in `edit` is usually worth reading beside `edit/changed/` and `edit/diff.txt`:
what the agent wrote is as informative as what the app did with it. A weaker or smaller model failing `edit`
while `ask` passes is a fact about the model, not necessarily about the product — say which you think it is.

Read the scenario's **`autopsy.txt` first** and its `app.filtered.log` second; `transcript.md` and the verbatim
`app.log` are there for the question the first two raise. A check that went red without the autopsy showing a
cause is itself worth reporting — it means the store recorded nothing about the failure.

A live-run failure is a **defect of the product**, not of the harness, until the harness is shown to be wrong.
Record what it found where the mechanism was decided, as the standing policy in `CLAUDE.md` requires.

### What the first execution found — 2026-09-11

Twenty-six checks, all green, against the owner's own vLLM endpoint (unmetered, the discovered model): sign-in
through the product's dialog, a run that read a file and answered, a run that implemented `REQ-TODO-003` — the
identifier it carried that day; the store was renumbered to `REQ-101`..`REQ-104` on 2026-09-11 so the board could
read it, and this record is left saying what it said — two
delegated children, twenty-five tool calls, the suite green when this script ran it itself — and the Overview
painted from the store afterwards. The credential reached no log.

### What the fifth scenario's first execution found — 2026-09-11

Twenty-one checks, all green, against the same endpoint: `REQ-104` selected on the board, released, and the run
that followed watched `backlog → running → review` and accepted into `done` — the product's own timestamps putting
the run at **101.6 s**, 82,786 tokens in and 2,005 out over one iteration, twelve distinct tools including a
delegated child and the terminal, the run confined to `rotaris-req-req-104-u1`, and `node --test` green inside that
worktree when this script ran it. The scenario itself found nothing; the defect it exists to catch was found by the
hand-driven precursor it was written from — the **eighty-first**, recorded in `codebase.md`'s live-run section: a
store whose every document the engine rejected read exactly like an empty store, because this fixture's own
identifiers were not identifiers and no surface but the board had ever parsed them.

It still found a defect, in the way this record says it would, and not through a red check — the persisted
tool-call total was the entry agent's own, not the session's (`REQ-MONITOR-102`), recorded in
`docs/architecture/first-executions.md`'s live-run row. The `edit` scenario now compares the session's counter
with the ring, by agent — the assertion that would have failed before the fix.

Two things it surfaced that are **not** defects, recorded so they are not re-investigated: the Overview metric
cards read the *attached* session, so they are zero in the `shell` scenario by design; and `iterations_completed`
counts run-loop passes, not model turns, so one prompt is one iteration however many tools it dispatched.

One thing left alone: an MCP server whose handshake predates `server/discover` logs a wall of validation errors to
stderr while the client recovers and connects (`packages/mcp/src/client.ts`). Nothing breaks and the fallback is
measured; the noise is the server's own, and quieting it is a decision for `REQ-MCP-048`'s record, not this one.

### The fixture

`apps/desktop/scripts/fixtures/todo-app` is checked in and is part of the repository's own `pnpm check` surface
only as text — nothing installs or builds it. Keep it dependency-free: the suite must run with a bare
`node --test`, because the sandbox has no network and nothing installed. Its `AGENTS.md` is the instructions
the agent under test reads, and the live run exercises that path too; change it deliberately.

Its requirement store is read by the **board** as well as by the agent, so two things about it are load-bearing:
the identifiers stay `REQ-TRACE-022` identifiers — the prefix, a hyphen, decimal digits and nothing else — and the
layout stays `REQ-TRACE-002`'s conventional shape. A store that breaks either is not a smaller store; it is a store
the engine rejects wholesale, which is what the board reads as empty. Renaming a requirement there also changes what
the `edit` prompt and the `requirements` scenario name: change the three together.
