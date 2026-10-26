/**
 * The live run (`pnpm live-run --confirm`): the built application, a real OpenAI-compatible endpoint, a real key
 * and a real workspace, end to end. It is the check to make after a major feature lands — the one thing the
 * scripted proofs cannot do, because every one of them answers the model itself.
 *
 * It never runs on its own: `pnpm check` does not reach it, `pnpm test` does not collect it, and without
 * `--confirm` it prints the plan and exits. It costs real money, so it is bounded three ways: the endpoint and
 * model the owner chose, a ceiling on iterations written into the workspace's configuration, and an accounting
 * check between scenarios that stops the run at `--budget` (default 1.00 USD). What that accounting can read
 * depends on the endpoint (see ACCOUNTING below); the iteration ceiling binds whatever it reads.
 *
 * ENDPOINTS. The owner registers one or more with `--add-endpoint`: a name, the label the product will show, the
 * base URL, the model id, optional prices, and the key behind a hidden prompt. They live in
 * `~/.rotaris/live-run/endpoints.json`; the keys live beside it, one file each, and never in this repository.
 * The default endpoint is the one a bare `--confirm` uses; `--endpoint=<name>` picks another for one run.
 *
 * ACCOUNTING, in order of what the endpoint allows:
 *   1. the provider's own figure — OpenRouter answers `GET /key` with credits used; the difference is the truth;
 *   2. the prices the owner registered — the store's token counts times `input`/`output` USD per million;
 *   3. tokens alone — no money figure exists, so the ceiling is `--max-tokens` (default 500 000) instead.
 * Whichever applies is named in the output and in `results.json`; none of them is ever inferred silently.
 *
 * The workspace is a COPY of `scripts/fixtures/todo-app` in the system temp directory — a small React todo
 * application with its requirements, its pure list functions and a `node --test` suite that needs nothing
 * installed. Its store is the conventional shape of REQ-TRACE-002 — an epic and four children — and its identifiers
 * are REQ-TRACE-022 identifiers, so the requirements BOARD can read it as well as the agent can. `REQ-103` and
 * `REQ-104` are approved and unimplemented on purpose: the first is the work scenario 3 hands over in the composer,
 * the second is the work scenario 4 releases from the board, so neither path depends on what the other did.
 *
 *   1. sign-in  — Settings → Models → Add endpoint, filled and pressed through the product's own dialog; the
 *                 credential file, the snapshot record and the catalogue asserted, the logs free of the key. An
 *                 endpoint that discovers no models takes the dialog's "Continue anyway", and the script writes
 *                 the `models:` entry the run needs by hand (REQ-CONFIG-082..097) rather than pretending.
 *   2. ask      — one real run that reads a file and answers. The lease, the request, a settled tool row, usage. Since fin42
 *                 (N58) its post-run analysis is let finish under an Improvement analysis timeout set through Settings
 *                 (`LIVE_RUN_ANALYST_TIMEOUT_S`, default 300): one artifact with proposals or the timed-out notes (one
 *                 that proposed nothing is a NOTE), and the notice it owes; then `ask-retrospective` presses the Library's retrospective gesture and lets it finish:
 *                 its artifact, the sessions it read, and the workspace root's instruction files alone (PD-LIBRARY-002). Since fin43
 *                 (the live run at ce5f952, F2/F4): its launch starts no run first, every model request of either launch carries a
 *                 credential, and a "collector crashed" artifact fails the artifact check. Since fin44 (PD-LIBRARY-005, OQ-285) the
 *                 notice check reads the warning a crashed or unparseable collector owes ("The retrospective could not be
 *                 completed", naming the artifact), and a verdict with no detail prints no "— undefined". Since fin45 (PD-LIBRARY-002
 *                 revision 5, OQ-300) `ask-retrospective-unauth` presses the gesture again with the credential file moved aside
 *                 for one launch: one "Provider authentication required" notice naming the retrospective, with "Open Models
 *                 settings", and no artifact. Since fin46 (finding L6) that press waits for the open's "No model provider is
 *                 authenticated yet" banner, which otherwise could replace the refusal in the single slot (REQ-NOTIFY-024).
 *   3. edit     — one real run that implements REQ-103 and runs the suite in the terminal. Asserted from the
 *                 files on disk, from `git diff`, and by running `node --test` again in this script. The work is
 *                 split between two children writing IN PARALLEL, each under a declared write scope (PD-TOOLS-006):
 *                 both delegated with a scope, live at once, told the live scopes at start, and any refusal named.
 *   3b. resume  — PD-ORCH-005 against a real model: a delegating run paused through the composer's own Pause while two
 *                 children run (one, once the first has run alone for 45 s; `lib/resume-pause.mjs`, which reports how
 *                 many the pause held), the paused composer read, and the run continued through its own Continue. Asserted
 *                 from the store and the traffic: the iteration left open and resumed, every paused child resumed
 *                 under its task id with its record continuing across the pause, and its next request carrying
 *                 what it recorded last; the notes it was asked for are read back from disk.
 *
 * Every scenario that reads a session also asserts its PRICE (PD-MONITOR-001 revision 2): at registered prices the
 * cost reads `configured` and equals the store's tokens times those prices exactly. One run, several mechanisms —
 * so a feature is measured working beside the others, and the run costs no extra scenario for it.
 * `ask`, `edit`, `frictions` and `terminal` also read, at their capture, the run header's frozen duration against the
 * inspector's run-level row: one interval, one figure (REQ-CHAT-158, REQ-MONITOR-107; K1 of the default live run at c2fdd6a).
 * A capture of a run that is not yet terminal (its header not frozen) notes the reading instead (acceptance L4).
 *   4. requirements — the REQUIREMENTS BOARD, driven as a person drives it: REQ-104 selected, the move control
 *                 pressed, the release confirmed, and the run that follows watched from `backlog` through
 *                 `running` to `review`, its review decision taken and the card left resting in `done`. Asserted
 *                 from the board itself, from the delivery store's own rows, from the worktree the run was confined
 *                 to, and by running `node --test` inside that worktree. It is the one path the composer scenarios
 *                 never take: the work is handed over by the board, not typed into a prompt.
 *   5. shell    — a relaunch with no prompt: Overview painted from the store, the sessions the runs left.
 *   6. frictions — one real run engineered to trip the inducible run-autopsy frictions (first-use
 *                 `write_file` without `operation`, asked for by name since PD-TOOLS-007 reads it as a create, a
 *                 SIGINT stop on a win32 pipe session), read back from the store rather than from the model's
 *                 report. The exit-trace friction needs a crash, and is fired by `pnpm exit-trace-proof` in the
 *                 built app rather than here. Its root's requests, read from the
 *                 traffic, also carry the entry role's ROUTE wording (K3 of the default live run at c2fdd6a).
 *                 Then, in a launch of its own (`frictions-cut`), a command that fails with output past
 *                 REQ-SESSION-136's 2,000-character error-path cut, whose record must end with REQ-SESSION-194's
 *                 marker (live-run finding M3).
 *   7. faults    — the ENDPOINT misbehaves, on purpose, through the recording proxy: a 429 and a 500 on
 *                 named calls (does the ladder wait, fall back and finish?), then a stream that stops
 *                 mid-answer with the socket held open (is that reported as a user cancellation, which is
 *                 the eighty-second defect's signature?). Neither injected refusal reaches the endpoint,
 *                 so the ladder half costs nothing but retries. Then one tool call's arguments streamed slowly
 *                 (`faults-args`, the proxy's `pace` rule, the stall threshold lowered for that launch): is any agent
 *                 reported stalled while it streams them (L2 at c2fdd6a, N1 at c2a9444)?
 *   8. terminal  — the TERMINAL under duress, one run, the named shapes replayed from the record: a
 *                 multi-line here-string, forty lines of long output, off Windows a here-document longer than the
 *                 PTY's input line (live-run M1), off Windows an `exec bash` that replaces the
 *                 session's shell (acceptance A9), a bash-ism `/bin/sh` cannot expand (live-run L1) and an `exit 3`
 *                 that ends the session's shell (OQ-144's sibling case), a wedge
 *                 with no `timeout` supplied, one poll of it and a `C-c` with a poll after it (OQ-147), a second wedge
 *                 and a command issued while it is soft-paused (OQ-164),
 *                 an exit-0 output carrying docker's lower-case `failed to connect` line, a `git diff` with
 *                 differences exiting 1, a read-only git pipeline through a pipe, and last a command that keeps
 *                 printing past the default hard cap with no `timeout` supplied (REQ-TOOLS-097's `hardMs`). Asserted from
 *                 `tool_calls`, never from the model's prose; a shape the model never attempted is a NOTE,
 *                 not a failure, and so is one whose every send the tool gate refused before it ran (not reached:
 *                 the todo gate, the schema check, the plan gate, a write scope, a hook or a withdrawn approval,
 *                 `GATE_REFUSALS`), but a run that ended `failed` before any terminal call is a FAILURE (one that
 *                 stopped otherwise before any is a NOTE), so a dead run never reads green.
 *   8b. away     — the first scenario at a permission mode that ASKS (every other forces `autonomous`): `ask`, a 20 s
 *                 approval timeout and every dialog left unanswered. The first ask must wait its full timeout, the run
 *                 must mark its user away (`user_away`, the session log's WARNING line), no further dialog may be shown,
 *                 and every later ask must be denied at once with PD-TOOLS-005's reason; what the model then says is a
 *                 NOTE (`lib/approval-scenarios.mjs`, read by `lib/approval-readings.mjs`).
 *   8c. approvals — the asking default (`ask`, the registered timeout): the first `write_file` dialog answered "Approve for
 *                 this session", every other "Approve once", three writes of one file asked for. The later writes of that path
 *                 must pass with no dialog, allowed by the session rule (PD-TOOLS-004); a model that wrote it once is a NOTE.
 *   8d. plan-gate — `run_start_mode: plan`, three launches: the prompt held at the gate with a real plan drawn as Markdown,
 *                 nothing written and no loop supervision while held (PD-ORCH-001/002); approved through the gate's button
 *                 and the work done; a second prompt in the released session not held (PD-ORCH-003).
 *   8g. cut      — PD-TOOLS-013 against a real model (fin42, N51): one foreground `terminal` call that marks a file and sleeps 60 s
 *                 under an explicit 90 s timeout, quit by SIGTERM once its record is open and the file marked
 *                 (`lib/cut-scenario.mjs`). The cut call must read failed / `interrupted` with no exit code, `"timeout":false`, a
 *                 session reset and the run's-cancel wording, file no `terminal_timeout` or `tool_error` issue, and count under
 *                 `summary.md`'s `interrupted` bucket with Timeouts 0. A model that never ran the sleep, or ran it soft-paused, is
 *                 a NOTE: nothing was cut.
 *   8h. crlf     — PD-TOOLS-014 to PD-TOOLS-018 against a real model (fin42, N52): three CRLF, tab-indented files generated into the
 *                 sandbox (`lib/crlf-fixture.mjs`; a committed CRLF fixture is normalised away) and four edits asked for, each
 *                 with the tool named — a two-line `haet_edit` (an LF `old_string` meets them at level 2: the near miss and its
 *                 retry), a three-line `write_file` window edit, a `write_file` insert and a multi-line `replace_all`
 *                 (`lib/crlf-scenario.mjs`). No line of a file only edits and inserts touched may lose its `\r`, and an insert
 *                 or multi-line replace-all that landed must say it kept the CRLF endings where it had a `\r` to add; which
 *                 shapes the model chose, the near-miss reading and the window edit's level are NOTEs, except that since
 *                 PD-TOOLS-019 (OQ-280) a window edit that landed at level 4 although its `old_string` was a uniform indent off
 *                 FAILS, a level-3 one must land its block at the file's depth, and a level-3 `haet_edit` near miss with an LF
 *                 `old_string` must name the line endings (PD-TOOLS-014 revision 3).
 *   8e. cutoff   — OPT-IN (`--only=cutoff`), a few minutes: Settings › Runtime › Per-agent timeout set to
 *                 `LIVE_RUN_CUTOFF_MIN` (default 1) minute(s) through the control and Save, then one delegated child given
 *                 more work than that: the cut-off child's report, the timed-out tag's line in the minutes form
 *                 (PD-CONFIG-003 revisions 3 and 4), OQ-217's facts head and summary opening and no "The run failed" relayed
 *                 (D9), then a follow-up run asked to take the continuation offer up (PD-ORCH-004 revisions 3 and 4).
 *   8f. delegation — (since 2026-10-13, N57) three launches: a run whose orchestrator's `delegates_to` names two personas,
 *                 asked to delegate a child, hand its report artifact to a second through `attach_artifacts`, and follow the
 *                 first up by `session_id`; that session reopened, its latest artifact edited and saved in the Library's
 *                 inspector, and continued, whose handoff must carry the edit; and a `rotaris.delegation_strategy: swarm` run,
 *                 whose overrun takes the duress run's reading since fin46 (L8): a model that kept the endpoint busy to the
 *                 end of the wait is a NOTE, a run that stopped moving or a product that held the time FAILS.
 *   8i. rename   — OPT-IN (`--only=rename`), a few minutes: one coding-agent child delegated to rename the fixture's `remaining`
 *                 to `countRemaining` with the code-intelligence EDIT tier's symbol rename (`rename_symbol`), then run `node --test`.
 *                 Asserted from the store and the files (`lib/rename-reading.mjs`): the rename row `ok`; `src/todos.js`,
 *                 `src/App.jsx` and `src/todos.test.js` no longer call or import `remaining`; the renaming child's stored report
 *                 and its child-report artifact list every one of the three that changed (OQ-245's reach observation,
 *                 PD-ORCH-004, REQ-ORCH-109); `node --test` green. No rename call is a NOTE, "not reached" — a live model may
 *                 choose another tool. Whether the child searched for references first is noted; a cold rename that left the
 *                 importing files behind or had them mended by hand is a FINDING against PD-MCP-004, whose run-host search
 *                 before every rename must make it reach them (OQ-273, ruled 2026-10-13;
 *                 docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
 *                 It failed at `3c03287`: the fixture has no `tsconfig.json` or `jsconfig.json`, and there the search finds
 *                 nothing to load (the note, reopened 2026-10-15). Since PD-MCP-004 revision 2 (OQ-362, ruled 2026-10-20) the run
 *                 host places a `jsconfig.json` of the product's own at the root for the search and the rename and removes it when
 *                 the rename has answered: a further check FAILS when one stands at the workspace root after the run, and the
 *                 application log's placements and removals of it are noted.
 *   8j. plan-open — OPT-IN (`--only=plan-open`), a few minutes (fin42, N56): `PD-ORCH-015` against a real model, two launches
 *                 whose prompt has the coordinator write a three-item plan and answer with the last item left PENDING:
 *                 `plan-open`, where it is free to record the item when corrected (one "a correction is sent" warning, the
 *                 correction in the root's own conversation saying the answer was shown, iteration 1 `succeeded`, the session
 *                 `completed` / `tasks_complete`, no held row and no answer re-prompt), and `plan-held`, where it is told to
 *                 ignore a correction (the held `system` row, the next fresh root's first request carrying the marker and the
 *                 answer the person was shown, and the outcome). A root that closed its plan before answering is a NOTE, "not
 *                 reached" (`lib/plan-open-reading.mjs`).
 *   8k. empty-answer — OPT-IN (`--only=empty-answer`), a few minutes (fin42, N56): `PD-ORCH-009` revision 2 through the proxy's
 *                 `empty` rule, which answers the coordinating root's completions with no content and no tool call, `stop`:
 *                 `empty-answer` (both of the root's calls empty) — exactly one re-prompt sent and logged, then "The run ended
 *                 without an answer: …" and one warning `incomplete_execution` issue; `empty-once` (the first call only) — one
 *                 re-prompt, the model's answer to it, and no such row or issue. In both (revision 3, OQ-282): no stuck
 *                 classification asked and no root stuck `loop_supervisor_activation`. Since fin45 (revision 5, OQ-296) a third
 *                 launch, `empty-wait`: the root's step right after a background delegation is emptied, so it waits silently;
 *                 the child's report must be the final message of the request that resumes it, with no stuck classification,
 *                 no root stuck activation and no `agent_session_aborted`.
 *   9. duress    — OPT-IN (`--only=duress`), tens of minutes: a delegating run long enough to reach
 *                 compression, re-spawn and a child that ends badly. Its assertions are coherence
 *                 questions the autopsy reader already computes, which is what makes a long run cheap to
 *                 check and hard to fool. It launches with the Per-agent timeout raised to
 *                 `LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN` (default 45 minutes), as a user on a slow reasoning model
 *                 would raise it (OQ-214 reopened and ruled 2026-10-07 under R-072; PD-CONFIG-003); `=20` measures
 *                 the product's default.
 *                 Since 2026-10-13 (fin42) its launch carries the `pendingLanes` trap of finding D8
 *                 (`lib/lanes-trap.mjs`): a NOTE gives its commits, the nested-update run's high against React's 50, the
 *                 fibers holding the pending work and the components re-rendered, and any `rotaris-lanes-trap:` line.
 *                 Since OQ-278's ruling (2026-10-13, R-072) these are CHECKS: the trap installed and its
 *                 `rotaris-lanes-trap: installed` line reached duress/app.log through the console relay, and — on EVERY
 *                 launch, not only this one — no relayed renderer console line names React's update-depth error (React
 *                 error 185). Either one failing fails the run.
 *
 * The key is never passed on a command line and never written to the repository. For one endpoint `<name>`:
 *   1. `ROTARIS_LIVE_API_KEY` in the environment (for a one-off, or a machine where the prompt cannot run);
 *   2. `~/.rotaris/live-run/<name>.key.dpapi` — Windows DPAPI, this account on this machine only
 *      (`~/.rotaris/live-run/<name>.key`, mode 600, elsewhere).
 * Every log this script writes has the key substituted out of it, and each one is asserted to hold no bearer.
 *
 * EVIDENCE, and what it is FOR. A pack lands at `.live-run/runs/<stamp>/` — packs accumulate, `latest.txt` names
 * the newest, `--keep-runs` (default 10) prunes the oldest — with `results.json` and the copied `workspace.db` at
 * its root and one directory per scenario holding:
 *
 *   app.log            the launch verbatim, key substituted out and asserted free of a bearer, at `--app-log-level`
 *                      (default: the product's own, `info`)
 *   app.filtered.log   the same log without a child MCP server's stderr, consecutive repeats collapsed, the
 *                      sandbox path shortened — two thirds of a launch log is one language server booting
 *   autopsy.txt        `apps/desktop/scripts/autopsy.mjs` over this scenario's session
 *   session.log        the product's own per-session log, at `--session-log-level` (default INFO)
 *   summary.md         the product's own human-readable summary of the session (REQ-SESSION-140), as it stood when the
 *                      scenario ended; the run checks it carries the requirement's sections in their order
 *   transcript.md      every transcript row in full, not the 400 characters `results.json` keeps
 *   model-traffic.jsonl  what the model was SENT and what came back — bodies, status and duration per call,
 *                      recorded by a loopback proxy the sandbox is pointed at (`--no-record-traffic` skips it),
 *                      into the file of the scenario that made the call, each naming how it ended (`outcome`:
 *                      `complete`, `aborted` when the product let go, `in-flight at close`, …) and, where the response
 *                      carried one, its `usage`, read from the whole body (a body over 1 MB is recorded cut).
 *                      The product logs a method and a URL and nothing else, so this exists nowhere else.
 *   *.png              the end of the scenario, plus a fifth and three fifths of the way through its wait
 *   node-test.log, diff.txt, changed/   where the scenario produces them
 *
 * The shape is not arbitrary: it is the input `.agents/skills/run-autopsy/SKILL.md` asks for — a launch log, the
 * session store and a session id. This script produced all three and deleted two of them with the sandbox, which
 * is why every defect that skill has found came from a session driven by hand rather than from a live run. The
 * sandbox still goes away at the end unless `--keep` is given; the record of what happened in it no longer does.
 *
 * The run is unattended and its window is hidden; `--gui` shows it, for watching rather than using.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, proofIsolationEnv, tokensDirFor } from './lib/harness.mjs';
import { KEY_ENV, endpointKey, endpointStore, instanceIdFor, powershell, selectEndpoint } from './lib/endpoint-registry.mjs';
import { startRecordingProxy } from './lib/model-traffic.mjs';
import { KEPT_FILE, sweepSandboxes, writeOwner } from './lib/sandbox-sweep.mjs';
import { KNOWN_RESTATEMENTS, restatedFacts } from './lib/restated-facts.mjs';
import { updateDepthVerdict } from './lib/renderer-console.mjs';
import { lanesTrapGuard, lanesTrapReading, lanesTrapSteps } from './lib/lanes-trap.mjs';
import { starterMissing } from './lib/starter-config.mjs';
import { preserveSummary, summaryReading } from './lib/summary-sections.mjs';
import { fenceRootOf, runWideReadings } from './lib/tool-frictions.mjs';
import { publishersOf, routingMissReading } from './lib/routing-misses.mjs';
import { handOffCutReading } from './lib/hand-off-cuts.mjs';
import { classifierNote, classifierReading } from './lib/intent-reading.mjs';
import { agentPlanTaskCount, coordinatorTodoReading, heldItemReading, launchRunOverride, planIdReading, planItemIds, rootAgentPlan, todoItemReading } from './lib/coordinator-todo.mjs';
import { PAUSE, pauseEvalSteps, pauseReading } from './lib/resume-pause.mjs';
import { typingAllowanceMs } from './lib/prompt-typing.mjs';
import { nearMissReading } from './lib/near-miss-edits.mjs';
import { stallIssueCadence } from './lib/stall-issue-cadence.mjs';
import { conclusive, pacedWindows, stallsWhileStreaming } from './lib/paced-arguments.mjs';
import { bindingVerdict } from './lib/code-intelligence-binding.mjs';
import { DURATION_PROBES, runDurationReading, runDurationVerdict } from './lib/run-duration-agreement.mjs';
import { ensureBundle, runBundleScript } from './lib/code-intelligence-bundle.mjs';
import { codeIntelligenceStatement } from './lib/code-intelligence-discovery.mjs';
import { commandsReading, compressionNote, compressionTrigger, overrunReading, silentFailedChildren, trafficCall } from './lib/duress-checks.mjs';
import { withPersonaKey, withRuntimeKey, withSectionKey } from './lib/runtime-key.mjs';
import { runApprovalsScenario, runAwayScenario, runPlanGateScenario } from './lib/approval-scenarios.mjs';
import { runCutScenario } from './lib/cut-scenario.mjs';
import { runCrlfScenario } from './lib/crlf-scenario.mjs';
import { fieldSaveReading, runtimeFieldSteps } from './lib/settings-runtime-field.mjs';
import { passOutcome, postRunVerdict, refusalClicks, refusalPressOrder, refusalWait, retrospectiveArtifactVerdict, retrospectiveInstructionFiles, retrospectiveRefusalVerdict, runsStarted, settledAfterMs, settledWait, unauthorizedRequests } from './lib/analysis-reading.mjs';
import { verdictLine } from './lib/verdict-line.mjs';
import { MANIFEST_FILE, writeEvidenceManifest } from './lib/evidence-manifest.mjs';
import { settleLaunch } from './lib/settle-launch.mjs';
import { appLogLevelRefusal } from './lib/app-log-level.mjs';
import { createRunEnding, launchFailure } from './lib/run-ending.mjs';
import { RENAME_FILES, RENAME_FROM, RENAME_TO, renameReading } from './lib/rename-reading.mjs';
import { CLASSIFIER_MARK, DELEGATED_MARK, REPORT_MARK, ROOT_MARK, answerReading, planReading, waitReading } from './lib/plan-open-reading.mjs';
import { OUTCOME_HEAD, TAG_EVAL, TAG_SELECTOR, cutOffChildren, offerTaken, runFailedRelays, summaryOpeningVerdicts, tagReading, timeoutLimitText, timeoutLine } from './lib/cut-off-reading.mjs';
import { ARTIFACTS_TAB } from './lib/library-refresh.mjs';
import { HANDOFF_ARTIFACT_CAP, attachReading, delegatesToReading, followUpReading, handoffArtifact, handoffReading, requestOf, swarmReading } from './lib/delegation-readings.mjs';
import { frontmatterOfRow, leadingFrontmatter } from './lib/artifact-frontmatter.mjs';
import { DEFAULT_SHELL_COMMAND_TIMEOUT_S, LONG_OUTPUT_LINES, PTY_INPUT_LINE_BYTES, attemptCount, diagnosticOf, endedShellReading, hardCapReading, hereStringLinesReturned, interruptedPollReading, longCommandReading, longOutputReading, notReachedNote, outputOf, pairNotReachedNote, pausedBehindReading, reachedShape, replacedShellReading, shapeSends, terminalRunEndReading, terminalShapes, terminalWaitMs, unexpandableReading } from './lib/terminal-shapes.mjs';

const require = createRequire(import.meta.url);
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const fixture = join(app, 'scripts', 'fixtures', 'todo-app');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
/**
 * The evidence root, and why a run no longer overwrites the one before it.
 *
 * `.live-run/` used to BE the pack: emptied at every start, so run N-1 was unrecoverable and two runs could never
 * be compared. It is now a directory OF packs — `runs/<stamp>/`, the same stamp the sandbox carries, with
 * `latest.txt` naming the newest — and `--keep-runs` (default 10) prunes the oldest rather than the last one.
 * The whole tree is still gitignored; what changed is that the machine keeps a history the owner can read.
 */
const EVIDENCE_ROOT = resolve(repo, '.live-run');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(EVIDENCE_ROOT, 'runs', stamp);
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`the evidence directory escaped the repository: ${output}`);

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit === undefined ? fallback : hit.slice(name.length + 3); };

/**
 * `--gui`: show the window each scenario drives, instead of hiding it. Off by default — the run is unattended and
 * a window that appears on every launch is a nuisance — and asked for explicitly when the owner wants to watch.
 * It changes ONE thing, `windowsHide` on the spawn: every scripted click and keystroke goes through
 * `webContents.sendInputEvent`/`executeJavaScript` in the main process, so it needs no focus and the owner clicking
 * around cannot steal it. The evidence is identical either way — `capturePage()` photographs the composited frame
 * whether the window is on screen or not.
 */
const GUI = has('gui');
const BUDGET = Number(value('budget', '1.00'));
const MAX_TOKENS = Number(value('max-tokens', '500000'));
/**
 * The iteration ceiling written into the sandbox's `runtime.max_iterations`, for every scenario in the run.
 *
 * It was 15 while every scenario here was a short task; the long run made that number the thing being measured
 * rather than a bound on it — a delegating run hits 15 while it is still commissioning, and reports its own
 * ceiling as a result about the product. Raised to 500 by the owner's decision of 2026-09-22.
 *
 * **What that gives up, stated rather than buried:** this is the bound that exists so one confused run cannot
 * spend the lot, and 500 iterations against a METERED endpoint is a great deal more than 15. What still holds
 * is the accounting gate between scenarios (`--budget`, or `--max-tokens` where no money figure exists) and the
 * endpoint's own limits; what no longer holds is a tight bound WITHIN one run. The endpoint this was raised for
 * is registered unmetered, where the cost of a long run is wall clock. Name `--max-iterations` on a metered one.
 */
const MAX_ITERATIONS = Number(value('max-iterations', '500'));
const KEEP_RUNS = Math.max(1, Number(value('keep-runs', '10')));
/**
 * The session log level written into the sandbox's own configuration. `WARNING` is the product's default and
 * holds warnings alone; `INFO` adds the run-end line, the hook lines and the checkpoint lines. It is NOT raised
 * to `DEBUG` by default and that is deliberate: the engine has no `debug` call site on this log, so `DEBUG` and
 * `INFO` are the same file and naming the louder one would imply a detail that does not exist.
 */
const SESSION_LOG_LEVEL = value('session-log-level', 'INFO');
/**
 * The APPLICATION log's threshold, the one `session_log_level` never reaches (PD-MONITOR-002). The product reads it
 * from `ROTARIS_APP_LOG_LEVEL` alone, and `cleanEnvironment()` strips that name from every launch, so an exported
 * variable never gets through: this flag is how a live run asks for `debug` — a child MCP server's stderr among it.
 * Unnamed, nothing is set and the launch keeps the product's default, `info`. The value is checked here, because the
 * product answers a word it does not know by recording `info` and writing one warning line, which a pack read afterwards
 * would show as a run that quietly did not ask. Since 2026-10-20 only `debug` and `info` are taken: above `info` the log
 * drops the `info` lines every scenario reads (the capture's wait, click and probe lines among them), and each reading took
 * their absence for an outcome (`lib/app-log-level.mjs`,
 * `docs/defects/fixed/a-live-run-at-app-log-level-warning-or-error-misreads-its-missing-info-lines-as-outcomes.md`).
 */
const APP_LOG_LEVEL = value('app-log-level', null);
const appLogRefusal = appLogLevelRefusal(APP_LOG_LEVEL);
if (appLogRefusal !== null) {
  console.error(appLogRefusal);
  process.exit(2);
}
/**
 * `--no-record-traffic`: talk to the endpoint directly instead of through the recording proxy.
 *
 * The proxy is on by default because what the model was sent and what it answered is the one thing no pack has
 * ever carried, and it is where most of the questions a red raises are settled. It is a raw pipe — chunks are
 * forwarded as they arrive, nothing buffered — so a streamed completion reaches the product exactly as the
 * endpoint sent it. The flag exists for the run where the proxy itself is the suspect.
 */
const RECORD_TRAFFIC = !has('no-record-traffic');
/**
 * Declared here rather than where it is started, because the signal handlers below close over it and a Ctrl-C
 * during the build would otherwise reach a `let` still in its temporal dead zone — an exception inside the
 * handler whose whole job is to make sure the sandbox's credentials are deleted.
 */
let proxy = null;
const closeProxy = () => { try { proxy?.close(); } catch { /* the run is ending either way */ } };
const SIGN_IN_WAIT_MS = Number(process.env['LIVE_RUN_SIGN_IN_WAIT_MS'] ?? 120_000);
const RUN_WAIT_MS = Number(process.env['LIVE_RUN_WAIT_MS'] ?? 420_000);
/**
 * The edit scenario carries two children writing in parallel and a verifier after them, so it needs more wall clock
 * than one agent editing alone. The first run with them measured the work done at about five minutes and the run
 * still open at seven, the entry agent having delegated an unasked-for inspection; twice the ordinary wait covers the
 * work, and the prompt closes the detour.
 */
const EDIT_WAIT_MS = Number(process.env['LIVE_RUN_EDIT_WAIT_MS'] ?? RUN_WAIT_MS * 2);
/**
 * The Improvement analysis timeout the `ask` scenario sets through Settings before its run, in whole seconds within the
 * control's 10–600 (PD-CONFIG-003 revision 2): real analyst calls took 22 to 134 s against the 60 s default (live-run-1 F4),
 * and the scenario now lets the analysis finish (N58). Checked here, before any launch spends anything.
 */
const ANALYST_TIMEOUT_S = Number(process.env['LIVE_RUN_ANALYST_TIMEOUT_S'] ?? 300);
if (!(Number.isInteger(ANALYST_TIMEOUT_S) && ANALYST_TIMEOUT_S >= 10 && ANALYST_TIMEOUT_S <= 600)) {
  throw new Error(`LIVE_RUN_ANALYST_TIMEOUT_S must be whole seconds from 10 to 600, the Improvement analysis timeout control's range (PD-CONFIG-003 revision 2); got ${JSON.stringify(process.env['LIVE_RUN_ANALYST_TIMEOUT_S'])}`);
}
const OPTIONAL = ['ask', 'edit', 'resume', 'requirements', 'shell', 'frictions', 'faults', 'terminal', 'away', 'approvals', 'plan-gate', 'delegation', 'cut', 'crlf'];
/**
 * Scenarios that `--only` accepts and the default set never contains.
 *
 * `duress` is the long run — a delegating, compressing, re-spawning run measured in tens of minutes rather
 * than in the four each other scenario takes. The ordinary live run is a smoke test and stays one; a scenario
 * that trebles its wall clock does not belong in it by default, and a scenario nobody can leave out is a
 * scenario people stop running. Naming it is the consent.
 */
const OPT_IN = ['duress', 'cutoff', 'rename', 'plan-open', 'empty-answer'];
const SCENARIOS = [...OPTIONAL, ...OPT_IN];
const only = value('only', null);
const wanted = only === null ? OPTIONAL : only.split(',').map((s) => s.trim()).filter((s) => s !== '');
for (const name of wanted) if (!SCENARIOS.includes(name)) throw new Error(`--only takes ${SCENARIOS.join(', ')}; got ${name}`);
/**
 * The workspace the `duress` scenario opens. `todo-app` is five files — enough to commission delegation by
 * instruction, not enough to commission it by weight — so the scenario reports which fixture it ran against
 * rather than implying the default was a considered choice. Point it at a larger throwaway tree to ask the
 * harder question; the scenario asserts the same things either way.
 */
const DURESS_FIXTURE = value('duress-fixture', null);
const DURESS_MS = Number(process.env['LIVE_RUN_DURESS_MS'] ?? 2_400_000);
/*
 * OQ-214, reopened under its condition (a) and ruled again on 2026-10-07 under the owner's delegation (R-072; finding D2 of the
 * duress run at a68f121): the product's 1200 s ceiling stands, and the relief for long work on a slow reasoning model is
 * PD-CONFIG-003's Per-agent timeout. The duress launch sets it as such a user would, to this many whole minutes (default 45,
 * the figure PD-CONFIG-003's first execution drove through Save), and records the value; `=20` measures the default. A value
 * outside the control's 1–240 stops the harness here, before any launch spends anything.
 */
const DURESS_CHILD_TIMEOUT_MIN = Number(process.env['LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN'] ?? 45);
if (wanted.includes('duress') && !(Number.isInteger(DURESS_CHILD_TIMEOUT_MIN) && DURESS_CHILD_TIMEOUT_MIN >= 1 && DURESS_CHILD_TIMEOUT_MIN <= 240)) {
  throw new Error(`LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN must be whole minutes from 1 to 240, the Per-agent timeout control's range (PD-CONFIG-003); got ${JSON.stringify(process.env['LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN'])}`);
}
const DURESS_CHILD_TIMEOUT_S = DURESS_CHILD_TIMEOUT_MIN * 60;
/*
 * A named fixture replaces the workspace for the WHOLE run, because one sandbox holds one store and
 * `oneDatabase` refuses a second. Every other scenario's prompt names files `todo-app` has, so running them
 * against someone else's tree would fail them for a reason that is not about the product. Refused rather than
 * silently allowed: the reader of a red must never have to wonder which fixture produced it.
 */
if (DURESS_FIXTURE !== null && wanted.some((name) => name !== 'duress')) {
  throw new Error(`--duress-fixture replaces the workspace, so it runs with --only=duress alone; got --only=${wanted.join(',')}`);
}

// ── The endpoint registry and the key store ──────────────────────────────────────────────────────────────────
// Shared with `slice-proof.mjs` since 2026-10-02 (R-068): `lib/endpoint-registry.mjs` holds the registry, the key store
// and the provider id the product mints for a label; this script keeps only its prompts and its own flags.
const keyStore = endpointStore();
const { dpapiFileFor, plainFileFor, keyFileFor, hasKey, registry, writeRegistry, storeKey, storedKey } = keyStore;

/** A hidden prompt: PowerShell's own on Windows, `stty -echo` elsewhere. The secret never reaches a command line. */
function promptSecret(what) {
  if (!process.stdin.isTTY) throw new Error(`there is no terminal to prompt on; put the key in ${KEY_ENV} for this command instead`);
  if (process.platform === 'win32') {
    const script = `$k = Read-Host -AsSecureString ${JSON.stringify(what)}; [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($k))`;
    const read = spawnSync(powershell(),['-NoProfile', '-Command', script], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
    if (read.status !== 0) throw new Error('nothing was entered');
    return read.stdout.trim();
  }
  const read = spawnSync('sh', ['-c', `stty -echo < /dev/tty; printf '%s: ' ${JSON.stringify(what)} > /dev/tty; read k < /dev/tty; stty echo < /dev/tty; printf '\\n' > /dev/tty; printf '%s' "$k"`], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  if (read.status !== 0) throw new Error('nothing was entered');
  return read.stdout.trim();
}

/**
 * Registration. Every field may arrive as a flag (`--name= --label= --base-url= --model= --in-price= --out-price=`),
 * so this is scriptable; whatever is missing is asked for, which needs a terminal. The key comes from the hidden
 * prompt, or from the environment when there is no terminal to prompt on — never from a flag.
 */
async function addEndpoint() {
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (given, question) => {
    if (given !== null) return given.trim();
    if (rl === null) throw new Error('there is no terminal to prompt on; pass --name= --label= --base-url= --model= and put the key in ROTARIS_LIVE_API_KEY');
    return (await rl.question(question)).trim();
  };
  try {
    const reg = registry();
    const name = await ask(value('name', null), 'A short name for this endpoint (e.g. custom, openrouter): ');
    if (name === '' || !/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new Error('the name must be alphanumeric with dashes');
    const label = await ask(value('label', null), 'The label the product shows (e.g. My Endpoint): ');
    if (label === '') throw new Error('the label must not be empty');
    const baseUrl = await ask(value('base-url', null), 'The OpenAI-compatible base URL (the part before /chat/completions): ');
    if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) throw new Error('the base URL needs a scheme and a host');
    const model = await ask(value('model', null), 'The model id as the endpoint names it: ');
    if (model === '') throw new Error('the model id must not be empty');
    const inUsd = await ask(value('in-price', rl === null ? '' : null), 'Input price, USD per million tokens (blank if unknown): ');
    const outUsd = await ask(value('out-price', rl === null ? '' : null), 'Output price, USD per million tokens (blank if unknown): ');
    const context = await ask(value('context', rl === null ? '' : null), 'Context window in tokens (blank to take whatever discovery reports): ');
    const unmeteredHere = has('unmetered') || (rl !== null && /^y/i.test(await ask(null, 'Unmetered — your own hardware, no cost ceiling? [y/N]: ')));
    rl?.close();
    // Re-registering keeps the key already stored; only a key in the environment, or `--set-key`, replaces one.
    const fromEnv = (process.env[KEY_ENV] ?? '').trim();
    const keep = fromEnv === '' && hasKey(name);
    const secret = keep ? null : fromEnv !== '' ? fromEnv : promptSecret('API key (hidden)');
    if (!keep && (secret === null || secret === '')) throw new Error('no key was entered');
    const stored = keep ? { file: keyFileFor(name), protection: 'kept as it was' } : storeKey(name, secret);
    reg.endpoints[name] = {
      label, baseUrl: baseUrl.replace(/\/+$/, ''), model,
      inputUsdPerMillion: inUsd === '' ? null : Number(inUsd),
      outputUsdPerMillion: outUsd === '' ? null : Number(outUsd),
      contextTokens: context === '' ? null : Number(context),
      unmetered: unmeteredHere,
    };
    if (reg.default === null || has('default')) reg.default = name;
    writeRegistry(reg);
    console.log(`\nregistered "${name}" → ${label} at ${baseUrl}, model ${model}`);
    console.log(`key at ${stored.file} (${stored.protection})`);
    console.log(reg.default === name ? `"${name}" is the default endpoint.` : `the default endpoint is still "${reg.default}".`);
  } finally {
    rl?.close();
  }
}
function listEndpoints() {
  const reg = registry();
  const names = Object.keys(reg.endpoints);
  if (names.length === 0) { console.log(`no endpoints registered; run \`pnpm live-run --add-endpoint\``); return; }
  for (const name of names) {
    const e = reg.endpoints[name];
    const priced = e.inputUsdPerMillion !== null && e.outputUsdPerMillion !== null;
    console.log(`${name === reg.default ? '*' : ' '} ${name.padEnd(14)} ${e.label} — ${e.baseUrl}  model ${e.model}  ${hasKey(name) ? 'key stored' : 'NO KEY'}${e.unmetered ? '  unmetered' : priced ? `  ${e.inputUsdPerMillion}/${e.outputUsdPerMillion} USD per Mtok` : '  unpriced'}${typeof e.contextTokens === 'number' ? `  ${e.contextTokens} ctx` : ''}`);
  }
  console.log('\n* is the default. `--endpoint=<name>` picks another for one run.');
}

const USAGE = `pnpm live-run — the application against a real model endpoint, on purpose only.

  pnpm live-run                     the plan, and nothing else
  pnpm live-run --confirm           the run (it spends money; the ceiling is --budget, default 1.00 USD)

  pnpm live-run --add-endpoint      register an endpoint: label, base URL, model, context, prices, key (hidden)
                                    scripted: --name= --label= --base-url= --model= --context=<tokens>
                                              --in-price= --out-price= --unmetered --default
  pnpm live-run --endpoints         list what is registered, which is the default, which has a key
  pnpm live-run --set-default=<n>   make one the default
  pnpm live-run --set-key           replace one endpoint's key      (with --endpoint=<name>)
  pnpm live-run --forget-key        delete one endpoint's key       (with --endpoint=<name>)
  pnpm live-run --remove-endpoint=<n>

  --endpoint=<name>    the endpoint to run against (default: the registry's default)
  --model=<id>         override the endpoint's model for this run (and skip discovery)
  --no-discover-model  keep the registered model instead of reading the endpoint's /models listing
  --base-url=<url>     override the endpoint's base URL for this run
  --budget=<usd>       stop when the spend crosses this (default 1.00); needs a provider figure or prices
  --max-tokens=<n>     the ceiling when no money figure exists (default 500000)
                       an endpoint registered --unmetered carries no ceiling unless one of these two is named here
  --max-iterations=<n> the ceiling written into the workspace's runtime configuration (default 500)
  --only=<csv>         run only some of ${OPTIONAL.join(', ')} (sign-in always runs; the sandbox is fresh)
                       and ${OPT_IN.join(', ')}, which only run when named (duress the long one, tens of minutes;
                       cutoff a few, LIVE_RUN_CUTOFF_MIN its Per-agent timeout in minutes, default 1)
  --duress-fixture=<dir>  the workspace duress opens (default: the same small todo-app the others use)
  --keep-runs=<n>      evidence packs to keep under .live-run/runs (default 10; the oldest are pruned)
  --session-log-level=<lvl>  the sandbox's session_log_level (default INFO; WARNING is the product's own default)
  --app-log-level=<lvl>      the application log's threshold, ROTARIS_APP_LOG_LEVEL (debug|info; default: unset, the
                             product's own info). warning and error are refused: they drop the info lines the run reads
  --no-record-traffic  talk to the endpoint directly; do not record request and response bodies
  --gui                show the window each scenario drives, to watch it (hidden by default; nothing else changes)
  --keep               keep the sandbox workspace instead of deleting it
  --skip-build         trust apps/desktop/out as it stands; the code-intelligence bundle must already be there
                       (pnpm code-intel:bundle), or the run refuses at once — without this flag it is built
`;

if (has('help')) { console.log(USAGE); process.exit(0); }
if (has('endpoints')) { listEndpoints(); process.exit(0); }
if (has('add-endpoint')) { await addEndpoint(); process.exit(0); }
if (value('set-default', null) !== null) {
  const reg = registry();
  const name = value('set-default', '');
  if (!reg.endpoints[name]) { console.error(`no endpoint named "${name}"`); process.exit(1); }
  reg.default = name; writeRegistry(reg); console.log(`the default endpoint is "${name}"`); process.exit(0);
}
if (value('remove-endpoint', null) !== null) {
  const reg = registry();
  const name = value('remove-endpoint', '');
  if (!reg.endpoints[name]) { console.error(`no endpoint named "${name}"`); process.exit(1); }
  delete reg.endpoints[name];
  if (reg.default === name) reg.default = Object.keys(reg.endpoints)[0] ?? null;
  writeRegistry(reg); rmSync(dpapiFileFor(name), { force: true }); rmSync(plainFileFor(name), { force: true });
  console.log(`removed "${name}" and its key`); process.exit(0);
}

/** The endpoint this invocation is about: --endpoint, else the registry's default. */
function chosenEndpoint() {
  const found = selectEndpoint(registry(), value('endpoint', null));
  if (found === null) return null;
  return { ...found, baseUrl: value('base-url', found.baseUrl).replace(/\/+$/, ''), model: value('model', found.model) };
}

if (has('set-key')) {
  const endpoint = chosenEndpoint();
  if (endpoint === null) { console.error('no endpoint registered; run `pnpm live-run --add-endpoint`'); process.exit(1); }
  const stored = storeKey(endpoint.name, promptSecret(`API key for ${endpoint.name} (hidden)`));
  console.log(`stored at ${stored.file} (${stored.protection})`); process.exit(0);
}
if (has('forget-key')) {
  const endpoint = chosenEndpoint();
  if (endpoint === null) { console.error('no endpoint registered'); process.exit(1); }
  const removed = [dpapiFileFor(endpoint.name), plainFileFor(endpoint.name)].filter((file) => existsSync(file));
  for (const file of removed) rmSync(file, { force: true });
  console.log(removed.length === 0 ? `no key was stored for "${endpoint.name}"` : `removed ${removed.join(', ')}`); process.exit(0);
}

const endpoint = chosenEndpoint();
if (endpoint === null) {
  console.log(USAGE);
  console.error('No endpoint is registered. Run `pnpm live-run --add-endpoint` first.');
  process.exit(1);
}
const { key, source: keySource } = endpointKey(keyStore, endpoint.name);

/**
 * The model the run uses, asked of the ENDPOINT rather than remembered.
 *
 * A self-hosted endpoint serves whatever is loaded into it, and what is loaded changes — the registry's stored id
 * is a note of what was there when it was registered, not a fact about what is there now. So the endpoint's own
 * `/models` listing is read at every start and its FIRST entry is the model the run uses, exactly as a caller with
 * no prior knowledge would pick one. The stored id stays as the fallback for an endpoint that serves no listing,
 * and `--model=` still wins over both: an explicit choice is never overridden by discovery.
 *
 * Failure is never fatal. A listing that cannot be read, is empty, or is not the shape OpenAI's API documents
 * leaves the stored id in place and says why — the run is about the product, and refusing to start it over a
 * convenience read would be the wrong trade.
 */
async function discoverModel(baseUrl, bearer) {
  const url = `${baseUrl}/models`;
  try {
    const res = await fetch(url, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
    if (!res.ok) return { ok: false, reason: `${url} answered ${res.status} ${res.statusText}` };
    const body = await res.json();
    const list = Array.isArray(body?.data) ? body.data : null;
    if (list === null) return { ok: false, reason: `${url} answered without a \`data\` array` };
    const ids = list.map((entry) => (typeof entry?.id === 'string' ? entry.id.trim() : '')).filter((id) => id !== '');
    if (ids.length === 0) return { ok: false, reason: `${url} lists no model with an id` };
    const first = list.find((entry) => typeof entry?.id === 'string' && entry.id.trim() === ids[0]) ?? {};
    return { ok: true, model: ids[0], all: ids, url, entry: first };
  } catch (cause) {
    return { ok: false, reason: `${url} could not be reached: ${String(cause instanceof Error ? cause.message : cause)}` };
  }
}

const modelWasAsked = value('model', null) !== null;
const discovery = modelWasAsked || has('no-discover-model') ? null : await discoverModel(endpoint.baseUrl, key);
if (discovery?.ok) {
  endpoint.model = discovery.model;
  /*
   * The context window comes from the same listing, for the same reason the model does: the registry's figure was
   * measured against whatever was loaded the day the endpoint was registered, and a different model has a different
   * window. vLLM states it as `max_model_len`; an OpenAI-compatible gateway may state `context_length`. Neither is
   * guaranteed, so an entry that states no window leaves the registered figure alone rather than clearing it.
   */
  const stated = [discovery.entry?.max_model_len, discovery.entry?.context_length].find((n) => typeof n === 'number' && n > 0);
  if (stated !== undefined) endpoint.contextTokens = stated;
}
const modelSource = modelWasAsked ? '--model' : discovery === null ? 'the registry (discovery off)' : discovery.ok ? `discovered from ${discovery.url}` : `the registry — discovery failed: ${discovery.reason}`;

const PROVIDER_ID = instanceIdFor(endpoint.label);
const QUALIFIED = `${PROVIDER_ID}/${endpoint.model}`;
/** OpenRouter is the one endpoint in this build whose own accounting can be read; everything else is priced or counted. */
const providerAccounting = /(^|\/\/|\.)openrouter\.ai(\/|$)/.test(endpoint.baseUrl);
const priced = typeof endpoint.inputUsdPerMillion === 'number' && typeof endpoint.outputUsdPerMillion === 'number';
/** An endpoint registered unmetered spends nothing that needs guarding — the owner's own hardware — so no ceiling
 * is imposed on it unless this invocation asks for one by naming `--budget` or `--max-tokens` itself. */
const unmetered = endpoint.unmetered === true;
const ceilingAsked = argv.some((a) => a.startsWith('--budget=') || a.startsWith('--max-tokens='));
const accountingKind = unmetered && !ceilingAsked ? 'unmetered' : providerAccounting ? 'provider' : priced ? 'priced' : 'tokens';

if (!has('confirm')) {
  console.log(USAGE);
  console.log(`Endpoint: ${endpoint.name} — ${endpoint.label} at ${endpoint.baseUrl}`);
  console.log(`Model:    ${endpoint.model} (${modelSource})${discovery?.ok && discovery.all.length > 1 ? `; the endpoint also serves ${discovery.all.slice(1).join(', ')}` : ''}`);
  console.log(`Context:  ${typeof endpoint.contextTokens === 'number' ? `${endpoint.contextTokens} tokens` : 'whatever discovery reports'}`);
  console.log(`Plan:     ${['sign-in', ...wanted].join(' → ')}, ${MAX_ITERATIONS} iterations per run`);
  console.log(`Window:   ${GUI ? 'shown — each scenario appears on screen (--gui)' : 'hidden — add --gui to watch it'}`);
  console.log(`Traffic:  ${RECORD_TRAFFIC ? 'recorded — request and response bodies through a loopback proxy, one file per scenario' : 'not recorded (--no-record-traffic)'}`);
  console.log(`Ceiling:  ${accountingKind === 'unmetered' ? 'none — registered unmetered; only the iteration ceiling binds' : accountingKind === 'tokens' ? `${MAX_TOKENS} tokens (this endpoint reports no cost and carries no prices)` : `${BUDGET.toFixed(2)} USD, ${accountingKind === 'provider' ? "read from the provider's own accounting" : 'estimated from the registered prices'}`}`);
  console.log(`Key:      ${keySource ?? `NONE — run \`pnpm live-run --set-key --endpoint=${endpoint.name}\`, or set ${KEY_ENV}`}`);
  const bundleNow = runBundleScript(['--check'], 60_000);
  console.log(`Bundle:   ${bundleNow.status === 0 ? 'the code-intelligence runtime is present' : `absent or stale — ${has('skip-build') ? 'a --skip-build run refuses to start; run `pnpm code-intel:bundle` first' : 'the run builds it (`pnpm code-intel:bundle`) before the first launch'}`}`);
  console.log('\nNothing ran. Add --confirm to spend.');
  process.exit(2);
}
if (key === null || key === '') { console.error(`No key for "${endpoint.name}". Run \`pnpm live-run --set-key --endpoint=${endpoint.name}\`, or set ${KEY_ENV}.`); process.exit(1); }
/*
 * The bundled code-intelligence runtime is a precondition, as it is `init-proof`'s: without it every launch's setup and
 * discovery fail, and the run judges a tree in which code intelligence never ran. The duress run at 1763f7f did exactly
 * that on a `--skip-build` tree with no bundle and passed all 18 checks in silence
 * (`docs/defects/fixed/the-live-run-runs-without-the-code-intelligence-bundle-and-passes-without-saying-so.md`). With
 * `--skip-build` an absent or stale tree refuses here, before a pack or a sandbox exists; without it the bundle is built
 * beside the desktop build. Every launch then states whether its code-intelligence discovery succeeded (`launch`).
 */
let codeIntelligenceBundle;
try {
  codeIntelligenceBundle = ensureBundle({
    skipBuild: has('skip-build'),
    consequence: 'Without it every launch\'s code-intelligence setup and discovery fail (REQ-WORKSPACE-084, REQ-MCP-042), and this run would judge a tree in which code intelligence never ran.',
  });
} catch (cause) {
  console.error(`live-run refused: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
}
console.log(`Bundle:   ${codeIntelligenceBundle === 'built' ? 'the code-intelligence runtime was built (pnpm code-intel:bundle)' : 'the code-intelligence runtime is present'}`);
const redact = (text) => text.split(key).join('[redacted]');
console.log(`Model:    ${endpoint.model} (${modelSource})`);
if (GUI) console.log('window:   shown (--gui) — the window is driven from inside the process, so clicking it does not steer the run, but typing into it does write into the product');

// ── What has been spent ──────────────────────────────────────────────────────────────────────────────────────
async function providerCredits() {
  const res = await fetch(`${endpoint.baseUrl}/key`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`the endpoint refused the key check: ${res.status} ${res.statusText}`);
  const body = await res.json();
  const data = body?.data ?? {};
  return { usage: typeof data.usage === 'number' ? data.usage : null, remaining: data.limit_remaining ?? null };
}
const before = accountingKind === 'provider' ? await providerCredits() : { usage: null, remaining: null };
if (before.remaining !== null && before.remaining < BUDGET) console.error(`warning: the key has ${before.remaining} USD left, below the ${BUDGET.toFixed(2)} USD ceiling.`);

// ── The build, the sandbox and the evidence ──────────────────────────────────────────────────────────────────
/**
 * Prune, never wipe. The newest `KEEP_RUNS` packs stay; the oldest go. A pack that cannot be removed — the same
 * locked handle the sandbox sweep already forgives — is reported and skipped rather than killing the run before
 * it starts, because losing an old pack is not a reason to lose this one.
 */
mkdirSync(join(EVIDENCE_ROOT, 'runs'), { recursive: true });
const priorRuns = readdirSync(join(EVIDENCE_ROOT, 'runs')).sort();
for (const old of priorRuns.slice(0, Math.max(0, priorRuns.length - (KEEP_RUNS - 1)))) {
  try { rmSync(join(EVIDENCE_ROOT, 'runs', old), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (cause) { console.error(`warning: the pack ${old} could not be pruned: ${cause instanceof Error ? cause.message : String(cause)}`); }
}
mkdirSync(output, { recursive: true });
writeFileSync(join(EVIDENCE_ROOT, 'latest.txt'), `${output}\n`);
if (!has('skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`the desktop build exited ${built.status ?? built.signal ?? 'unknown'}; see build.log`);
}
if (!existsSync(electron)) throw new Error(`the Electron executable is absent: ${electron}`);

const SANDBOX_ROOT = join(tmpdir(), 'rotaris-live-run');
/**
 * The sandbox holds a real credential — the app writes the leased key into its own store, exactly as it would on
 * the owner's machine — so the credential directory is deleted on every exit path there is, including `--keep`,
 * a thrown error and a Ctrl-C. `--keep` keeps the workspace and the store to read, never the key.
 */
const dropCredentials = (dir) => rmSync(tokensDirFor(join(dir, 'local')), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
function cleanup(keep) {
  dropCredentials(sandbox);
  // A transient Windows lock — an antivirus reading the store, a process still closing — can outlast the retries;
  // a throw here would run through the fatal handler's second cleanup and end the process at Node's exit 7
  // (docs/defects/fixed/the-live-runs-cleanup-crashes-the-fatal-handler-on-a-transient-windows-file-lock.md).
  try {
    if (keep) writeFileSync(join(sandbox, KEPT_FILE), `kept by --keep at ${new Date().toISOString()}; its credential store was deleted.\n`);
    else rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (cause) {
    console.error(`warning: the sandbox could not be removed (${cause instanceof Error ? cause.message : String(cause)}); its credentials are already deleted, and the next run's sweep removes the leftover`);
  }
}
// Whatever a previous run left behind loses its credentials now, and loses everything unless it was kept on purpose.
// A sandbox whose `OWNER` is a live process is a concurrent live run's, and is left alone with its key: the sweep
// used to take every directory here for a leftover, and a run that started second deleted a running sibling's
// workspace, store and key (`docs/defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md`; the rule is
// `lib/sandbox-sweep.mjs`'s). A locked handle (measured 2026-09-19: a Serena language server kept the prior sandbox's
// workspace open past process exit, so `rmSync` threw EPERM out of the sweep and the run died before starting) must
// never kill the run: the sweep reports the leftover and continues, and the startup of THIS run re-sweeps it next time.
for (const left of sweepSandboxes(SANDBOX_ROOT, { dropCredentials })) {
  if (left.action === 'leave') console.log(`sandbox sweep: left ${left.dir} — ${left.reason}`);
}
const sandbox = join(SANDBOX_ROOT, stamp);
const workspace = join(sandbox, 'workspace');
const local = join(sandbox, 'local');
// `OWNER` first, before anything else goes in: from here on a concurrent run's sweep reads this sandbox as live.
mkdirSync(sandbox, { recursive: true });
writeOwner(sandbox);
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
// An interrupt or a crash is an exit path too: it may not strand the key in the temp directory, and once the run's ending
// exists (`runEnding`, set beside `finish` below) it may not cost the pack its results either. Until 2026-10-20 a launch
// that overran threw into these handlers, which deleted the sandbox and exited: the checks every earlier scenario had
// computed were never written, and the failed scenario's session went with the sandbox
// (`docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`; `lib/run-ending.mjs`).
// A signal also ends the launch in flight, which `timeout`'s SIGTERM to this process alone would otherwise leave running;
// before its `let` is reached that read throws, and is caught.
let runEnding = null;
const endOnFatal = (code, error) => {
  if (runEnding !== null) { runEnding(code, error); return; }
  closeProxy(); cleanup(false); process.exit(typeof error?.exitCode === 'number' ? error.exitCode : code);
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  console.error(`\n${signal}: ending the run, then deleting the sandbox.`);
  try { launchInFlight?.kill('SIGKILL'); } catch { /* none in flight yet */ }
  endOnFatal(130, Object.assign(new Error(`${signal}: the run was interrupted`), { exitCode: 130 }));
});
for (const fatal of ['uncaughtException', 'unhandledRejection']) process.on(fatal, (error) => { console.error(`${fatal}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`); endOnFatal(1, error); });
const workspaceFixture = DURESS_FIXTURE === null ? fixture : resolve(DURESS_FIXTURE);
if (!existsSync(workspaceFixture)) throw new Error(`--duress-fixture names no directory: ${workspaceFixture}`);
cpSync(workspaceFixture, workspace, { recursive: true, filter: (from) => !/[\\/](?:node_modules|\.git)$/.test(from) });
const GIT_IDENTITY = { GIT_AUTHOR_NAME: 'rotaris-live-run', GIT_AUTHOR_EMAIL: 'live-run@rotaris.invalid', GIT_COMMITTER_NAME: 'rotaris-live-run', GIT_COMMITTER_EMAIL: 'live-run@rotaris.invalid' };
const git = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).trim();
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { console.error('the live run needs git on PATH: the workspace is a repository and the edit is read back from `git diff`.'); process.exit(1); }
git('init', '-q', '-b', 'main');
git('add', '.');
git('commit', '-q', '-m', `${basename(workspaceFixture)}, before the live run`);
const head = git('rev-parse', 'HEAD');

const tokensFile = join(tokensDirFor(local), `${PROVIDER_ID}.json`);
const snapshotFile = join(configDirFor(local), 'project_settings.yaml');
const agentsFile = join(workspace, '.rotaris', 'agents.yaml');

function oneDatabase() {
  const databases = findDatabases(local);
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`);
  return databases[0];
}
/** Every session id the store holds, in creation order; none before the first launch has made the store. */
function sessionIds() {
  try {
    const Database = require('better-sqlite3');
    const handle = new Database(oneDatabase(), { readonly: true });
    try { return handle.prepare('SELECT session_id FROM sessions ORDER BY created_at, rowid').all().map((r) => r.session_id); }
    finally { handle.close(); }
  } catch { return []; }
}

/** What each scenario left in the pack, reported in `results.json` so a reader knows what exists without listing it. */
const scenarioEvidence = {};
/** Every session `preserveRun` kept, `{ scenario, sessionId }` in run order: what `checkToolRecord` reads at the end. */
const preservedSessions = [];

/** One scenario's recorded model traffic, as records. An absent or half-written file reads as no records. */
function readTraffic(name) {
  const file = join(output, name, 'model-traffic.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}
/** One directory per scenario, so a pack reads as the run did rather than as one flat heap of prefixed names. */
function scenarioDir(name) {
  const dir = join(output, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * The readable half of the launch log. The verbatim log is always kept beside it — a line this drops must be
 * recoverable, so nothing here is a substitute for `app.log`, only a way to read it.
 *
 * Three reductions, in order of how much they take:
 *   1. a child MCP server's stderr, forwarded into the application log at `debug` by `packages/mcp/src/transport.ts`.
 *      Two thirds of a live launch log was one language server's boot noise (190 of 288 lines, measured on the
 *      2026-09-21 pack; 141 of 195 measured independently on 2026-09-16). Since PD-MONITOR-002 the product records
 *      `info` and above unless `ROTARIS_APP_LOG_LEVEL` says otherwise, and `cleanEnvironment()` strips that name from
 *      this launch, so those lines are absent from `app.log` unless `--app-log-level=debug` or a scenario's own
 *      `extra` sets it to `debug`.
 *   2. consecutive repeats of one line, collapsed to the line and a count, the shape `transport.ts` already uses.
 *   3. the sandbox's absolute path, which prefixes most lines at about ninety characters, shortened to `<sandbox>`.
 */
function filterLog(text, sandboxPath) {
  const dropped = { mcpStderr: 0, repeats: 0 };
  const short = (line) => line.split(sandboxPath).join('<sandbox>');
  const out = [];
  let previous = null;
  let run = 0;
  const flush = () => {
    if (previous !== null && run > 1) { out.push(`  … the line above repeated ${run} times`); dropped.repeats += run - 1; }
  };
  for (const raw of text.split('\n')) {
    if (/\] debug +(?:run host|workspace service): mcp \S+ stderr: /.test(raw)) { dropped.mcpStderr += 1; continue; }
    const body = short(raw).replace(/^\[[^\]]*\] /, '');
    if (body === previous) { run += 1; continue; }
    flush();
    previous = body;
    run = 1;
    out.push(short(raw));
  }
  flush();
  return { text: out.join('\n'), dropped };
}

/** No bearer may reach the evidence — the substitution is the belt, these two are the braces. */
function assertNoCredential(what, text) {
  if (/sk-[a-z-]*[a-z0-9]{16,}/i.test(text)) throw new Error(`${what} carries something shaped like an API key`);
  if (/Bearer\s+(?!\*\*\*)\S{20,}/.test(text)) throw new Error(`${what} carries a bearer value`);
}

/**
 * One launch of the built application, ASYNCHRONOUSLY — and the reason that word is load-bearing.
 *
 * Every scenario used `spawnSync`, which blocks this process's event loop for the whole scenario. That was
 * harmless while the harness only watched a child and read its output at the end. It stopped being harmless the
 * moment the recording proxy moved into the path: an in-process HTTP server cannot answer a request while the
 * loop is blocked, so the app's very first model call would hang until the scenario's own wait expired.
 * Measured before the repair: a child fetching a loopback server in this process while `spawnSync` blocked it
 * got **no answer in 6 s**, and the server served **0** requests. Nothing about the recording was wrong; what
 * was wrong was that the harness could not run a server and a scenario at the same time.
 *
 * `spawn` plus a promise restores that, and it is also what the fault scenario's own timers need — a press or
 * a kill scheduled DURING a run is impossible under a blocked loop, which is why no scenario had ever done one.
 * The returned shape is `spawnSync`'s (`status`, `signal`, `stdout`, `stderr`) so every caller reads unchanged.
 *
 * The wait ends at the launch's own bound, never at whatever still holds its pipes (`lib/settle-launch.mjs`): it settles on
 * the main process's `exit` and drains the pipes for a few seconds, where it used to wait for `close`. On Windows the bound's
 * SIGKILL ends main alone, and at `8080fbda` two processes of the killed main kept its pipes for eight hours, so the run's
 * wait on the `crlf` launch did too (`docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md`).
 */
function runElectron(args, { timeout, env }) {
  const child = spawn(electron, args, { cwd: app, windowsHide: !GUI, env });
  launchInFlight = child;
  return settleLaunch(child, { timeoutMs: timeout });
}
/** The launch a scheduled fault acts on. Null between scenarios. */
let launchInFlight = null;

async function launch(name, extra, timeoutMs = 180_000) {
  const dir = scenarioDir(name);
  const png = join(dir, `${name}.png`);
  // Each scenario's model traffic lands in its own file, so a record is always attributable to a scenario.
  proxy?.sink(join(dir, 'model-traffic.jsonl'));
  /*
   * Two extra photographs, at a fifth and three fifths of the scenario's OWN wait budget, so a run that stalls
   * leaves a picture of where it stalled instead of one frame of whatever was on screen when it gave up. They
   * are proportional rather than fixed because the budgets here span 120 s (sign-in) to 900 s (the board), and
   * a fixed offset would photograph the splash screen in one and the finished run in the other. A caller that
   * names its own `_PNG_AT` keeps it; `capture/seams.ts` reads them at those offsets and writes nothing if the
   * launch has already exited.
   */
  const budget = Number(extra['ROTARIS_CAPTURE_WAIT_MS'] ?? 0);
  const paced = budget > 0 && extra['ROTARIS_CAPTURE_PNG_AT'] === undefined
    ? { ROTARIS_CAPTURE_PNG_AT: `${join(dir, `${name}.early.png`)}@${Math.round(budget * 0.2)};;${join(dir, `${name}.mid.png`)}@${Math.round(budget * 0.6)}` }
    : {};
  /*
   * The capture's bound counts from the prompt's submission (finding P6), this kill limit from the spawn: the typing
   * time is added here so it no longer comes out of the margin (`lib/prompt-typing.mjs`).
   */
  const typingMs = typingAllowanceMs(extra);
  // The sessions the store holds before this launch, so a launch that fails leaves the one it made to the pack.
  const sessionsBefore = sessionIds();
  const result = await runElectron([join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    timeout: timeoutMs + typingMs,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ profileRoot: sandbox, local, preferences: join(sandbox, 'preferences') }),
      ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      // `--app-log-level`, ahead of `extra` so a scenario that names its own threshold keeps it.
      ...(APP_LOG_LEVEL === null ? {} : { ROTARIS_APP_LOG_LEVEL: APP_LOG_LEVEL }),
      ...paced,
      ...extra,
    },
  });
  launchInFlight = null;
  const log = redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  writeFileSync(join(dir, 'app.log'), log);
  const filtered = filterLog(log, sandbox);
  writeFileSync(join(dir, 'app.filtered.log'), `${filtered.text}\n`);
  scenarioEvidence[name] = { dir: relative(output, dir), lines: log.split('\n').length, filteredLines: filtered.text.split('\n').length, ...filtered.dropped };
  // A process the launch started that still held its pipes when the wait let go (`lib/settle-launch.mjs`): named, never waited on.
  if (result.pipesHeld === true) {
    scenarioEvidence[name].pipesHeldAfterExit = true;
    console.error(`warning: ${name}: a process the launch started still held its output when its main process had ended; the wait let go of it after the drain`);
  }
  // A launch that overran or exited non-zero is a FAILED check of its scenario, and its session is preserved before the
  // throw ends the run through `runEnding`, which writes `results.json` with every check computed so far (`lib/run-ending.mjs`).
  const failure = (message) => launchFailure({ name, message, before: sessionsBefore, sessionsAfter: sessionIds, check, preserve: preserveRun, results });
  if (result.status !== 0) {
    const limit = result.timedOut === true
      ? ` (the harness's limit of ${timeoutMs + typingMs} ms, ${typingMs} ms of it for typing the prompt)`
      : '';
    throw failure(`${name} exited ${result.status ?? result.signal ?? 'unknown'}${limit}${result.unreaped === true ? ', and its SIGKILL was never reported as an exit' : ''}; see ${join(dir, 'app.log')}`);
  }
  if (!existsSync(png)) throw failure(`${name} produced no screenshot`);
  assertNoCredential(`${name}/app.log`, log);
  // PD-MONITOR-002, live-run findings a71-9 and U4: no launch's log carries one of the restatements `restated-facts.mjs`
  // knows (main's repository, Git view and lease lines, `runSetupSteps`' success, the run host's restated discovery
  // failure). A duplicate of another fact passes.
  const restated = restatedFacts(log);
  check(restated.length === 0, `${name}: none of the ${KNOWN_RESTATEMENTS} known restatements reaches the application log`, restated.map((r) => `app.log line ${r.line}, ${r.fact} restated (its owner is the ${r.owner}): ${r.text}`).join(' | ') || undefined);
  // Live-run finding D8 (docs/defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md): the
  // relayed renderer console lines naming React's update-depth error (React error 185) are counted for every launch (`results.json`
  // `scenarioEvidence.<name>.reactUpdateDepthErrors`). Since OQ-278's ruling (2026-10-13, R-072) a launch with any is a FAILURE
  // naming each line, its time beside the children's streams to be read in the autopsy; until then it was a NOTE, the cause
  // being unidentified. `check` accumulates and does not throw, so the duress launch's trap reading is still recorded after it.
  const updateDepth = updateDepthVerdict(name, log);
  scenarioEvidence[name].reactUpdateDepthErrors = updateDepth.count;
  check(updateDepth.passed, updateDepth.what, updateDepth.detail);
  // Finding U5: whether code intelligence ran in this launch is stated, so a pass can never hide that it did not. A launch
  // that starts no run discovers nothing — a NOTE, unless a setup step failed; a discovery that failed, or that listed no
  // tool, is a FAILURE (`codeIntelligenceStatement`).
  const intelligence = codeIntelligenceStatement(name, log);
  scenarioEvidence[name].codeIntelligence = intelligence.reading;
  if (intelligence.verdict === 'note') noted(intelligence.label, intelligence.detail);
  else check(intelligence.verdict === 'pass', intelligence.label, intelligence.detail);
  return log;
}
/** The store as the run left it: the newest session, its rows, its events, and the totals across every session. */
/**
 * PD-MONITOR-001 revision 2, asserted by EVERY scenario that reads a session rather than by one of its own: the run's
 * cost carries the qualifier it earned, and where the only prices are the ones registered here, the total is exactly
 * the store's tokens times those prices — computed in scaled integers, so the check is as exact as the product must be.
 * A provider that reports its own figure takes precedence over a configured one, so there only the qualifier is read.
 */
const decimalOf = (text) => {
  const [whole, fraction = ''] = String(text).split('.');
  return { units: BigInt(`${whole}${fraction}` || '0'), scale: fraction.length };
};
const canonicalDecimal = (units, scale) => {
  const digits = units.toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
};
function expectedConfiguredCost(tokensIn, tokensOut) {
  // Registered as USD per MILLION tokens: six more places of scale, never a division in binary floating point.
  const a = decimalOf(endpoint.inputUsdPerMillion);
  const b = decimalOf(endpoint.outputUsdPerMillion);
  const scale = Math.max(a.scale, b.scale);
  const units = BigInt(tokensIn) * a.units * 10n ** BigInt(scale - a.scale) + BigInt(tokensOut) * b.units * 10n ** BigInt(scale - b.scale);
  return canonicalDecimal(units, scale + 6);
}
/**
 * REQ-CHAT-158, REQ-MONITOR-107 (acceptance K1 of the default live run at c2fdd6a): at the capture the run header's frozen
 * duration and the inspector's run-level row read one interval and must read one figure; the header floored it and the
 * row rounded it, a second apart in 3 of 4 runs. Asserted only when the header is frozen at a terminal state and the
 * inspector shows the run-level agent (`runDurationVerdict`): a capture of a run that is still live (a wait that ran out,
 * acceptance L4 at 3c3f447) reads two figures by design, the call in flight against the time since spawn, and is noted,
 * as is one that shows another agent, whose row is then not the run's.
 */
function checkRunDuration(name, log) {
  const reading = runDurationReading(log, 'orchestrator');
  const detail = `header "${reading.header}" (data-seconds ${reading.dataSeconds}, frozen ${reading.frozen}) · inspector "${reading.name}" "${reading.meta}"`;
  const { verdict, reason } = runDurationVerdict(reading);
  if (reason === 'not-terminal') { noted(`${name}: the run was not terminal at the capture (the header is not frozen), so the run duration's agreement is not read`, detail); return; }
  if (reason === 'another-agent') { noted(`${name}: the inspector showed another agent at the capture, so the run duration's agreement is not read`, detail); return; }
  check(verdict === 'pass', `${name}: the run header and the inspector's run-level row read the run's duration as one figure (K1)`, detail);
}
function checkPricing(name, session) {
  if (!session) return;
  const counted = (session.tokens_input ?? 0) + (session.tokens_output ?? 0) > 0;
  if (!counted) { noted(`${name}: no tokens were counted, so no price is asserted`, `${session.cost} (${session.cost_qualifier})`); return; }
  if (accountingKind === 'priced') {
    check(session.cost_qualifier === 'configured', `${name}: the run's cost reads at configured rates`, `${session.cost} (${session.cost_qualifier})`);
    const expected = expectedConfiguredCost(session.tokens_input, session.tokens_output);
    const stored = canonicalDecimal(decimalOf(session.cost).units, decimalOf(session.cost).scale);
    check(stored === expected, `${name}: the cost is exactly its tokens at the registered prices`, `${session.tokens_input} in × ${endpoint.inputUsdPerMillion}/M + ${session.tokens_output} out × ${endpoint.outputUsdPerMillion}/M = ${expected}; stored ${session.cost}`);
  } else if (accountingKind === 'provider') {
    check(['reported', 'configured', 'incomplete'].includes(session.cost_qualifier), `${name}: the run's cost carries a qualifier a figure earns`, `${session.cost} (${session.cost_qualifier})`);
  } else {
    check(session.cost_qualifier === 'unknown', `${name}: an unpriced endpoint's run reads price not established`, `${session.cost} (${session.cost_qualifier})`);
  }
}
function readSession() {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try {
    const session = db.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed, tool_calls, tokens_input, tokens_output, cost, cost_qualifier FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    if (!session) return null;
    const rows = db.prepare('SELECT kind, settled, tool_name, tool_status, body FROM transcript_rows WHERE session_id = ? ORDER BY row_index').all(session.session_id);
    const events = db.prepare('SELECT kind, payload FROM events WHERE session_id = ? ORDER BY ordinal').all(session.session_id);
    const totals = db.prepare('SELECT COALESCE(SUM(tokens_input), 0) AS input, COALESCE(SUM(tokens_output), 0) AS output FROM sessions').get();
    // The ring the gate writes, by the agent that dispatched: what the session's own counter must agree with.
    const byAgent = db.prepare('SELECT agent_name, COUNT(*) AS calls FROM tool_calls WHERE session_id = ? GROUP BY agent_name ORDER BY agent_name').all(session.session_id);
    return { session, rows, events, totals, byAgent };
  } finally { db.close(); }
}
/** Every improvement artifact the store holds (N58), newest first, its body parsed: what the two improvement passes left. */
function improvementArtifacts() {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try {
    return db.prepare('SELECT artifact_id, source_session_id, source_kind, body FROM improvement_artifacts ORDER BY generated_at DESC, artifact_id ASC').all()
      .map((row) => { let artifact = {}; try { artifact = JSON.parse(row.body); } catch { /* a body that will not parse reads as empty */ } return { ...row, artifact }; });
  } finally { db.close(); }
}
/**
 * Every tool call of one session with its `entry` parsed — `{ ordinal, tool_name, agent_name, status, args, result,
 * elapsedMs, endedAt }`.
 *
 * The scenarios below assert from THIS and never from the model's prose. A run that says it ran a command and a
 * run that ran one are different facts, and only one of them is in the store.
 */
function readToolCalls(sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try {
    return db.prepare('SELECT ordinal, tool_name, agent_name, status, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(sessionId)
      .map((call) => {
        let entry = {};
        try { entry = JSON.parse(call.entry); } catch { /* a row that will not parse is still a call that happened */ }
        // `elapsed_ms` is the call's own duration and `timestamp` its end, both as the product recorded them.
        // `call_id` and `failure_kind` are what an issue's `evidence_ref` and REQ-SESSION-136's mapping read (a71-6).
        return { ...call, args: entry.args ?? {}, result: String(entry.result ?? ''), isError: entry.is_error === true, callId: typeof entry.call_id === 'string' ? entry.call_id : null, failureKind: typeof entry.failure_kind === 'string' ? entry.failure_kind : null, elapsedMs: typeof entry.elapsed_ms === 'number' ? entry.elapsed_ms : null, endedAt: typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : null };
      });
  } finally { db.close(); }
}
/**
 * One session's own log (REQ-SESSION-142), read from the sandbox's store beside the database — the file `preserveRun`
 * copies into the pack. Empty when the run wrote none at the sandbox's `session_log_level`.
 */
function readSessionLog(sessionId) {
  const file = join(dirname(oneDatabase()), 'sessions', sessionId, 'session.log');
  try { return existsSync(file) ? readFileSync(file, 'utf8') : ''; } catch { return ''; }
}
/** One session's `issues` rows — what the product itself recorded as having gone wrong, in its own words. */
function readIssues(sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try { return db.prepare('SELECT ordinal, id, recorded_at, kind, severity, actor, message, evidence_ref, metadata FROM issues WHERE session_id = ? ORDER BY ordinal').all(sessionId); }
  finally { db.close(); }
}
/** One session's loop-supervisor timeline entries and its delegated children's canonical names (PD-ORCH-009 revision 3). */
function readSupervision(sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try {
    const activations = db.prepare("SELECT name, actor, message, metadata FROM timeline WHERE session_id = ? AND name = 'loop_supervisor_activation' ORDER BY ordinal").all(sessionId);
    const childNames = db.prepare('SELECT canonical_name FROM children WHERE session_id = ?').all(sessionId).map((c) => c.canonical_name);
    return { activations, childNames };
  } finally { db.close(); }
}
/**
 * The root a session's write fence stands on, from its own record (`fenceRootOf` in `lib/tool-frictions.mjs`): a
 * requirements run's worktree, any other session's workspace root, the sandbox's workspace where the row names neither.
 * Until fin25 every session was judged by the workspace, and a requirements session's create-shaped call naming a
 * workspace path outside its worktree read as the old shape
 * (`docs/defects/fixed/the-live-runs-pd-tools-007-check-judges-a-requirements-runs-fence-by-the-workspace.md`).
 */
function readFenceRoot(sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try { return fenceRootOf(db.prepare('SELECT workspace_root, worktree FROM sessions WHERE session_id = ?').get(sessionId) ?? {}) ?? workspace; }
  finally { db.close(); }
}

/**
 * The tool-call record of EVERY session the run preserved, read once at the end (`lib/tool-frictions.mjs`'s
 * `runWideReadings`), for four rulings:
 *
 * - **REQ-SESSION-136 for the tool gate's own refusals** (live-run finding a71-6): every call the gate refused as
 *   `invalid_request` — an unknown tool, unreadable arguments, a schema violation — is a failure in the record, and files a
 *   `tool_error` issue referencing it. The duress run of 2026-10-01 held two that no issue named.
 * - **PD-TOOLS-007** (R-071): a `write_file` with a path and content and no `operation` for a new file is read as a create;
 *   one refused for want of an operation is the old shape — its arguments read from the record whole, or from the string
 *   the session writer cuts an error-path record's long arguments to. A path the fence refuses is the directive's own
 *   refusal, reported and not failed.
 * - **PD-TOOLS-008** (R-071): a `todo` `replace` marking two tasks in progress refused without naming an id it never stored.
 * - **REQ-SESSION-136 under REQ-SESSION-194** (live-run finding M3): an error-path record cut to 2,000 characters ends with
 *   the `...` marker, and its arguments stay an object (`lib/error-record-cuts.mjs`).
 *
 * Until fin23 these read the `frictions` and `duress` sessions alone and their NOTEs spoke for the whole run, while the
 * requirements session held a refusal and the resume session the first inferred create
 * (`docs/defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`).
 * A shape no session held asked nothing, which is a NOTE naming the sessions read.
 */
function checkToolRecord() {
  if (preservedSessions.length === 0) return;
  let r;
  try {
    r = runWideReadings(preservedSessions.map(({ scenario, sessionId }) => ({ scenario, calls: readToolCalls(sessionId), issues: readIssues(sessionId), fenceRoot: readFenceRoot(sessionId) })));
  } catch (cause) {
    check(false, 'the tool-call record of every session the run kept was read', cause instanceof Error ? cause.message : String(cause));
    return;
  }
  const where = `the ${r.read.length} session(s) read: ${r.read.join(', ')}`;
  const at = (call) => `${call.scenario} #${call.ordinal}`;
  if (r.refused.length === 0) noted('no call was refused at the tool gate as invalid_request', `REQ-SESSION-136's issue for such a refusal was not observed in ${where}`);
  else check(r.unfiled.length === 0, 'every call refused at the tool gate as invalid_request filed a tool_error issue referencing it', r.unfiled.length === 0 ? `${r.refused.length} refusal(s): ${r.refused.map((c) => `${at(c)} (${c.tool_name})`).join(', ')}` : `${r.unfiled.length} of ${r.refused.length} filed none: ${r.unfiled.map((c) => `${at(c)} (${c.tool_name})`).join(', ')}`);
  const fenced = r.refusedFenced.length === 0 ? '' : `; ${r.refusedFenced.length} refused because the fence refuses the path, as the directive reads it (${r.refusedFenced.map(at).join(', ')})`;
  if (r.inferred.length === 0 && r.refusedInferable.length === 0) noted('no write_file call left out its operation for a path inside its session\'s fence', `PD-TOOLS-007's inferred create was not asked in ${where}${fenced}`);
  else check(r.refusedInferable.length === 0, 'every write_file call with a path and content and no operation was read as a create, or refused because its file exists or its path is fenced (PD-TOOLS-007)', r.refusedInferable.length === 0 ? `${r.inferred.length} read as a create: ${r.inferred.map((c) => `${at(c)} (${c.agent_name ?? '?'})`).join(', ')}${fenced}` : `${r.refusedInferable.length} refused for want of an operation: ${r.refusedInferable.map((c) => `${at(c)} (${c.agent_name ?? '?'})`).join(', ')}`);
  check(r.phantoms.length === 0, 'no todo call was sent to a task id a refusal named but never stored (PD-TOOLS-008)', r.phantoms.length === 0 ? `${r.severalActive.length} replace(s) refused for marking more than one task in progress, in ${where}` : `${at(r.phantoms[0])}: ${JSON.stringify(String(r.phantoms[0].result).slice(0, 100))}`);
  // REQ-SESSION-136's cut under REQ-SESSION-194's marker (live-run finding M3). The `frictions-cut` launch asks for one failing
  // command whose output passes the cap; a run that cut nothing asked nothing, which is a NOTE.
  const e = r.errorCuts;
  const seen = e.markedResults.length + e.markedArgs.length + e.failures.length;
  const list = (calls) => calls.map((c) => `${at(c)} (${c.tool_name})`).join(', ');
  if (seen === 0) noted('no error-path tool record was long enough to be cut', `REQ-SESSION-194's marker on REQ-SESSION-136's 2,000-character cut was not observed in ${where} (${e.errors.length} error-path record(s))`);
  else check(e.failures.length === 0, "every error-path tool record cut to 2,000 characters ends with REQ-SESSION-194's marker and keeps its arguments an object (REQ-SESSION-136)", e.failures.length === 0 ? `${e.markedResults.length} result(s) cut and marked${e.markedResults.length === 0 ? '' : ` (${list(e.markedResults)})`}; ${e.markedArgs.length} argument object(s) with a marked value${e.markedArgs.length === 0 ? '' : ` (${list(e.markedArgs)})`}` : [e.overlongResults.length === 0 ? '' : `result over 2,000: ${list(e.overlongResults)}`, e.unmarkedResults.length === 0 ? '' : `result of 2,000 with no marker: ${list(e.unmarkedResults)}`, e.stringArgs.length === 0 ? '' : `arguments stored as a string: ${list(e.stringArgs)}`].filter((x) => x !== '').join('; '));
  if (e.overCapArgs.length > 0) noted("error-path arguments passed 2,000 characters with what is never cut (PD-SESSION-003)", list(e.overCapArgs));
}

/**
 * OQ-213 as ruled (R-072), REQ-ORCH-029's todo clause over every preserved session (`lib/coordinator-todo.mjs`): no root's
 * second work item ran before an accepted root `todo` call, and a session whose root ran two or more stores an agent plan.
 * Each call the gate refused for want of a list is reported as a NOTE: it is the mechanism working, and what it cost.
 */
function checkCoordinatorTodo() {
  if (preservedSessions.length === 0) return;
  let r;
  let items;
  let held;
  let planIds;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    try {
      const read = preservedSessions.map(({ scenario, sessionId }) => {
        const rootNames = db.prepare('SELECT DISTINCT root_persona FROM iterations WHERE session_id = ?').all(sessionId).map((row) => row.root_persona);
        const calls = readToolCalls(sessionId);
        const todo = db.prepare('SELECT todo FROM sessions WHERE session_id = ?').get(sessionId)?.todo ?? null;
        // PD-TOOLS-006 revision 6 (OQ-220): the item each child served (`children.todo_item`, store v34).
        const children = db.prepare('SELECT task_id, canonical_name, persona, parent_id, depth, todo_item, spawned_at, completed_at, todo FROM children WHERE session_id = ? ORDER BY spawned_at, rowid').all(sessionId);
        // Each run of a child, from its timeline (finding L2): a `session_id` follow-up clears `completed_at`, so the row alone
        // cannot say when a followed-up child held its item (`holdingWindows`).
        const timeline = db.prepare("SELECT ordinal, at, name, metadata FROM timeline WHERE session_id = ? AND name IN ('child_start', 'child_end', 'child_resumed') ORDER BY ordinal").all(sessionId);
        const listed = calls.find((c) => rootNames.includes(c.agent_name) && c.tool_name === 'todo' && c.status === 'ok');
        return { scenario, rootNames, calls, agentPlanTasks: agentPlanTaskCount(todo), listedAt: listed?.endedAt ?? null, rootPlanIds: planItemIds(rootAgentPlan(todo)), rootPlan: rootAgentPlan(todo), children, timeline,
          runOverride: launchRunOverride(db.prepare('SELECT payload FROM launch_audits WHERE session_id = ?').get(sessionId)?.payload ?? null),
        };
      });
      r = coordinatorTodoReading(read);
      items = todoItemReading(read);
      held = heldItemReading(read);
      planIds = planIdReading(read);
    } finally { db.close(); }
  } catch (cause) {
    check(false, 'the coordinator\'s tool calls and stored todo were read for every session the run kept', cause instanceof Error ? cause.message : String(cause));
    return;
  }
  const at = (c) => `${c.scenario} #${c.ordinal} (${c.tool_name})`;
  check(r.unlisted.length === 0, 'no coordinator\'s second work item ran before it wrote a todo list of its own (REQ-ORCH-029, OQ-213)', r.unlisted.length === 0 ? `${r.multiStep.length} multi-step session(s): ${r.multiStep.join(', ') || 'none'}` : r.unlisted.map(at).join(', '));
  check(r.withoutPlan.length === 0, 'every multi-step coordinating session stores an agent plan (REQ-ORCH-029, REQ-TOOLS-147)', r.withoutPlan.length === 0 ? `${r.multiStep.length} multi-step session(s)` : `no agent plan stored: ${r.withoutPlan.join(', ')}`);
  if (r.refused.length > 0) noted('the gate refused a coordinator\'s second work item until it wrote its todo list (OQ-213)', r.refused.map(at).join(', '));
  if (r.single.length > 0) noted('sessions launched under the `single` run override were not read for the coordinator\'s todo list (REQ-ORCH-025)', r.single.join(', '));
  // PD-TOOLS-006 revision 6 (OQ-220): which todo item each implementation child served, read from the store.
  const child = (c) => `${c.scenario}: ${c.child}`;
  check(items.unnamed.length === 0, 'every root implementation delegation after the coordinator\'s first todo list names the item it serves (PD-TOOLS-006 revision 6, OQ-220)', items.unnamed.length === 0 ? `${items.named.length} child(ren) named an item` : items.unnamed.map((c) => `${child(c)} (${c.persona})`).join(', '));
  check(items.overlaps.length === 0, 'no two implementation children of one plan held one todo item at once (REQ-ORCH-028, REQ-ORCH-029)', items.overlaps.length === 0 ? `${items.read.length} session(s) read` : items.overlaps.map((o) => `${o.scenario}: ${o.children.join(' and ')} on ${o.item}`).join('; '));
  check(items.stale.length === 0, 'every todo item a child served is one its plan still holds (PD-TOOLS-006 revision 6)', items.stale.length === 0 ? `${items.named.length} named item(s)` : items.stale.map((c) => `${child(c)} on ${c.item}`).join(', '));
  // REQ-TOOLS-144 (fin47's reviewers' finding on A6, bundle `fin47-accept1-6`;
  // docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md,
  // docs/defects/fixed/the-live-run-never-checks-that-a-stored-plan-id-is-eight-hex.md): every id of a coordinating session's stored
  // plans, the root's and each child's own, is the tool's eight-hex one, so a recurrence of A6 fails the run rather than waiting
  // on an autopsy. A run whose coordinators stored no plan id asked nothing: a NOTE, never a PASS.
  if (planIds.ids === 0) noted('no coordinating session stored a plan id: REQ-TOOLS-144\'s eight-hex ids are unasked', `${planIds.coordinating.length} coordinating session(s): ${planIds.coordinating.join(', ') || 'none'}`);
  else check(planIds.foreign.length === 0, 'every phase and task id in a coordinating session\'s stored plans is eight-hex (REQ-TOOLS-144, finding A6)', planIds.foreign.length === 0 ? `${planIds.ids} id(s) in ${planIds.plans} plan(s) of ${planIds.coordinating.length} coordinating session(s)` : planIds.foreign.map((f) => `${f.scenario} ${f.owner === 'root' ? 'root' : `child ${f.owner}`} ${f.kind} '${f.id}'`).join(', '));
  const itemRefusals = preservedSessions.flatMap(({ scenario, sessionId }) => readToolCalls(sessionId).filter((c) => c.tool_name === 'delegate' && /todo item|todo_item '/.test(c.result) && /rejected/.test(c.result)).map((c) => ({ scenario, ordinal: c.ordinal, tool_name: c.tool_name })));
  if (itemRefusals.length > 0) noted('delegations refused for their todo item: unnamed, unknown, finished or held (PD-TOOLS-006 revision 6; target at most one per run, each followed by a named delegation)', itemRefusals.map(at).join(', '));
  // PD-TOOLS-008 revision 2 and PD-TOOLS-006 revision 7 (OQ-249): a running child's item reads IN_PROGRESS in its coordinator's
  // plan, and no item is closed while an implementation child still holds it; single-active refusals are a NOTE (target 0).
  const heldAt = (h) => `${h.scenario} #${h.ordinal}: ${h.child} on ${h.item}`;
  // Finding A7 (docs/defects/fixed/the-live-runs-todo-state-reader-reads-only-eight-hex-task-ids.md): the three checks below read
  // each item in the Todo state its coordinator's call carried. One they could not find there was passed over until fin47 (every
  // model-chosen id of the 3c03287 swarm session), so a held or closed item left unread fails here rather than passing on nothing.
  // An unread item says why (`todoItemState`; fin47's reviewers' finding,
  // docs/defects/fixed/the-live-runs-todo-state-reader-calls-an-item-it-was-not-shown-unparsed.md): `not shown` is the plan's
  // (the coordinator removed a held item, or never had it), `not parsed` the reader's own gap.
  const unreadAs = (why, says) => {
    const of = held.unread.filter((u) => u.why === why);
    return of.length === 0 ? [] : [`${says}: ${of.map((u) => `${u.scenario} #${u.ordinal} on ${u.item}`).join(', ')}`];
  };
  check(held.unread.length === 0, 'every todo item a running child held, or a closing replace sent, was read in its coordinator\'s Todo state (REQ-TOOLS-144, REQ-TOOLS-147, finding A7)', held.unread.length === 0 ? `${held.heldReads} held-item state(s) and ${held.closes.length} replace close(s) read in ${held.coordinating.length} coordinating session(s)` : [
    ...unreadAs('not shown', 'not shown in the Todo state (no task line carries the id: the plan no longer holds the item, or never did)'),
    ...unreadAs('not parsed', 'not parsed (a line carries the id in a shape the reader does not take: a gap of the reader)'),
  ].join('; '));
  check(held.heldPending.length === 0, 'no coordinator\'s plan recorded a running child\'s todo item PENDING (PD-TOOLS-008 revision 2, PD-TOOLS-006 revision 7, OQ-249)', held.heldPending.length === 0 ? `${held.heldReads} held-item state(s) read in ${held.coordinating.length} coordinating session(s): ${held.coordinating.join(', ') || 'none'}` : held.heldPending.map(heldAt).join(', '));
  check(held.closedWhileHeld.length === 0, 'no coordinator marked a todo item COMPLETED while an implementation child still held it (REQ-ORCH-029, OQ-249)', held.closedWhileHeld.length === 0 ? `${held.coordinating.length} coordinating session(s)` : held.closedWhileHeld.map(heldAt).join(', '));
  // Since PD-TOOLS-008 revision 4 (OQ-333) a served item counts against no mark, so the target of 0 has no accepted cause left.
  if (held.singleActive.length > 0) noted('todo calls refused under REQ-TOOLS-145 or PD-TOOLS-008 in coordinating sessions (OQ-249, OQ-333; target 0)', held.singleActive.map((h) => `${h.scenario} #${h.ordinal}`).join(', '));
  // PD-TOOLS-006 revision 11 (OQ-333): the resume line, the delegated items still open when the coordinator answered, and the
  // seconds from each child's end to its item's close.
  if (held.resumeLines.length > 0) noted('wait results that named a reported child\'s todo item still IN_PROGRESS (PD-TOOLS-006 revision 11, OQ-333)', held.resumeLines.map((h) => `${h.scenario} #${h.ordinal}: ${h.items.join(', ')}`).join('; '));
  if (held.openAtAnswer.length > 0) noted('delegated todo items still IN_PROGRESS when the coordinator answered, every child serving them ended (PD-TOOLS-006 revision 11, OQ-333)', held.openAtAnswer.map((h) => `${h.scenario}: ${h.item} (${h.children.join(', ')})`).join('; '));
  if (held.closeLatencies.length > 0) noted('seconds from a delegated child\'s end to its coordinator closing its todo item (PD-TOOLS-006 revision 11, OQ-333)', held.closeLatencies.map((h) => `${h.scenario} ${h.item} (${h.child}) #${h.ordinal}: ${h.seconds.toFixed(1)} s`).join('; '));
  // PD-TOOLS-008 revision 3 (OQ-255): a `replace` closing an item whose children have all ended closes it; a task a `replace` kept
  // over a different state is named in its observation, a NOTE (the next call should be an `update` for it).
  // A run in which no coordinator closed a served-and-ended item with a `replace` asked nothing of revision 3: a NOTE, never a
  // PASS (docs/defects/fixed/the-live-runs-closing-replace-check-passes-with-no-closing-replace.md; at 0bc3eee every close was an
  // `update`). The edit scenario's prompt asks for one closing `replace` so a default run can ask it.
  if (held.closes.length === 0) noted('no coordinator closed a delegated item with a todo replace once its children had ended: PD-TOOLS-008 revision 3\'s close is unasked (OQ-255)', `${held.coordinating.length} coordinating session(s): ${held.coordinating.join(', ') || 'none'}; every close was an update, or none came`);
  else check(held.restoredOverClose.length === 0, 'no closing todo replace left an item IN_PROGRESS once every child serving it had ended (PD-TOOLS-008 revision 3, OQ-255)', held.restoredOverClose.length === 0 ? `${held.closes.length} close(s) by replace, each stored as sent: ${held.closes.map((h) => `${h.scenario} #${h.ordinal} ${h.item} ${h.stored}`).join(', ')}` : held.restoredOverClose.map((h) => `${h.scenario} #${h.ordinal} on ${h.item}`).join(', '));
  if (held.namedRestores.length > 0) noted('todo replaces that named a task kept over a different state (PD-TOOLS-008 revision 3, OQ-255)', held.namedRestores.map((h) => `${h.scenario} #${h.ordinal}`).join(', '));
}

/**
 * OQ-258 and PD-ORCH-011 revision 2's live measure, over every preserved session (`lib/intent-reading.mjs`, item N67): each
 * launch's classification as its launch audit recorded it (category, confidence, rung, or the fallback and its reason), how long
 * the run waited on it (from its `session … started` line to its `intent:` line in the launch's own log, since `run_intent`
 * carries no elapsed field), and the count that fell back, with each cut's bytes received from the recorded traffic and, since
 * OQ-332's ruling (2026-10-15), the tail of the reasoning it had streamed, which OQ-258's first reopening limb reads. A NOTE,
 * never a FAIL: a fallback is REQ-ORCH-007 working, and whether the endpoint queued is the endpoint's. Until it existed the count
 * took one `autopsy.mjs` per session.
 */
function checkIntentClassification() {
  if (preservedSessions.length === 0) return;
  let reading;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    try {
      reading = classifierReading(preservedSessions.map(({ scenario, sessionId }) => {
        const appLog = join(output, scenario, 'app.log');
        return {
          scenario, sessionId,
          payload: db.prepare('SELECT payload FROM launch_audits WHERE session_id = ?').get(sessionId)?.payload ?? null,
          log: existsSync(appLog) ? readFileSync(appLog, 'utf8') : '',
          traffic: readTraffic(scenario),
        };
      }));
    } finally { db.close(); }
  } catch (cause) {
    noted('the launch audits\' intents could not be read (OQ-258)', cause instanceof Error ? cause.message : String(cause));
    return;
  }
  const note = classifierNote(reading);
  noted(note.title, note.detail);
}

/**
 * PD-TOOLS-006 revision 8 (OQ-250, R-072) over every preserved session (`lib/routing-misses.mjs`): OQ-216's two counts —
 * `delegate` refused for a `write_scope` given to a persona that cannot write files, and a child's call of a tool it does not hold
 * refused at the gate (target 0). NOTEs: the enforced bounds answered each; the duress run at a68f121 had one of each. Since
 * OQ-257 (revision 9) the write-scope count is read against a bound, each refusal re-routed by the coordinator's next `delegate`,
 * the seconds to it printed. Since OQ-331 (ruled 2026-10-15 under R-072) the bound is counted per task — at most one refusal for
 * each task of the scenario's request routed to a persona that writes no files (`NON_WRITER_FILE_TASKS`), no work refused twice,
 * each re-routed within 60 s — where OQ-257's falsified "at most one a run" stood (the duress run at 2fe0a837 had two, inside the
 * new bound). A scenario over it is named in a NOTE of its own, which reopens OQ-331.
 */
/**
 * OQ-331: the tasks of each scenario's request whose route (REQ-ORCH-028's routing table) names a persona that writes no files.
 * duress's wave 2 asks for docs/decisions.md (the architect's design-decision route) and wave 3 for docs/verification.md (the
 * verifier's route): two. No other scenario's request routes a file to a non-writer, so every other scenario reads 0.
 */
const NON_WRITER_FILE_TASKS = { duress: 2 };
/**
 * OQ-334 (`PD-TOOLS-006` revision 10): the personas whose catalogue entry read "publishes artifacts" in any `delegate` description
 * a scenario's requests were offered — none under the defaults (OQ-212), so every publishing brief counts there.
 */
function publishersOffered(scenario) {
  const names = new Set();
  for (const record of readTraffic(scenario)) {
    const description = requestOf(record)?.tools.find((t) => t.name === 'delegate')?.description;
    if (description) for (const name of publishersOf(description)) names.add(name);
  }
  return [...names];
}
function checkRoutingMisses() {
  if (preservedSessions.length === 0) return;
  let r;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    try {
      r = routingMissReading(preservedSessions.map(({ scenario, sessionId }) => ({ scenario, nonWriterFileTasks: NON_WRITER_FILE_TASKS[scenario] ?? 0, publishers: publishersOffered(scenario), rootNames: db.prepare('SELECT DISTINCT root_persona FROM iterations WHERE session_id = ?').all(sessionId).map((row) => row.root_persona), calls: readToolCalls(sessionId) })));
    } finally { db.close(); }
  } catch (cause) {
    check(false, 'the delegate and child calls of every session the run kept were read for PD-TOOLS-006 revision 8', cause instanceof Error ? cause.message : String(cause));
    return;
  }
  const reroute = (x) => `${x.scenario} #${x.ordinal}: ${x.persona}, ${x.rerouted ? 're-routed' : 'NOT re-routed'} by the next delegate${x.secondsToNext === null ? '' : ` ${x.secondsToNext} s later`}`;
  noted('write scopes given to a persona that cannot write files (PD-TOOLS-006 revision 9, OQ-331; bound: at most one per task routed to a non-writer — 2 in duress, 0 elsewhere — no work refused twice, each re-routed by the next delegate within 60 s), and child calls of a tool they do not hold (OQ-250; target 0)',
    `${r.scopeRefusals.length} write-scope refusal(s)${r.scopeRefusals.length === 0 ? '' : ` (${r.scopeRefusals.map(reroute).join('; ')})`}; ${r.unknownTools.length} unknown-tool call(s) by a child${r.unknownTools.length === 0 ? '' : ` (${r.unknownTools.map((x) => `${x.scenario} #${x.ordinal}: ${x.agent} ${x.tool}`).join(', ')})`}`);
  // OQ-334 (PD-TOOLS-006 revision 10): both counts printed in every run, default and duress; the target of each is 0, and either
  // above it meets OQ-334's reopening condition.
  noted('children\'s calls of an artifact_write they do not hold, and briefs asking a persona whose entry lacks "publishes artifacts" to publish an artifact (PD-TOOLS-006 revision 10, OQ-334; target 0 each)',
    `${r.unknownArtifactWrites.length} unknown artifact_write call(s) by a child${r.unknownArtifactWrites.length === 0 ? '' : ` (${r.unknownArtifactWrites.map((x) => `${x.scenario} #${x.ordinal}: ${x.agent}`).join(', ')})`}; ${r.publishBriefs.length} brief(s) asking a non-publisher to publish${r.publishBriefs.length === 0 ? '' : ` (${r.publishBriefs.map((x) => `${x.scenario} #${x.ordinal}: ${x.persona}`).join(', ')})`}`);
  if (r.flagged.length > 0) noted('write-scope refusals over OQ-331\'s bound (reopens OQ-331)', r.flagged.map((f) => `${f.scenario}${f.ordinal === null ? '' : ` #${f.ordinal}`}: ${f.why}`).join('; '));
}

/**
 * PD-TOOLS-006 revision 9 (OQ-256, R-072) over every preserved session (`lib/hand-off-cuts.mjs`): each answer a child received cut
 * by its inherited-context or prior-agent-context block, read by the block's marker in the child's recorded messages. A NOTE;
 * the target is 0 cuts of an answer of 100,000 characters or fewer. The duress run at 552d346 cut two (finding V1), under the
 * 4,000-character report block that revision 9 replaced.
 */
function checkHandOffCuts() {
  if (preservedSessions.length === 0) return;
  let r;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    try {
      r = handOffCutReading(preservedSessions.map(({ scenario, sessionId }) => ({ scenario, rootIds: [], messages: db.prepare('SELECT task_id, body FROM agent_messages WHERE session_id = ? AND task_id IN (SELECT task_id FROM children WHERE session_id = ?) ORDER BY task_id, seq').all(sessionId, sessionId) })));
    } finally { db.close(); }
  } catch (cause) {
    check(false, 'the children\'s messages of every session the run kept were read for PD-TOOLS-006 revision 9', cause instanceof Error ? cause.message : String(cause));
    return;
  }
  noted('hand-off answers a child received cut (PD-TOOLS-006 revision 9, OQ-256; target 0 for answers of 100,000 characters or fewer)',
    `${r.cuts.length} cut answer(s)${r.cuts.length === 0 ? '' : ` (${r.cuts.map((c) => `${c.scenario} ${c.child}: ${c.answer} ${c.given} of ${c.total}`).join('; ')})`}; ${r.underBudget.length} under the budget`);
}

/**
 * PD-TOOLS-014 (OQ-231, R-072) over every preserved session (`lib/near-miss-edits.mjs`): each `haet_edit`/`haet` refusal
 * that named a match level, whether the same agent probed the file through its terminal before its next edit, or within its
 * next three calls where it never edits again (finding D5 of
 * the final duress run at `a68f121`: every near miss was followed by a `cat -A` or `awk` probe; the directive's target is
 * 0), and whether that next edit succeeded on the same path or was refused "Found N occurrences" (revision 2, OQ-252: a
 * quote whose text recurs is flagged, target 0). Its NOTEs are the directive's first-execution count; a run with no near
 * miss says so.
 */
function checkNearMissEdits() {
  if (preservedSessions.length === 0) return;
  let r;
  try {
    r = nearMissReading(preservedSessions.map(({ scenario, sessionId }) => ({ scenario, calls: readToolCalls(sessionId) })));
  } catch (cause) {
    check(false, 'the haet_edit calls of every session the run kept were read for PD-TOOLS-014', cause instanceof Error ? cause.message : String(cause));
    return;
  }
  const at = (m) => `${m.scenario} #${m.ordinal} (${m.agent}, level ${m.level})`;
  if (r.misses.length === 0) { noted('no haet_edit miss matched at match level 2 or 3', 'PD-TOOLS-014\'s near-miss reply was not asked'); return; }
  noted('haet_edit misses that matched but for whitespace (PD-TOOLS-014)', `${r.misses.length}: ${r.misses.map(at).join(', ')}; followed by a terminal call of the same agent before its next edit (or within its next three calls where it never edits again): ${r.probed.length}${r.probed.length === 0 ? '' : ` (${r.probed.map(at).join(', ')})`}; next edit on the same path succeeded: ${r.retried.length}; next edit on the same path refused "Found N occurrences" (PD-TOOLS-014 revision 2, target 0): ${r.ambiguous.length}${r.ambiguous.length === 0 ? '' : ` (${r.ambiguous.map(at).join(', ')})`}`);
}

/**
 * REQ-SESSION-140 for each session the run drove (`lib/summary-sections.mjs`): its `summary.md` carries the requirement's
 * sections in its order, the stop-reason line only where a stop reason is recorded, every Warnings kind, and a Tool errors
 * line that agrees with the file's own Issues line (REQ-SESSION-136). Until fin23 no live run read the file.
 */
function checkSummary(scenario, sessionId, text, record = check) {
  const Database = require('better-sqlite3');
  const handle = new Database(oneDatabase(), { readonly: true });
  let stopReason = null;
  try { stopReason = handle.prepare('SELECT stop_reason FROM sessions WHERE session_id = ?').get(sessionId)?.stop_reason ?? null; }
  finally { handle.close(); }
  const { ok, problems } = summaryReading(text, { sessionId, stopReason });
  record(ok, `${scenario}: the session's summary.md carries REQ-SESSION-140's sections, in its order, its Tool errors line agreeing with its Issues line`, ok ? `stop reason ${stopReason ?? 'none recorded'}` : problems.join('; '));
}

/**
 * The three records the run-autopsy skill asks for and this harness used to destroy.
 *
 * `.agents/skills/run-autopsy/SKILL.md` names its inputs — a launch log, the session store, a session id — and
 * its Step 1 runs `apps/desktop/scripts/autopsy.mjs` over them. This script produced all three and deleted two
 * with the sandbox, which is why every defect that skill has found came from a session somebody drove by hand
 * rather than from a live run. Each run-bearing scenario now leaves the autopsy's own output, the product's
 * per-session log and the transcript beside the launch log, so a pack can be autopsied days later.
 *
 * Nothing here may fail the run. A pack is evidence about the product; a reader that throws would turn a green
 * run red over its own bookkeeping, so each half reports what it could not write and continues.
 */
function preserveRun(name, sessionId) {
  preservedSessions.push({ scenario: name, sessionId });
  const dir = scenarioDir(name);
  const wrote = [];
  const failed = [];
  const db = oneDatabase();
  try {
    // Step 1 of the skill, run here so the pack carries it rather than requiring the reader to re-derive it.
    const snapshot = spawnSync(process.execPath, [join(app, 'scripts', 'autopsy.mjs'), db, sessionId], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    const text = redact(`${snapshot.stdout ?? ''}\n${snapshot.stderr ?? ''}`);
    assertNoCredential(`${name}/autopsy.txt`, text);
    writeFileSync(join(dir, 'autopsy.txt'), text);
    wrote.push('autopsy.txt');
  } catch (cause) { failed.push(`autopsy.txt (${cause instanceof Error ? cause.message : String(cause)})`); }
  try {
    // The product's OWN per-session log (`run-host/host.ts`'s appender), at whatever level the sandbox was given.
    const sessionLog = join(dirname(db), 'sessions', sessionId, 'session.log');
    if (existsSync(sessionLog)) {
      const text = redact(readFileSync(sessionLog, 'utf8'));
      assertNoCredential(`${name}/session.log`, text);
      writeFileSync(join(dir, 'session.log'), text);
      wrote.push('session.log');
    } else failed.push(`session.log (the run wrote none at ${SESSION_LOG_LEVEL})`);
  } catch (cause) { failed.push(`session.log (${cause instanceof Error ? cause.message : String(cause)})`); }
  {
    // The product's human-readable summary (REQ-SESSION-140), written beside the log and deleted with the sandbox until
    // fin23 copied it (docs/defects/fixed/the-live-runs-pack-carries-no-summary-md.md). Kept, then checked; a step that
    // throws records a failed check since fin25 (`preserveSummary` in `lib/summary-sections.mjs`).
    const summary = join(dirname(db), 'sessions', sessionId, 'summary.md');
    const step = preserveSummary({
      name, sessionId, check,
      read: () => (existsSync(summary) ? redact(readFileSync(summary, 'utf8')) : null),
      keep: (text) => { assertNoCredential(`${name}/summary.md`, text); writeFileSync(join(dir, 'summary.md'), text); },
      judge: (text, record) => checkSummary(name, sessionId, text, record),
    });
    if (step.wrote) wrote.push('summary.md');
    if (step.failed !== null) failed.push(step.failed);
  }
  try {
    // The transcript in full. `results.json` keeps 400 characters of the answer; this keeps what was actually said.
    const Database = require('better-sqlite3');
    const handle = new Database(db, { readonly: true });
    let rows;
    try { rows = handle.prepare('SELECT row_index, kind, settled, tool_name, tool_status, body FROM transcript_rows WHERE session_id = ? ORDER BY row_index').all(sessionId); }
    finally { handle.close(); }
    const text = redact(rows.map((r) => `## ${r.row_index} ${r.kind}${r.tool_name ? ` — ${r.tool_name} [${r.tool_status}${r.settled === 1 ? '' : ', unsettled'}]` : ''}\n\n${r.body ?? ''}\n`).join('\n'));
    assertNoCredential(`${name}/transcript.md`, text);
    writeFileSync(join(dir, 'transcript.md'), `# ${name} — session ${sessionId}, ${rows.length} row(s)\n\n${text}`);
    wrote.push('transcript.md');
  } catch (cause) { failed.push(`transcript.md (${cause instanceof Error ? cause.message : String(cause)})`); }
  scenarioEvidence[name] = { ...(scenarioEvidence[name] ?? {}), sessionId, wrote, ...(failed.length > 0 ? { failed } : {}) };
  if (failed.length > 0) console.error(`warning: ${name} left an incomplete pack — ${failed.join('; ')}`);
}

/**
 * The store itself, copied out before the sandbox goes. It is the record every surface is derived from, and the
 * one thing a reader cannot reconstruct from anything else in the pack.
 *
 * The credential store is a SEPARATE directory and is deleted on every exit path, so this file should never hold
 * the key — but "should" is not a guarantee about a database whose transcript holds whatever the model wrote, so
 * the bytes are searched for the key before the copy is kept and the copy is dropped if it is found. Copying a
 * live SQLite file means taking its sidecars too; without `-wal` the copy reads as the last checkpoint.
 */
function preserveStore() {
  try {
    const db = oneDatabase();
    const bytes = readFileSync(db);
    if (bytes.includes(Buffer.from(key, 'utf8'))) { console.error('warning: the store held the key verbatim, so it was NOT copied into the pack'); return { copied: false, reason: 'the store held the key' }; }
    cpSync(db, join(output, 'workspace.db'));
    for (const sidecar of ['-wal', '-shm']) if (existsSync(`${db}${sidecar}`)) cpSync(`${db}${sidecar}`, join(output, `workspace.db${sidecar}`));
    return { copied: true, from: db };
  } catch (cause) {
    console.error(`warning: the store could not be copied into the pack: ${cause instanceof Error ? cause.message : String(cause)}`);
    return { copied: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

function storeTotals() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    try { return db.prepare('SELECT COALESCE(SUM(tokens_input), 0) AS input, COALESCE(SUM(tokens_output), 0) AS output FROM sessions').get(); } finally { db.close(); }
  } catch { return { input: 0, output: 0 }; }
}

const checks = [];
const check = (passed, what, detail) => { checks.push({ passed: Boolean(passed), what, detail: detail ?? null }); return Boolean(passed); };
const noted = (what, detail) => { checks.push({ passed: true, noted: true, what, detail: detail ?? null }); };
const results = {
  startedAt: new Date().toISOString(), endpoint: { name: endpoint.name, label: endpoint.label, baseUrl: endpoint.baseUrl, model: endpoint.model, contextTokens: endpoint.contextTokens ?? null, unmetered },
  qualifiedModel: QUALIFIED, accounting: accountingKind, budgetUsd: BUDGET, maxTokens: MAX_TOKENS, keySource, sandbox, codeIntelligenceBundle, scenarios: {},
};
/**
 * The run's one ending (`lib/run-ending.mjs`), which `finish`, the fatal handlers and the signal handlers all go through: a
 * launch that overran or threw ends the run here too, with every check computed so far written into `results.json`, the
 * store copied into the pack and the manifest written, and only then the sandbox removed.
 */
runEnding = createRunEnding({
  // Every session's tool-call record, read while the sandbox still holds the store (`checkToolRecord`).
  readings: [checkToolRecord, checkCoordinatorTodo, checkIntentClassification, checkRoutingMisses, checkHandOffCuts, checkNearMissEdits],
  check,
  allPassed: () => checks.every((c) => c.passed),
  collect: () => {
    // The store goes into the pack BEFORE `cleanup` takes the sandbox — on every exit path, including the budget gate's
    // early stop and a launch that failed, because a run that stopped early is exactly the one worth reading.
    results.store = preserveStore();
    results.evidence = scenarioEvidence;
    // Closed BEFORE its figures are read: a call still in flight is written `in-flight at close` into its own
    // scenario's file as the proxy closes, and the count below includes it (live-run finding H-g).
    closeProxy();
    // The RUN's figures (`totals`), never the last launch's (`stats`): the `faults` scenario's closing `setFaults([])`
    // empties the per-launch pair, and reading it here reported no fault fired in a run where three had (finding H4).
    results.traffic = proxy === null ? { recorded: false, reason: RECORD_TRAFFIC ? 'the proxy could not start' : '--no-record-traffic' } : { recorded: true, proxy: proxy.url, ...proxy.totals() };
  },
  write: ({ passed, ended }) => {
    // Every check computed so far, whatever ended the run.
    results.finishedAt = new Date().toISOString();
    results.checks = checks;
    results.passed = passed;
    results.ended = ended;
    results.manifest = MANIFEST_FILE;
    writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  },
  // The pack's own identity and integrity, written LAST so `results.json` itself is covered: the machine and
  // build that produced it and a sha256 for every file (`lib/evidence-manifest.mjs`). A manifest that cannot be
  // written is a warning, never a failed run: the run's checks are about the product.
  manifest: () => {
    try {
      writeEvidenceManifest(output, { kind: 'live-run', label: `${endpoint.name} · ${Object.keys(results.scenarios).join(', ')}` });
    } catch (cause) {
      console.error(`warning: the evidence manifest could not be written (${cause instanceof Error ? cause.message : String(cause)}); the pack holds no hashes`);
    }
  },
  report: ({ passed, ended }) => {
    // A red names the assertion, never the run.
    // A verdict pushed with no detail prints no dash (`lib/verdict-line.mjs`; at ce5f952 it printed "— undefined").
    for (const c of checks) console.log(verdictLine(c));
    const tokens = results.tokens ? `${results.tokens.input} in / ${results.tokens.output} out` : 'none recorded';
    console.log(`\nspend: ${typeof results.spentUsd === 'number' ? `${results.spentUsd.toFixed(4)} USD (${accountingKind === 'provider' ? "the provider's figure" : 'estimated from the registered prices'}) of the ${BUDGET.toFixed(2)} USD ceiling` : accountingKind === 'unmetered' ? `no money figure for this endpoint; ${tokens}, no ceiling (registered unmetered)` : `no money figure for this endpoint; ${tokens} of the ${MAX_TOKENS} token ceiling`}`);
    if (ended.by !== 'completion' && ended.by !== 'stop') console.log(`ended: ${ended.by}${ended.scenario === undefined ? '' : ` in ${ended.scenario}`} — ${ended.message}`);
    console.log(`evidence: ${output}`);
    console.log(`manifest: ${join(output, MANIFEST_FILE)} (pnpm evidence verify re-hashes it)`);
    const packed = Object.entries(scenarioEvidence).filter(([, e]) => Array.isArray(e.wrote) && e.wrote.length > 0);
    if (packed.length > 0) console.log(`autopsy:  ${packed.map(([name, e]) => `${name} (${e.wrote.join(', ')})`).join('; ')}`);
    console.log(`          read one with \`node apps/desktop/scripts/autopsy.mjs "${join(output, 'workspace.db')}" <session-id>\`, or the run-autopsy skill over this directory`);
    if (has('keep')) console.log(`sandbox kept (its credential store deleted): ${sandbox}`);
    console.log(passed ? 'live-run PASSED' : 'live-run FAILED');
  },
  cleanup: () => cleanup(has('keep')),
  exit: (code) => process.exit(code),
});
function finish(code) {
  runEnding(code);
}
/** Between scenarios: whichever figure this endpoint allows, and a stop when it crosses its ceiling. */
async function budgetGate() {
  const totals = storeTotals();
  results.tokens = { input: totals.input, output: totals.output };
  if (accountingKind === 'provider') {
    const now = await providerCredits();
    results.spentUsd = now.usage === null || before.usage === null ? null : Number((now.usage - before.usage).toFixed(6));
  } else if (priced) {
    results.spentUsd = Number(((totals.input / 1e6) * endpoint.inputUsdPerMillion + (totals.output / 1e6) * endpoint.outputUsdPerMillion).toFixed(6));
  }
  if (accountingKind === 'unmetered') return;
  if (typeof results.spentUsd === 'number' && results.spentUsd > BUDGET) {
    check(false, `the spend stayed under the ${BUDGET.toFixed(2)} USD ceiling`, `${results.spentUsd.toFixed(4)} USD spent; the remaining scenarios did not run`);
    finish(1);
  }
  if (accountingKind === 'tokens' && totals.input + totals.output > MAX_TOKENS) {
    check(false, `the run stayed under the ${MAX_TOKENS} token ceiling`, `${totals.input + totals.output} tokens; the remaining scenarios did not run`);
    finish(1);
  }
}

/**
 * The recording proxy, and the URL the PRODUCT is given.
 *
 * `endpoint.baseUrl` stays the real endpoint and is what this script's own reads use — discovery, and the
 * provider's credit check, neither of which is the product talking. `appBaseUrl` is what the sandbox is
 * configured with: the proxy when it is recording, the endpoint itself when it is not. Everything the product
 * is told, and every assertion about what the product did, uses `appBaseUrl`; nothing else may.
 *
 * A proxy that cannot start is not a reason to lose the run. It is reported, `appBaseUrl` falls back to the
 * endpoint, and the pack says traffic was not recorded rather than quietly holding no file.
 */
if (RECORD_TRAFFIC) {
  try { proxy = await startRecordingProxy({ upstreamUrl: endpoint.baseUrl, redact }); }
  catch (cause) { console.error(`warning: the recording proxy could not start (${cause instanceof Error ? cause.message : String(cause)}); the run talks to the endpoint directly.`); }
}
const appBaseUrl = proxy?.url ?? endpoint.baseUrl;

console.log(`live-run: ${endpoint.label} (${endpoint.name}) at ${endpoint.baseUrl}, model ${endpoint.model}`);
console.log(`traffic: ${proxy === null ? (RECORD_TRAFFIC ? 'NOT recorded — the proxy could not start' : 'not recorded (--no-record-traffic)') : `recorded through ${proxy.url} → model-traffic.jsonl per scenario`}`);
console.log(`accounting: ${accountingKind === 'unmetered' ? 'none — unmetered; tokens are counted and reported, nothing stops on them' : accountingKind === 'provider' ? "the provider's own figure" : accountingKind === 'priced' ? 'the registered prices over the store\'s tokens' : `tokens only, ceiling ${MAX_TOKENS}`}`);
console.log(`key: ${keySource}`);
console.log(`sandbox: ${sandbox}`);

// ── 1. Sign in through the product's own dialog ──────────────────────────────────────────────────────────────
const signIn = await launch('sign-in', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_CLICKS: '[data-action="add-endpoint"]@2200',
  ROTARIS_CAPTURE_PROVIDER_FILL: `${endpoint.label}>>${appBaseUrl}>>${key}`,
  ROTARIS_CAPTURE_PROVIDER_EMPTY_OK: '1',
  ROTARIS_CAPTURE_WAIT: `file:${tokensFile}`, ROTARIS_CAPTURE_WAIT_MS: String(SIGN_IN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
}, SIGN_IN_WAIT_MS + 90_000);
// REQ-SHELL-044 (live-run L11): the count's noun agrees with it, and the literal "(s)" is never the product's.
const added = /providers: (Added .+?; discovered (\d+) models?\.)/.exec(signIn);
const literal = /providers: Added .+?; discovered \d+ model\(s\)\./.exec(signIn);
check(literal === null, 'the sign-in notice words its model count without a literal "(s)" (REQ-SHELL-044)', literal?.[0] ?? added?.[1] ?? 'no outcome logged');
check(existsSync(tokensFile), 'the credential file was written', tokensFile);
if (!check(added !== null, 'the endpoint was added and its catalogue discovered', added?.[1] ?? (/provider dialog "Continue anyway" pressed/.test(signIn) ? 'the endpoint discovered no models and the zero-model recovery was taken' : 'the outcome was not logged'))) finish(1);
const snapshot = existsSync(snapshotFile) ? readFileSync(snapshotFile, 'utf8') : '';
check(snapshot.includes(`  ${PROVIDER_ID}:`) && snapshot.includes('    authenticated: true'), 'the snapshot carries the authenticated provider', PROVIDER_ID);
check(!/access_token|sk-[a-z-]*[a-z0-9]{16,}/.test(snapshot), 'the snapshot carries no credential');
// REQ-CONFIG-025 / REQ-WORKSPACE-038: the starter's CONTENT, not the file's existence. Initialization records into a missing
// workspace file before the sign-in, so a file holding `initialization:` alone exists and is no starter (acceptance F3;
// `docs/defects/fixed/live-runs-sign-in-check-passes-on-any-agents-yaml-even-one-holding-only-the-initialization-record.md`).
const starterLacks = existsSync(agentsFile) ? starterMissing(readFileSync(agentsFile, 'utf8')) : ['the file'];
check(starterLacks.length === 0, 'the starter agents.yaml was bootstrapped', starterLacks.length === 0 ? agentsFile : `it lacks ${starterLacks.join(', ')}`);
const inCatalogue = snapshot.includes(`      - id: ${QUALIFIED}\n`);
if (inCatalogue) check(true, `the catalogue carries ${endpoint.model}`);
else noted(`the catalogue does not carry ${endpoint.model}`, 'the script writes the models: entry the run needs (REQ-CONFIG-082..097)');
results.scenarios['sign-in'] = { discovered: added === null ? 0 : Number(added[2]), modelInCatalogue: inCatalogue };

// The slots, the model entry when discovery did not supply one, and the two bounds this run answers for: an
// unattended run per scenario (REQ-TOOLS-071's consent given in the file, as a person gives it in Settings →
// Runtime), and a ceiling on iterations so a confused agent cannot spend the budget in one turn.
let agents = readFileSync(agentsFile, 'utf8');
for (const slot of ['large_model', 'medium_model', 'small_model']) agents = agents.replace(new RegExp(`^${slot}: .*$`, 'm'), `${slot}: ${QUALIFIED}`);
// A `models:` entry here REPLACES the snapshot layer's entry for the same key as a whole, so it carries everything
// the run needs, never a lone field: written when discovery supplied no entry at all, and when the owner registered
// a context window the endpoint does not declare (`/models` payloads rarely carry one discovery can read).
if (!inCatalogue || typeof endpoint.contextTokens === 'number') {
  // REQ-CONFIG-088 (amended): the product reads a price as the decimal its TEXT states, so the per-million figure is
  // written with an `e-6` exponent rather than divided here in binary floating point (0.1 / 1e6 prints 1.0000000000000001e-7).
  const prices = priced ? `    input_cost_per_token: ${endpoint.inputUsdPerMillion}e-6\n    output_cost_per_token: ${endpoint.outputUsdPerMillion}e-6\n` : '';
  const context = typeof endpoint.contextTokens === 'number' ? `    max_input_tokens: ${endpoint.contextTokens}\n` : '';
  agents += `models:\n  ${JSON.stringify(QUALIFIED)}:\n    provider: openai-compatible\n    model_id: ${JSON.stringify(endpoint.model)}\n    auth_provider: ${PROVIDER_ID}\n    base_url: ${appBaseUrl}\n${context}${prices}`;
}
// `session_log_level` is the one level knob the product actually honours (REQ-SESSION-142; the APPLICATION log
// filters on nothing, which is OQ-63's open question). It governs `<store>/sessions/<id>/session.log`, which
// `preserveRun` copies into the pack.
// No longer true since 2026-09-27: OQ-63 was ruled as PD-MONITOR-002 and built. The application log records `info`
// and above, and its one switch is the environment variable ROTARIS_APP_LOG_LEVEL, never a configuration key —
// `session_log_level` is still the only level knob in `agents.yaml`, and it still reaches the session log alone.
if (!agents.includes('permission_mode:')) agents += `runtime:\n  permission_mode: autonomous\n  allow_unsandboxed_autonomous: true\n  max_iterations: ${MAX_ITERATIONS}\n  session_log_level: ${SESSION_LOG_LEVEL}\n`;
writeFileSync(agentsFile, agents);
cpSync(agentsFile, join(output, 'agents.yaml'));
check(['large_model', 'medium_model', 'small_model'].every((slot) => agents.includes(`${slot}: ${QUALIFIED}`)), 'the three tier slots name the live model', QUALIFIED);

// ── 2. One real run that reads and answers ───────────────────────────────────────────────────────────────────
if (wanted.includes('ask')) {
  /*
   * The 2026-10-13 survey's N58 (fin42): this run's post-run analysis is let finish. Every scenario quit 2.5 to 6 s after its
   * result, which cancels the analysis by design (REQ-LIBRARY-127), so no analysis had finished against a real model, and real
   * analyst calls took 22 to 134 s against the 60 s default (live-run-1 F4). So the Improvement analysis timeout is raised to
   * `LIVE_RUN_ANALYST_TIMEOUT_S` (default 300, the control's 10–600) through Settings › Runtime and its Save, as a person
   * raises it; the capture waits until the title-bar indicator has named the post-run pass and gone (`settledWait`), bounded
   * by the run's wait plus that limit; and the workspace file is restored afterwards (`lib/analysis-reading.mjs`).
   */
  const agentsBeforeAsk = readFileSync(agentsFile, 'utf8');
  // The analyst timeout this scenario saves is put back whatever happens, as `cutoff` puts its limit back: a launch that
  // throws must not leave improvement_collector_timeout at its raised value for the scenarios after it.
  try {
    const setAnalyst = await launch('ask-settings', runtimeFieldSteps({ id: 'improvement-timeout', value: ANALYST_TIMEOUT_S }), 90_000);
    const analystSaved = fieldSaveReading(setAnalyst, { id: 'improvement-timeout' });
    check(analystSaved.afterEdit === 'Unsaved changes' && analystSaved.atEnd === 'All changes saved' && new RegExp(`^\\s+improvement_collector_timeout: ${ANALYST_TIMEOUT_S}\\s*$`, 'm').test(readFileSync(agentsFile, 'utf8')),
      `Settings › Runtime › Improvement analysis timeout took ${ANALYST_TIMEOUT_S} s and Save stored it (PD-CONFIG-003 revision 2)`, `${JSON.stringify(analystSaved)}; ${/^\s+improvement_collector_timeout:.*$/m.exec(readFileSync(agentsFile, 'utf8'))?.[0]?.trim() ?? 'no improvement_collector_timeout line'}`);
    const ASK_WAIT_MS = RUN_WAIT_MS + ANALYST_TIMEOUT_S * 1000 + 60_000;
    const log = await launch('ask', {
      ROTARIS_CAPTURE_PROMPT: 'Read src/todos.js in this workspace and reply, in one sentence, with the names of the functions it exports.',
      ROTARIS_CAPTURE_WAIT: settledWait('post_run'), ROTARIS_CAPTURE_WAIT_MS: String(ASK_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
      // Acceptance A36: the inspector's ring caption, which `ask.png` showed denying the reading it stated one line above.
      ROTARIS_CAPTURE_PROBE: ['.inspector__ring-caption', ...DURATION_PROBES, '[data-testid="notice"]'].join(';;'),
    }, ASK_WAIT_MS + 90_000);
    const requests = [...new Set((log.match(/model request POST (\S+)/g) ?? []).map((line) => line.replace('model request POST ', '')))];
    // The lease's report is the run host's (REQ-PROVIDER-068, `LeaseReportLog`); main no longer restates it (a71-9).
    check(log.includes(`credentials: leased for ${PROVIDER_ID}`), 'main leased the bearer to the run host');
    // `appBaseUrl`, not the endpoint: the assertion is about what the PRODUCT did, and when the proxy is recording
    // the product was given the proxy. The traffic file below is what says the call reached the endpoint itself.
    check(requests.some((url) => url.startsWith(`${appBaseUrl}/chat/completions`)), 'a request reached the endpoint', requests.join(', '));
    check(/\brun \S+ ended /.test(log), 'the run reached its result inside the wait', /\brun \S+ ended [^\n]*/.exec(log)?.[0] ?? 'no run-end line');
    const read = readSession();
    checkPricing('ask', read?.session);
    const answer = (read?.rows ?? []).filter((row) => row.kind === 'agent').map((row) => row.body).join(' ');
    const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
    const usage = (read?.events ?? []).filter((event) => event.kind === 'usage.update').map((event) => JSON.parse(event.payload));
    check(read?.session.execution_status === 'completed', 'the session completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
    check(tools.length > 0 && tools.every((row) => row.settled === 1), 'every tool call settled', tools.map((row) => `${row.tool_name}:${row.tool_status}`).join(', '));
    check(/addTodo/.test(answer) && /toggleTodo/.test(answer), 'the answer names the functions the file exports', answer.trim().slice(0, 200));
    check(usage.length > 0, 'usage figures were recorded', JSON.stringify(usage[usage.length - 1] ?? null));
    // Acceptance A36 (REQ-MONITOR-089/065): the run-level agent's caption states its own context window and never denies it.
    const caption = JSON.parse(/capture: probe \.inspector__ring-caption → (\[.*\])\s*$/m.exec(log)?.[1] ?? '[]')[0]?.text ?? '';
    check(/This agent's own context window: [\d,.\s]+ of [\d,.\s]+ tokens\./.test(caption) && !/does not carry/.test(caption), 'the inspector\'s ring caption states the reading and does not deny it', caption);
    checkRunDuration('ask', log);
    /*
     * The recording is itself asserted, not assumed. A proxy that forwarded but recorded nothing would leave the
     * run green and the pack empty — the exact shape of gap this whole change exists to close — so the first
     * scenario that talks to the model reads its own traffic file back and requires a completion that the
     * ENDPOINT answered. It also proves the hop the check above can no longer see: the product reached the proxy,
     * and this says the proxy reached the endpoint and got a 200.
     */
    let askTraffic = null;
    if (proxy !== null) {
      const traffic = readTraffic('ask');
      const completions = traffic.filter((r) => String(r.path ?? '').includes('/chat/completions'));
      check(completions.some((r) => r.status === 200), 'the endpoint answered a completion, read from the recorded traffic', `${traffic.length} record(s), ${completions.length} completion(s), statuses ${[...new Set(completions.map((r) => r.status))].join(', ') || 'none'}`);
      check(completions.every((r) => r.requestHeaders?.authorization === '[redacted]'), 'the traffic record carries no bearer', `${completions.length} completion record(s)`);
      askTraffic = { records: traffic.length, completions: completions.length, slowestMs: Math.max(0, ...traffic.map((r) => r.ms ?? 0)) };
    }
    // The summary joins the scenario's record rather than being written onto it before it exists.
    // N58: the post-run analysis finished — one artifact for this session, with proposals or the timed-out notes, and the
    // notice that outcome owes (REQ-LIBRARY-124, REQ-NOTIFY-100's detail for a timeout).
    const analysisMs = settledAfterMs(log);
    const askNotices = JSON.parse(/capture: probe \[data-testid="notice"\] → (\[.*\])\s*$/m.exec(log)?.[1] ?? '[]');
    const askArtifacts = read === null ? [] : improvementArtifacts().filter((a) => a.source_session_id === read.session.session_id);
    const analysis = passOutcome(askArtifacts[0]?.artifact ?? null, askNotices);
    check(analysisMs !== null, 'the post-run analysis was seen running and ended before the capture quit (REQ-LIBRARY-125/127)', analysisMs === null ? `the wait for it ran out at ${ASK_WAIT_MS} ms` : `${analysisMs} ms from the prompt's submission`);
    // F2's other half (the live run at ce5f952): every model request of the launch, the run's and its analysis's, carried a credential.
    check(unauthorizedRequests(log) === 0, 'ask: every model request carried a credential (ADR-0030)', `${unauthorizedRequests(log)} request(s) logged with no authorization header`);
    // An analyst that proposed nothing for another reason is the model's judgement over a one-file run, REQ-LIBRARY-124's own
    // "no proposals" outcome: a NOTE, its notice still checked below (`postRunVerdict`).
    const analysisVerdict = postRunVerdict(askArtifacts.length, analysis);
    const analysisDetail = `${askArtifacts.length} artifact(s); ${analysis.outcome}, ${analysis.proposals} proposal(s), notes ${JSON.stringify(analysis.notes)}`;
    if (analysisVerdict === 'note') noted(analysis.outcome === 'parse-failed' ? 'the post-run analysis stored one artifact for the run; the model\'s answer could not be read twice (REQ-LIBRARY-022, PD-LIBRARY-005)' : 'the post-run analysis stored one artifact for the run and proposed nothing (REQ-LIBRARY-124)', analysisDetail);
    else check(analysisVerdict === 'pass', 'the post-run analysis stored one artifact for the run, with proposals or the timed-out notes (REQ-LIBRARY-023/123)', analysisDetail);
    if (analysis.outcome === 'timed-out') noted('the post-run analysis reached its limit before it proposed anything', `${analysis.limitS} s (LIVE_RUN_ANALYST_TIMEOUT_S ${ANALYST_TIMEOUT_S}); live-run-1 F4 measured 22 to 134 s per call`);
    if (askArtifacts.length === 1) check(analysis.noticeMatches === true, 'the notice on screen is the one the analysis outcome owes (REQ-LIBRARY-124, REQ-NOTIFY-100, PD-LIBRARY-005)', askNotices.map((n) => n.text.slice(0, 160)).join(' | ') || 'no notice on screen');
    // The summary joins the scenario's record rather than being written onto it before it exists.
    results.scenarios.ask = { ...(askTraffic === null ? {} : { traffic: askTraffic }), status: read?.session.execution_status, iterations: read?.session.iterations_completed, tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output }, tools: tools.map((row) => row.tool_name), answer: answer.trim().slice(0, 400), analysis: { ...analysis, settledAfterMs: analysisMs, analystTimeoutS: ANALYST_TIMEOUT_S, control: analystSaved } };
    if (read) preserveRun('ask', read.session.session_id);

    /*
     * N58's second half: PD-LIBRARY-002's retrospective pressed in the Library as a person presses it — Ctrl+6, the Proposals
     * tab, the gesture — and let finish (the indicator naming the retrospective, then gone, inside `retrospective_timeout`'s
     * 120 s default, which no control exposes). Its artifact must be the retrospective's, read over the sessions this workspace
     * holds, and the run host must have handed it the workspace root's instruction files and no other base's (revision 2,
     * OQ-235). A real model whose proposals repeat the post-run pass's has them suppressed (REQ-LIBRARY-046): an empty
     * artifact saying so is an outcome, not a failure.
     */
    if (read !== null) {
      const RETRO_WAIT_MS = 120_000 + 60_000;
      const retroLog = await launch('ask-retrospective', {
        ROTARIS_CAPTURE_VIEW: '6',
        ROTARIS_CAPTURE_CLICKS: '[data-testid="library-tab"][data-tab="proposals"]@~10000;;[data-testid="library-retrospective"]:not([aria-disabled="true"])@~20000',
        ROTARIS_CAPTURE_WAIT: settledWait('retrospective'), ROTARIS_CAPTURE_WAIT_MS: String(RETRO_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
        ROTARIS_CAPTURE_PROBE: '[data-testid="notice"]',
      }, RETRO_WAIT_MS + 90_000);
      const retroArtifacts = improvementArtifacts().filter((a) => a.source_kind === 'retrospective');
      const retroNotices = JSON.parse(/capture: probe \[data-testid="notice"\] → (\[.*\])\s*$/m.exec(retroLog)?.[1] ?? '[]');
      const retro = passOutcome(retroArtifacts[0]?.artifact ?? null, retroNotices, { retrospective: true });
      const files = retrospectiveInstructionFiles(retroLog);
      check(settledAfterMs(retroLog) !== null, 'the retrospective pressed in the Library ran and ended before the capture quit (PD-LIBRARY-002)', settledAfterMs(retroLog) === null ? `the wait for it ran out at ${RETRO_WAIT_MS} ms (see ask-retrospective/app.log)` : `${settledAfterMs(retroLog)} ms`);
      /*
       * The live run at ce5f952 (F2, F4): the retrospective's request went out with no credential and its collector crashed on the
       * 401, and both checks below PASSed over "collector crashed: Unauthorized". The launch must start no run before the gesture
       * (the shape that exposed F2: no run has leased the bearer for it), every model request it makes must carry a credential,
       * and a crashed collector fails the artifact check (`retrospectiveArtifactVerdict`). The notice check reads the notice the
       * outcome owes: for a crashed collector PD-LIBRARY-005's warning (OQ-285), which a repaired product shows, so that check
       * passes while the artifact check still fails.
       */
      check(runsStarted(retroLog) === 0, 'ask-retrospective: the launch started no run before the retrospective, so it leases its own credential (F2)', `${runsStarted(retroLog)} run(s) started in the launch`);
      check(unauthorizedRequests(retroLog) === 0, 'ask-retrospective: every model request carried a credential (ADR-0030, PD-LIBRARY-002)', `${unauthorizedRequests(retroLog)} request(s) logged with no authorization header (see ask-retrospective/app.log)`);
      const retroArtifact = retrospectiveArtifactVerdict(retroArtifacts, read.session.session_id, retro);
      check(retroArtifact.passed, 'one retrospective artifact, belonging to no session, having read the ask session, its collector not crashed (PD-LIBRARY-002 revision 2 (a), REQ-LIBRARY-023)', retroArtifact.detail);
      check(files !== null && files.rootOnly, 'the retrospective was handed the workspace root\'s instruction files and no other base\'s (PD-LIBRARY-002 revision 2, OQ-235)', files === null ? 'no "at the workspace root" line in ask-retrospective/app.log' : `${files.handed} of ${files.enabled}: ${files.ids.join(', ') || 'none'}`);
      // PD-LIBRARY-005 (OQ-285): a crashed or unparseable collector owes "The retrospective could not be completed" naming its
      // artifact, a timed-out one the limit detail, any other outcome PD-LIBRARY-002 revision 2 (c)'s notice (`passOutcome`).
      if (retroArtifacts.length === 1) check(retro.noticeMatches === true, 'the notice on screen is the one the retrospective\'s outcome owes (PD-LIBRARY-002 revision 2 (c), PD-LIBRARY-005)', retroNotices.map((n) => n.text.slice(0, 260)).join(' | ') || 'no notice on screen');
      if (retro.outcome === 'parse-failed') noted('the retrospective\'s model answered twice in a shape the parser could not read (REQ-LIBRARY-022); its warning is checked above', `notes ${JSON.stringify(retro.notes)}`);
      results.scenarios['ask-retrospective'] = { ...retro, settledAfterMs: settledAfterMs(retroLog), instructionFiles: files };

      /*
       * PD-LIBRARY-002 revision 5 (OQ-300, ruled under R-072): the same gesture with the entry provider's credential withheld —
       * the credential file moved aside for one launch, so main's lease answers no bearer for it. The press owes ONE error
       * notice, "Provider authentication required", with "Authenticate at least one configured provider before running a
       * retrospective." as its body and the "Open Models settings" action, and stores no artifact; the model is never asked.
       * The file is put back whatever the launch does. Costs nothing: no request reaches the endpoint.
       */
      const withheld = `${tokensFile}.withheld`;
      const retroBefore = improvementArtifacts().filter((a) => a.source_kind === 'retrospective').length;
      renameSync(tokensFile, withheld);
      let refusedLog = '';
      try {
        refusedLog = await launch('ask-retrospective-unauth', {
          ROTARIS_CAPTURE_VIEW: '6',
          // L6 (fin46): the press is held behind the open's provider banner, so the refusal is the notice left standing.
          ROTARIS_CAPTURE_CLICKS: refusalClicks(),
          ROTARIS_CAPTURE_WAIT: refusalWait(), ROTARIS_CAPTURE_WAIT_MS: '60000', ROTARIS_CAPTURE_AFTER_MS: '2500',
          ROTARIS_CAPTURE_PROBE: '[data-testid="notice"]',
        }, 150_000);
      } finally {
        renameSync(withheld, tokensFile);
      }
      const pressOrder = refusalPressOrder(refusedLog);
      check(pressOrder.after, 'ask-retrospective-unauth: the gesture was pressed after the provider banner, so the refusal is the newest notice in the slot (REQ-NOTIFY-024)', `${pressOrder.detail} (see ask-retrospective-unauth/app.log)`);
      const refusedNotices = JSON.parse(/capture: probe \[data-testid="notice"\] → (\[.*\])\s*$/m.exec(refusedLog)?.[1] ?? '[]');
      const refusal = retrospectiveRefusalVerdict(refusedNotices, retroBefore, improvementArtifacts().filter((a) => a.source_kind === 'retrospective').length);
      check(refusal.passed, 'a retrospective pressed with the entry provider\'s credential withheld posts one "Provider authentication required" notice naming the retrospective, with "Open Models settings", and stores nothing (PD-LIBRARY-002 revision 5, OQ-300)', `${refusal.detail}: ${refusedNotices.map((n) => n.text.slice(0, 260)).join(' | ') || 'no notice on screen'}`);
      const refusedCompletions = proxy === null ? null : readTraffic('ask-retrospective-unauth').filter((r) => String(r.path ?? '').includes('/chat/completions')).length;
      check(!/run host: model request /.test(refusedLog) && (refusedCompletions ?? 0) === 0, 'ask-retrospective-unauth: no model request was sent', refusedCompletions === null ? 'from ask-retrospective-unauth/app.log (no recording proxy)' : `${refusedCompletions} completion(s) in the recorded traffic`);
      results.scenarios['ask-retrospective-unauth'] = refusal;
    }
  } finally {
    writeFileSync(agentsFile, agentsBeforeAsk);
  }
  await budgetGate();
}

// ── 3. One real run that changes the workspace and verifies it ───────────────────────────────────────────────
if (wanted.includes('edit')) {
  const log = await launch('edit', {
    // One run, several mechanisms at once: the implementation and its tests are written by two children working in
    // PARALLEL, each under a declared write scope (PD-TOOLS-006), and priced at configured rates (PD-MONITOR-001).
    // OQ-213 (REQ-ORCH-029): the coordinator's second delegation is refused until it has written a todo list of its own,
    // so the prompt asks for the list first, which keeps the two delegations in one turn; a coordinator that skips it
    // meets one refusal, writes the list and delegates again, and the checks below read only the delegations that ran.
    // PD-TOOLS-008 revision 3 (OQ-255, item N65): the prompt asks the coordinator to close its plan with ONE `replace` once both
    // children have reported, the case revision 3 decides; until fin41 every coordinator closed with `update`, and the run-wide
    // check passed having asked nothing. `heldItemReading`'s `closes` says whether it was asked.
    ROTARIS_CAPTURE_PROMPT: 'Implement REQ-103 from docs/requirements: add a clearCompleted(todos) function to src/todos.js and export it, and add tests for it to src/todos.test.js. First write your todo list with the todo tool, one task for the implementation and one for the tests. Then do the two in parallel: in ONE turn, delegate two coding-agent children in the background, one for the implementation with write_scope ["src/todos.js"] and one for the tests with write_scope ["src/todos.test.js"], then wait for both with wait_for_tasks. You hold no terminal, so tell each child to run `node --test` in the terminal before it reports, and tell me whether the suite passed. Delegate nothing else. When both have reported, close your plan with ONE todo replace that sends both tasks COMPLETED, then answer at once.',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(EDIT_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000', ROTARIS_CAPTURE_PROBE: DURATION_PROBES.join(';;'),
  }, EDIT_WAIT_MS + 90_000);
  check(!/capture: wait for result timed out/.test(log), 'the run reached its result inside the wait');
  const read = readSession();
  checkPricing('edit', read?.session);
  checkRunDuration('edit', log);
  const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
  const names = [...new Set(tools.map((row) => row.tool_name))];
  const source = readFileSync(join(workspace, 'src', 'todos.js'), 'utf8');
  const suite = readFileSync(join(workspace, 'src', 'todos.test.js'), 'utf8');
  check(read?.session.execution_status === 'completed', 'the session completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
  check(tools.length > 0 && tools.every((row) => row.settled === 1), 'every tool call settled', names.join(', '));
  /*
   * Who ran the suite, read from the store. The orchestrator is `coordinator_only` (REQ-ORCH-029), and that control
   * removes `terminal` from its tool set (REQ-TOOLS-006), so the prompt asks the CHILDREN to run it. This check once
   * read "the agent ran the suite through the terminal tool" over a prompt asking the orchestrator to run it
   * "yourself", and passed on the children's calls while the thing it named never happened (live-run finding H3).
   */
  const calls = read ? readToolCalls(read.session.session_id) : [];
  const suiteCalls = calls.filter((c) => c.tool_name === 'terminal' && /\bnode\s+--test\b/.test(String(c.args.command ?? '')));
  const ROOT = 'orchestrator';
  check(suiteCalls.some((c) => c.agent_name !== ROOT), 'a child ran `node --test` through the terminal tool', suiteCalls.length === 0 ? `no terminal call ran node --test; tools used: ${names.join(', ')}` : [...new Set(suiteCalls.map((c) => c.agent_name))].join(', '));
  // At least one call by ROOT is required too: a renamed entry agent would otherwise pass this vacuously.
  const rootCalls = calls.filter((c) => c.agent_name === ROOT);
  check(rootCalls.length > 0 && !rootCalls.some((c) => c.tool_name === 'terminal'), 'the orchestrator made no terminal call (REQ-TOOLS-006 coordinator_only)', `${rootCalls.length} orchestrator call(s)`);
  // REQ-MONITOR-102: the session's own counter is SESSION-wide, so it must agree with the ring the gate wrote
  // across every agent that dispatched. The first live run found it holding the entry agent's calls alone, which
  // left the Overview card short and the synthetic run row reading zero on any run that delegated.
  const byAgent = read?.byAgent ?? [];
  const dispatched = byAgent.reduce((n, row) => n + row.calls, 0);
  const named = byAgent.map((row) => `${row.agent_name}:${row.calls}`).join(', ');
  check(dispatched >= 5000 || read?.session.tool_calls === dispatched, 'the session-wide tool-call total counts every agent', `${read?.session.tool_calls} counted vs ${dispatched} row(s) across ${byAgent.length} agent(s) — ${named}`);
  check(/export (function|const) clearCompleted/.test(source), 'clearCompleted is exported from src/todos.js');
  check(/clearCompleted/.test(suite), 'src/todos.test.js tests it');
  // The independent reading: this script runs the suite itself, whatever the agent reported.
  const suiteRun = spawnSync(process.execPath, ['--test'], { cwd: workspace, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(join(scenarioDir('edit'), 'node-test.log'), `${suiteRun.stdout ?? ''}\n${suiteRun.stderr ?? ''}`);
  check(suiteRun.status === 0, 'node --test is green in the workspace afterwards', `exit ${suiteRun.status ?? suiteRun.signal}`);
  const diff = git('diff', head, '--stat');
  writeFileSync(join(scenarioDir('edit'), 'diff.txt'), `${git('diff', head)}\n`);
  check(diff !== '', 'git sees the change', diff.split('\n').pop() ?? '');
  /*
   * PD-TOOLS-006 in the same run, asserted from the store and the recorded traffic, never from the model's prose:
   * the two scoped children were delegated, were live at the same time, and were each told the live scopes at start.
   * A write the gate refused for a scope is RECORDED rather than required — whether a model tries to cross a claim is
   * its choice — but every such refusal must name its holder, in the directive's words.
   */
  const scoped = calls.filter((c) => c.tool_name === 'delegate' && Array.isArray(c.args.write_scope) && c.args.write_scope.length > 0);
  const scopedIds = scoped.map((c) => /task_id: (bg_[0-9a-f]{8})/.exec(c.result)?.[1]).filter((id) => id !== undefined);
  check(scopedIds.length >= 2, 'two children were delegated with a write scope each (PD-TOOLS-006)', scoped.map((c) => `${c.args.task_name}: ${JSON.stringify(c.args.write_scope)}`).join('; ') || 'no delegate carried a write_scope');
  // Live at once: each reached `running` before the other reached a terminal state, read off the ordered events.
  const moves = (read?.events ?? []).filter((e) => e.kind === 'child.transition').map((e, i) => ({ i, ...JSON.parse(e.payload) }));
  const firstAt = (id, pick) => moves.find((m) => m.child_id === id && pick(m.to_state))?.i ?? Infinity;
  const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'blocked']);
  const overlapped = scopedIds.some((a) => scopedIds.some((b) => a !== b
    && firstAt(a, (s) => s === 'running') < firstAt(b, (s) => TERMINAL.has(s))
    && firstAt(b, (s) => s === 'running') < firstAt(a, (s) => TERMINAL.has(s))));
  check(overlapped, 'two scoped children were live at the same time', `${moves.length} transition(s) across ${scopedIds.length} scoped child(ren)`);
  // The disclosure block each child's payload carries after the workspace-root line.
  const told = readTraffic('edit').filter((r) => String(r.requestBody ?? '').includes('Write scopes:'));
  check(told.length > 0, 'the scoped children were told the write scopes at start', `${told.length} request(s) carried the block`);
  check(told.some((r) => String(r.requestBody).includes('Held by other agents')), "a child accepted beside a live scope was told whose it is", told.length === 0 ? 'none' : 'the block names the other child');
  // Only the file-write tools can be refused for a scope; a report QUOTING a refusal (wait_for_tasks) is not one.
  const refusals = calls.filter((c) => ['write_file', 'haet_edit', 'haet'].includes(c.tool_name) && /is inside the write scope of /.test(c.result));
  check(refusals.every((c) => c.status === 'blocked' && /which is still running: '.+'\. The write was not executed\./.test(c.result)), 'every write-scope refusal was blocked and named its holder', `${refusals.length} refusal(s)`);
  noted('writes the gate refused for a live scope', refusals.length === 0 ? 'none — no agent tried to write into another agent\'s scope' : refusals.map((c) => `${c.agent_name} → ${c.tool_name}`).join(', '));
  mkdirSync(join(scenarioDir('edit'), 'changed'), { recursive: true });
  cpSync(join(workspace, 'src'), join(scenarioDir('edit'), 'changed'), { recursive: true });
  results.scenarios.edit = { writeScopes: { scopedChildren: scopedIds.length, overlapped, told: told.length, refusals: refusals.length }, cost: { total: read?.session.cost ?? null, qualifier: read?.session.cost_qualifier ?? null }, status: read?.session.execution_status, iterations: read?.session.iterations_completed, tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output }, tools: names, toolCallTotal: read?.session.tool_calls ?? null, toolCallsByAgent: byAgent, diffstat: diff, suiteExit: suiteRun.status };
  if (read) preserveRun('edit', read.session.session_id);
  await budgetGate();
}

// ── 3b. A paused run resumes every agent from its own record ────────────────────────────────────────────────
/*
 * PD-ORCH-005, measured against a real model. A delegating run is paused through the composer's own Pause as soon as
 * two children are running (bounded, `lib/resume-pause.mjs`), and continued through the composer's own Continue as soon as the paused composer has been
 * read. What is asserted comes from the store and the recorded traffic, never from the model's prose:
 * - the pause left the iteration open and its unfinished children `paused` by `pause` (clauses 2 and 3), and the
 *   composer drew them `paused` with the Continue action's count (clauses 6, 13 and 19);
 * - the continue resumed that same iteration and every child it paused, under the same task ids (clause 4);
 * - each resumed child carried on from its own record: entries before the pause and after it under one task id, and
 *   the first request after the continue carried what that child had recorded last (clauses 1 and 4);
 * - the run finished the work, read back from the files on disk.
 */
if (wanted.includes('resume')) {
  // Live-run finding P7 at a68f121: the Pause waits (bounded) for two running children (`lib/resume-pause.mjs`).
  // Read the paused composer once, and mark the read on <body> so the Continue press waits for it.
  const READ_PAUSED = "(document.body.dataset.pausedRead = '1', JSON.stringify({ paused: document.querySelectorAll('.agent-row[data-state=\"paused\"]').length, count: document.getElementById('composer-resume-count')?.textContent ?? null, run: document.querySelector('[data-testid=\"run-header\"]')?.dataset.state ?? null }))";
  const CONTINUE = 'body[data-paused-read="1"] button[aria-label="Continue run"]';
  const log = await launch('resume', {
    ROTARIS_CAPTURE_PROMPT: 'Write two short notes in parallel. First write your todo list with the todo tool, one task per note. Then, in ONE turn, delegate two coding-agent children in the background: one reads src/todos.js and then writes docs/notes-functions.md listing each exported function with one sentence on what it does; the other reads src/todos.test.js and then writes docs/notes-tests.md listing each test with one sentence on what it checks. Wait for both with wait_for_tasks, then reply with the two file names. Delegate nothing else.',
    ROTARIS_CAPTURE_CLICKS: [`${PAUSE}@~${EDIT_WAIT_MS}`, `${CONTINUE}@~${EDIT_WAIT_MS}`].join(';;'),
    ROTARIS_CAPTURE_EVAL_AT: [...pauseEvalSteps(EDIT_WAIT_MS), `${READ_PAUSED}>>button[aria-label="Continue run"]@~${EDIT_WAIT_MS}`].join(';;'),
    ROTARIS_CAPTURE_WAIT: `js:document.querySelector('[data-testid="run-header"]')?.dataset.state === 'completed'`,
    ROTARIS_CAPTURE_WAIT_MS: String(EDIT_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
  }, EDIT_WAIT_MS + 90_000);
  check(/capture: clicked ".*Pause the run/.test(log), 'the composer\'s Pause was pressed while a child was running');
  check(/capture: clicked ".*Continue run/.test(log), 'the paused composer\'s Continue was pressed');
  check(!/capture: wait for js timed out|capture: wait for .* timed out/.test(log), 'the resumed run completed inside the wait');
  const shown = (() => { try { return JSON.parse(JSON.parse(/capture: eval-at \S+ .* → (".*")$/m.exec(log)?.[1] ?? 'null')); } catch { return null; } })();
  check(shown !== null && shown.paused > 0, 'the paused composer drew its paused children as `paused` (clause 13)', JSON.stringify(shown));
  check(shown !== null && /agents? will resume/.test(shown.count ?? ''), 'the paused composer stated the Continue action\'s count (clauses 6 and 19)', shown?.count ?? 'no count');
  const read = readSession();
  checkPricing('resume', read?.session);
  check(read?.session.execution_status === 'completed', 'the session completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  let rest = null;
  try {
    const sid = read?.session.session_id ?? '';
    const timeline = db.prepare("SELECT ordinal, at, name, metadata FROM timeline WHERE session_id = ? AND name IN ('iteration_paused', 'iteration_resumed', 'child_paused', 'child_resumed') ORDER BY ordinal").all(sid)
      .map((t) => ({ ...t, meta: JSON.parse(t.metadata) }));
    const iterationPaused = timeline.find((t) => t.name === 'iteration_paused' && t.meta.interruption === 'pause');
    const iterationResumed = timeline.find((t) => t.name === 'iteration_resumed' && t.ordinal > (iterationPaused?.ordinal ?? Infinity));
    check(iterationPaused !== undefined, 'the pause left the iteration open, recorded as paused by the pause (clause 2)', iterationPaused ? `iteration ${iterationPaused.meta.iteration}, ${iterationPaused.meta.paused_agents} agent(s)` : 'no iteration_paused entry');
    check(iterationResumed !== undefined && iterationResumed.meta.iteration === iterationPaused?.meta.iteration, 'the continue resumed that same iteration (clause 4)', iterationResumed ? `iteration ${iterationResumed.meta.iteration}` : 'no iteration_resumed entry after the pause');
    const pausedChildren = timeline.filter((t) => t.name === 'child_paused' && t.meta.interruption === 'pause').map((t) => t.meta.task_id);
    const resumedChildren = new Set(timeline.filter((t) => t.name === 'child_resumed').map((t) => t.meta.task_id));
    check(pausedChildren.length > 0, 'the pause left at least one child `paused` (clause 3)', pausedChildren.join(', ') || 'none');
    // P7: how many children the press found running and how many the pause held. Two is what clauses 3, 4 and 13 are
    // measured on; one is the model's pacing (the second child not running within the bound), a NOTE and not a failure.
    const pause = pauseReading(log, pausedChildren.length);
    if (pause.enough) check(true, `the pause held ${pause.held} children, so clauses 3, 4 and 13 were measured on more than one`, pause.detail);
    else noted('the pause held fewer than two children', pause.detail);
    check(pausedChildren.every((id) => resumedChildren.has(id)), 'every paused child resumed under its own task id (clause 4)', `${pausedChildren.length} paused, ${pausedChildren.filter((id) => resumedChildren.has(id)).length} resumed`);
    const iterations = db.prepare('SELECT iteration, state, outcome, interruption FROM iterations WHERE session_id = ? ORDER BY iteration').all(sid);
    check(iterations.length > 0 && iterations.every((it) => it.state === 'closed') && iterations.some((it) => it.outcome === 'succeeded'), 'the resumed iteration closed succeeded', JSON.stringify(iterations));
    // Each resumed child carried on from its own record: entries on both sides of the pause, under one task id.
    const pausedAt = iterationPaused?.at ?? '';
    const records = pausedChildren.map((id) => {
      const entries = db.prepare('SELECT seq, kind, body, at FROM agent_messages WHERE session_id = ? AND task_id = ? ORDER BY seq').all(sid, id);
      return { id, before: entries.filter((e) => e.at <= pausedAt), after: entries.filter((e) => e.at > pausedAt) };
    });
    /*
     * A staggered start is tolerated (OQ-213): a coordinator that skipped its todo list has its second delegation refused
     * once, so that child can be accepted only just before the Pause lands and be paused before it records a first entry.
     * Such a child must still carry on after the continue; at least one child must cross the pause with entries on both
     * sides, which is what clause 1 is measured on.
     */
    const crossed = records.filter((r) => r.before.length > 0);
    const unstarted = records.filter((r) => r.before.length === 0);
    check(crossed.length > 0 && records.every((r) => r.after.length > 0), 'each resumed child\'s record continues across the pause (clause 1)', records.map((r) => `${r.id}: ${r.before.length} before, ${r.after.length} after`).join('; '));
    if (unstarted.length > 0) noted('children paused before their first recorded entry (a staggered start), read on their entries after the continue alone', unstarted.map((r) => r.id).join(', '));
    /*
     * What the model was sent. The last entry a child recorded before the pause can only reach a request made after
     * it, and the pause stops every agent before its next model step (clause 15), so a request carrying it is the
     * resumed step. A fragment is looked for as the request body spells it: plain words, no quote, backslash or line.
     */
    const traffic = readTraffic('resume').filter((r) => String(r.path ?? '').includes('/chat/completions'));
    const carried = crossed.map((r) => {
      const last = r.before.at(-1);
      let text = '';
      try {
        const message = JSON.parse(last?.body ?? '{}');
        text = (message.content ?? []).map((part) => part.kind === 'text' ? part.text : part.kind === 'tool-result' ? part.result : part.kind === 'tool-call' ? JSON.stringify(part.args ?? {}) : '').join(' ');
      } catch { /* an entry that will not parse offers no fragment */ }
      const fragment = (text.match(/[A-Za-z0-9 ,.:()_-]{24,}/g) ?? []).sort((a, b) => b.length - a.length)[0]?.slice(0, 48) ?? null;
      return { id: r.id, fragment, sent: fragment === null ? null : traffic.some((t) => String(t.requestBody ?? '').includes(fragment)) };
    });
    const unreadable = carried.filter((c) => c.fragment === null);
    check(carried.filter((c) => c.fragment !== null).every((c) => c.sent), 'each resumed child\'s next request carried what it recorded before the pause (clause 4)', carried.map((c) => `${c.id}: ${c.fragment === null ? 'no plain fragment' : c.sent ? 'carried' : 'NOT carried'}`).join('; '));
    if (unreadable.length > 0) noted('children whose last entry offered no plain fragment to look for', unreadable.map((c) => c.id).join(', '));
    rest = { pausedChildren: pausedChildren.length, runningAtPause: pause.atPress, pauseBoundRanOut: pause.boundRanOut, iteration: iterationPaused?.meta.iteration ?? null, records: records.map((r) => ({ id: r.id, before: r.before.length, after: r.after.length })), carried, shown, iterations };
  } finally { db.close(); }
  const notes = ['notes-functions.md', 'notes-tests.md'].map((name) => ({ name, text: existsSync(join(workspace, 'docs', name)) ? readFileSync(join(workspace, 'docs', name), 'utf8') : '' }));
  check(notes.every((n) => n.text.trim() !== ''), 'both notes were written after the continue', notes.map((n) => `${n.name}: ${n.text.length} chars`).join(', '));
  results.scenarios.resume = { ...rest, status: read?.session.execution_status, tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output } };
  if (read) preserveRun('resume', read.session.session_id);
  await budgetGate();
}

// ── 4. The requirements board hands the work over ────────────────────────────────────────────────────────────
/**
 * The one path the composer scenarios never take. `edit` types a prompt; here nothing is typed: REQ-104 is selected
 * on the board, the move control is pressed, the release is confirmed, and everything after that is the product's —
 * the worktree it provisions, the run its coordinator starts, the review it raises and the accept that settles the
 * card in `done` (spec 08 §Runs Started from the Board; REQ-TRACE-464/472/474/499).
 *
 * The poll times below are an OBSERVATION schedule and are never reported as durations: they are the moments this
 * script LOOKED, and a different schedule would print different numbers for identical work. The product's own times
 * are read from the delivery store afterwards, which is the only place a duration here comes from.
 *
 * NOTHING THIS SCENARIO PRESSES IS PRESSED ON A CLOCK. Every click, the Open control that opens the card, and the two reads
 * of what the accept left behind wait for the state they act on (`@~ms`, a deadline rather than an appointment), and
 * the capture ends on the accept landing (`ROTARIS_CAPTURE_WAIT=js:…`) rather than at the far end of the window.
 *
 * That is a repair, and the defect it repairs is worth keeping in view: these presses used to fire at offsets
 * measured from the end of `LIVE_RUN_BOARD_MS`, whatever the board was showing by then. A model slower than the
  * window turned one timing failure into three, and two of the three accused the PRODUCT of faults it had not
  * committed — "the card rests in running", "the history lacks the accept" — when the truth was that accept had been
  * pressed at a card still running and the product had correctly declined it. Measured 2026-09-13 against
  * `qwen3.8-flash-next`: 240 s expired with the run about half-way, and the same run passed every check at 900 s.
  *
  * A second repair, 2026-09-19: the review presses went through the card's FOCUS — a click, then Enter into
  * whatever held focus once `[data-req-card]:focus` matched — and focus is not a thing the harness can hold.
  * Measured that day: the card-in-review click landed, the run's own completion re-rendered the board, focus was
  * lost, the `:focus` wait expired, and Enter went into unfocused space. The detail never opened, the review pane
  * never appeared, and the two closing checks accused the board of refusing an accept that was never presented.
  * The repair is the same rule applied one level down: the card is opened through its OWN OPEN CONTROL — the
  * `Open ${card.id}` button the card carries in its foot — pressed as soon as the card is in review, not through
  * a focus state no press can re-assert. Focus is a precondition the product owns; a click target is one the
  * harness can re-drive until it lands.
  *
  * A third repair, later the same day: the fallback above was UNSCOPED — `[data-testid="req-card-open"]` with no
  * column — so it matched a backlog card 1.5 s into the run and opened the detail mid-release, the 2026-09-13
  * premature-open resurrected. The scope is now part of the selector: the card in review, its foot, its Open
  * control, and nothing else matches. A press aimed at a state that is also true BEFORE the thing it waits for
  * is no better than a clock, and is harder to see.
  *
  * a defect note (removed once repaired) is the note. A harness that manufactures false
 * product symptoms is worse than one that is merely slow, because `AGENTS.md` rightly says to believe it.
 */
if (wanted.includes('requirements')) {
  // A bound now, not a schedule: the scenario ends when the accept lands, so a generous deadline costs a fast model
  // nothing. It is raised from 240 s because the endpoint's own model needs about twice that.
  const RUN_MS = Number(process.env['LIVE_RUN_BOARD_MS'] ?? 900_000);
  const CARD = '[data-req-card="REQ-104"]';
  const BOARD_AT = `(() => { const el = document.querySelector('[data-req-card="REQ-104"]'); const b = window.__rotarisBoard; return { column: el === null ? null : el.getAttribute('data-column'), openPane: b ? b.openPane : null, feedback: [...document.querySelectorAll('[data-testid="req-feedback"]')].map((f) => f.textContent.trim()).slice(0, 3) }; })()`;
  const HISTORY_AT = `(() => { const p = document.querySelector('[data-testid="req-history-state"]'); return p === null ? null : { state: p.getAttribute('data-state'), entries: [...p.querySelectorAll('li')].map((l) => l.textContent.trim()) }; })()`;
  // REQ-TRACE-364: `done` lies outside the columns area at this width, so the resting read goes through the board's
  // own reveal first; reading the DOM without it reads `null` and proves nothing. The reveal and the read are ONE
  // expression because two of them would be two coroutines racing for the same frame, with no order between them.
  const RESTING_AT = `(async () => { const b = window.__rotarisBoard; if (b && typeof b.reveal === 'function') b.reveal('REQ-104'); await new Promise((r) => requestAnimationFrame(() => r(undefined))); const el = document.querySelector('[data-req-card="REQ-104"]'); return { column: el === null ? null : el.getAttribute('data-column') }; })()`;
  // The accept's own trace in the surface: the history the detail panel already keeps live gains a second entry.
  // It is what the scenario waits on to finish and what the two closing reads wait on to look — one signal, so a
  // read can never happen before the thing it reads about.
  const ACCEPTED = '[data-testid="req-history-state"] li:nth-child(2)';
  const CARD_IN_REVIEW = `${CARD}[data-column="review"]`;
  // The detail is opened through the card's OWN Open control, not through focus plus Enter. Focus is a
  // precondition the product owns — the harness can wait for it but cannot re-assert it, so a lost focus
  // (measured 2026-09-19: the completion re-render between the click and the press) turns Enter into a
  // keystroke into unfocused space. A control is a target the harness CAN re-drive: the click seam retries
  // the match until the deadline, so a re-render that drops one attempt costs one poll, not the scenario.
  //
  // The selector carries the WHOLE chain — the card, its column, its foot, the control — because a press
  // aimed at a state that is also true BEFORE the thing it waits for is no better than a clock. The
  // unscoped `[data-testid="req-card-open"]` matched a backlog card 1.5 s into the run on 2026-09-19 and
  // opened the detail mid-release. The column is what makes this press wait: nothing matches until the run
  // puts the card in review. Scoped to the card for REQ-104 throughout, so the control is this card's and
  // not another's. The foot's Open control carries `data-testid="req-card-open"` (`Card.tsx`, added beside
  // the untestable label-only buttons); the click seam matches exact text, so the `>>Open` half names the
  // label while the selector half scopes it.
  const OPEN_CONTROL_SELECTOR = `${CARD_IN_REVIEW} [data-testid="req-card-open"]`;
  const OPEN_CONTROL = `${OPEN_CONTROL_SELECTOR}>>Open`;
  // Scoped to the open detail for REQ-104, so the control is this card's and not another's.
  const REVIEW_CONTROL = `[data-testid="req-detail"][data-req="REQ-104"] [data-testid="req-detail-review"]`;
  const poll = [];
  for (let t = 8_000; t < RUN_MS; t += 30_000) poll.push(t);
  const deadline = RUN_MS;
  const clicks = [
    `${CARD}@3000`,
    '[data-testid="req-move-control"]@4400',
    '[data-testid="req-confirm"] .btn>>Release@5400',
    // REQ-TRACE-474: a workspace that has already opted in to unattended work raises NO disclosure, and this
    // sandbox opts in — so the press is a no-op where there is none and the acceptance where there is one.
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@6800',
    // From here the model decides the pace. Each press names the thing that must be on screen before it means
    // anything, and the deadline is the only number: the card once the run puts it in review, the Open control
    // once the card is there, the Review control once the detail is open, the decision once the pane is, the
    // confirmation once the dialog is. The Open press below is a second click at the same card: the first
    // click selects it for the release, this one opens its detail once the run puts it in review — the card's
    // own control, matched by state rather than by focus. The double-click travels its own seam
    // (`ROTARIS_CAPTURE_DOUBLE_CLICKS`, `seams.ts`): the click seam sends single clicks only and a single
    // click merely selects, while the card's `onDoubleClick` is what opens the detail — the same gesture a
    // person uses. Both wait on the CARD's state (in review), never on focus.
    `${CARD_IN_REVIEW}@~${deadline}`,
    `${OPEN_CONTROL}@~${deadline}`,
    `${REVIEW_CONTROL}@~${deadline}`,
    `[data-testid="req-pane-review-decisions"] .btn-primary@~${deadline}`,
    `[data-testid="req-pane-review-confirm"] .btn-primary@~${deadline}`,
  ];
  // The double-click is NOT in `clicks`: it must not fire at an appointment before the card is in review
  // (the 2026-09-13 premature-open) — one waited press, aimed at the card rather than at its foot.
  const doubleClicks = [
    `${CARD_IN_REVIEW}@~${deadline}`,
  ];
  // The fallback Open click IS in `clicks` beside the double-click: both share the deadline, and the match
  // names the card IN REVIEW — a card the double-click has already opened has moved past review, so the
  // fallback's match lapses before it presses. The fallback fires only into the gap the double-click left.
  const watches = [
    `${BOARD_AT}@6400`,
    ...poll.map((t) => `${BOARD_AT}@${t}`),
    `${RESTING_AT}>>${ACCEPTED}@~${deadline}`,
    `${HISTORY_AT}>>${ACCEPTED}@~${deadline + 1}`,
  ];
  const log = await launch('requirements', {
    ROTARIS_CAPTURE_RESIZE: '1264x800@300',
    ROTARIS_CAPTURE_VIEWS: '4@1200',
    ROTARIS_CAPTURE_CLICKS: [...clicks, `${OPEN_CONTROL}@~${deadline}`].join(';;'),
    ROTARIS_CAPTURE_DOUBLE_CLICKS: doubleClicks.join(';;'),
    ROTARIS_CAPTURE_EVAL_AT: watches.join(';;'),
    ROTARIS_CAPTURE_WAIT: `js:document.querySelector(${JSON.stringify(ACCEPTED)}) !== null`,
    ROTARIS_CAPTURE_WAIT_MS: String(deadline + 30_000),
    ROTARIS_CAPTURE_AFTER_MS: '6000',
  }, deadline + 150_000);
  const readEval = (at) => {
    const line = new RegExp(`capture: eval-at ${at} .*? → (.*)\\s*$`, 'm').exec(log);
    if (line === null) return null;
    try { return JSON.parse(line[1]); } catch { return null; }
  };
  /** What `settleAt` wrote about one waited-for selector: it matched, it never did, or the press never got that far. */
  const waited = (selector) => {
    const quoted = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`capture: ${quoted} matched with`).test(log)) return 'matched';
    if (new RegExp(`capture: ${quoted} never matched within`).test(log)) return 'expired';
    return 'not reached';
  };
  /** The detail counts as opened when the Review control was offered (the detail carries it) or when either
   * opening gesture landed: the double-click logs `double-clicked "…"`, the fallback click logs
   * `clicked "Open"`. A re-render can drop one poll while the press still lands, so no single line is
   * load-bearing — but the Review control appearing is conclusive either way. */
  const detailOpened = () => {
    if (waited(REVIEW_CONTROL) !== 'not reached') return waited(REVIEW_CONTROL);
    if (/capture: double-clicked /m.test(log)) return 'matched';
    if (waited(OPEN_CONTROL_SELECTOR) !== 'not reached') return waited(OPEN_CONTROL_SELECTOR);
    return /capture: clicked "Open"/m.test(log) ? 'matched' : 'not reached';
  };
  const columns = poll.map((t) => readEval(t)?.column ?? null);
  const trail = columns.filter((c) => c !== null).join(' → ') || 'the board showed nothing';
  check(columns.some((c) => c === 'running' || c === 'review' || c === 'done'), 'the release became a real run, started by the board and not by a prompt', trail);
  /**
   * One expiry, one failure. The presses after it are not attempted against a board that never offered them,
   * so they are NOTED rather than failed: a press that was never made cannot be evidence about the product, and
   * reporting it as one is how this scenario used to accuse the board of losing a card it had never been given.
   * That rule now covers every link of the review chain, not just the card reaching review: the detail never
   * opened means the Review control, the decision and the confirmation were never offered either — each
   * unreached press is noted with what its wait did.
   */
  const opened = detailOpened();
  const reviewOffered = waited(REVIEW_CONTROL) === 'matched';
  let settled = null;
  const reachedReview = waited(CARD_IN_REVIEW) === 'matched';
  check(reachedReview, `the run reached review inside the ${Math.round(deadline / 1000)} s the board was given`, reachedReview ? trail : `${trail} — the window expired with the card where the trail leaves it; raise LIVE_RUN_BOARD_MS if the model is slower than that`);
  if (!reachedReview) {
    noted('the review was never offered, so the accept was not pressed', `detail: ${opened}; review control: ${waited(REVIEW_CONTROL)}; decision: ${waited('[data-testid="req-pane-review-decisions"] .btn-primary')}; confirmation: ${waited('[data-testid="req-pane-review-confirm"] .btn-primary')}`);
  } else if (opened !== 'matched') {
    noted('the card reached review but its detail never opened', `detail: ${opened}; review control: ${waited(REVIEW_CONTROL)}; decision: ${waited('[data-testid="req-pane-review-decisions"] .btn-primary')}; confirmation: ${waited('[data-testid="req-pane-review-confirm"] .btn-primary')}`);
  } else if (!reviewOffered) {
    noted('the detail never offered its Review control, so the review was never offered', `review control: ${waited(REVIEW_CONTROL)}; decision: ${waited('[data-testid="req-pane-review-decisions"] .btn-primary')}; confirmation: ${waited('[data-testid="req-pane-review-confirm"] .btn-primary')}`);
  } else {
    settled = readEval(deadline);
    check(settled?.column === 'done', "the review's accept left the card resting in done", `it rests in ${settled?.column ?? 'nothing the board showed'}`);
    const entries = readEval(deadline + 1)?.entries ?? [];
    check(entries.some((e) => /release/i.test(e)) && entries.some((e) => /accept/i.test(e)), 'the delivery history carries both the release and the accept', entries.join(' | ') || 'the history read empty');
  }

  // The store, for the two facts no surface shows: that the run was recorded at all, and what it was granted.
  const db = new (require('better-sqlite3'))(oneDatabase(), { readonly: true });
  let runRows = [];
  let historyRows = [];
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    const runsTable = tables.find((t) => /delivery.*run|run.*delivery/.test(t));
    const historyTable = tables.find((t) => /delivery.*histor|histor.*delivery/.test(t));
    if (runsTable) runRows = db.prepare(`SELECT * FROM "${runsTable}"`).all();
    if (historyTable) historyRows = db.prepare(`SELECT * FROM "${historyTable}" ORDER BY rowid`).all();
  } finally { db.close(); }
  check(historyRows.filter((r) => String(r.action) === 'release').length === 1, 'exactly one release was written for one release', historyRows.map((r) => r.action).join(', '));
  // REQ-TRACE-464/472: the run record names its session and the permissions it was actually granted, so the
  // disclosure and the audit trail can never tell different stories.
  const run = runRows[0];
  check(runRows.length === 1 && typeof run?.session_id === 'string' && run.session_id.length > 0, 'the run record carries the session identifier', `${runRows.length} run row(s)`);
  check(String(run?.permissions ?? '').length > 0, 'the run record says what permissions it was granted', String(run?.permissions ?? 'nothing'));
  const read = readSession();
  checkPricing('requirements', read?.session);
  const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
  const names = [...new Set(tools.map((row) => row.tool_name))];
  check((read?.session.tokens_input ?? 0) > 0 && (read?.session.tokens_output ?? 0) > 0, 'the board-started run carries real usage from the endpoint', `${read?.session.tokens_input} in / ${read?.session.tokens_output} out over ${read?.session.iterations_completed} iteration(s)`);
  check(tools.length > 0 && tools.every((row) => row.settled === 1), 'every tool call in the board-started run settled', names.join(', '));

  // The work itself, in the worktree the run was confined to — never in the workspace the board sits in.
  const worktrees = git('worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
  check(worktrees.length >= 2, 'the run was confined to a worktree of its own', worktrees.map((w) => w.split(/[\\/]/).pop()).join(', '));
  const unit = worktrees.slice(1).find((w) => existsSync(join(w, 'src', 'todos.js')));
  // REQ-MCP-034: the record naming a worktree is not the run being confined to it — the code-intelligence server must have
  // been LAUNCHED against that tree's root, every time (finding D1 at 1763f7f: the record named the worktree and the server
  // answered from the main checkout). Read from the run host's launch lines, which name the project the launch carried.
  const realOf = (p) => { try { return realpathSync(p); } catch { return p; } };
  const bound = unit === undefined ? { ok: false, detail: 'no worktree holds the unit\'s src/todos.js' } : bindingVerdict(log, unit, realOf);
  check(bound.ok, 'the code-intelligence server was launched against the worktree\'s root, never the workspace the board sits in (REQ-MCP-034)', bound.detail);
  const source = unit === undefined ? '' : readFileSync(join(unit, 'src', 'todos.js'), 'utf8');
  const suiteText = unit === undefined ? '' : readFileSync(join(unit, 'src', 'todos.test.js'), 'utf8');
  check(/export (function|const) completedCount/.test(source), 'completedCount is exported from the worktree\'s src/todos.js');
  check(/completedCount/.test(suiteText), 'the worktree\'s suite tests it');
  // The independent reading, as in `edit`: this script runs the suite itself, whatever the agent reported.
  const suiteRun = unit === undefined ? { status: null } : spawnSync(process.execPath, ['--test'], { cwd: unit, encoding: 'utf8', timeout: 120_000 });
  if (unit !== undefined) writeFileSync(join(scenarioDir('requirements'), 'node-test.log'), `${suiteRun.stdout ?? ''}\n${suiteRun.stderr ?? ''}`);
  check(suiteRun.status === 0, 'node --test is green inside the worktree afterwards', `exit ${suiteRun.status ?? 'no worktree to run it in'}`);
  if (unit !== undefined) writeFileSync(join(scenarioDir('requirements'), 'diff.txt'), `${execFileSync('git', ['-C', unit, 'diff', head], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })}\n`);
  results.scenarios.requirements = {
    observed: columns, settledColumn: settled?.column ?? null, history: historyRows.map((r) => ({ action: r.action, at: r.at })),
    run: run === undefined ? null : { sessionId: run.session_id, permissions: run.permissions, startedAt: run.started_at, endedAt: run.ended_at },
    // The product's own durations, from its own timestamps — never from the poll schedule above.
    runMs: run?.started_at && run?.ended_at ? Date.parse(String(run.ended_at)) - Date.parse(String(run.started_at)) : null,
    tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output }, tools: names, worktree: unit ?? null, suiteExit: suiteRun.status,
  };
  if (read) preserveRun('requirements', read.session.session_id);
  await budgetGate();
}

// ── 5. The shell over what the runs left ─────────────────────────────────────────────────────────────────────
if (wanted.includes('shell')) {
  const PROBES = ['[data-testid="overview-sessions"] .ov-session', '[data-testid="overview-repo-branch"]', '[data-testid="overview-tool-chips"] .tag', '.app-shell'];
  const log = await launch('shell', { ROTARIS_CAPTURE_END_VIEW: '1', ROTARIS_CAPTURE_END_VIEW_MS: '3500', ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ROTARIS_CAPTURE_AFTER_MS: '2500' });
  const probe = (selector) => {
    const line = new RegExp(`capture: probe ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])\\s*$`, 'm').exec(log);
    return line === null ? null : JSON.parse(line[1]);
  };
  const sessions = probe('[data-testid="overview-sessions"] .ov-session') ?? [];
  const branch = probe('[data-testid="overview-repo-branch"]') ?? [];
  const expectedSessions = wanted.filter((name) => name === 'ask' || name === 'edit').length;
  check(probe('.app-shell')?.length === 1, 'the shell painted');
  check(sessions.length >= expectedSessions, 'Overview lists the sessions the runs left', `${sessions.length} session row(s)`);
  // The repository card reads the attached session, and a run that left none — `--only=shell` alone — paints no
  // card; that is the surface's design, not a red.
  // docs/defects/fixed/the-live-runs-shell-scenario-reds-on-a-run-that-left-no-session.md
  if (expectedSessions === 0 && sessions.length === 0) noted('the repository card reads the branch', 'no session was attached, so the Overview paints no repository card');
  else check(branch.length > 0 && /main/.test(branch[0]?.text ?? ''), 'the repository card reads the branch', branch[0]?.text ?? 'absent');
  results.scenarios.shell = { sessions: sessions.map((row) => row.text), branch: branch[0]?.text ?? null, toolChips: (probe('[data-testid="overview-tool-chips"] .tag') ?? []).map((tag) => tag.text) };
}

// ── 6. The frictions probe: first-use write_file and the win32 SIGINT stop ───────────────────────────────
/**
 * One real run engineered to trip the inducible run-autopsy frictions, read back from the STORE rather than
 * from the model's report: a first-use `write_file` create (nine refusals across three fresh children in run
 * `7bd9c19d`; `docs/defects/fixed/a-first-use-schema-guess-failed-without-an-example.md`) and a SIGINT stop of a
 * pipe session on win32 (`docs/defects/fixed/win32-terminal-edge-cases-bounced-to-the-agent.md`).
 *
 * Red by design until the fixes land: each check below fails while its friction reproduces and passes once
 * the product absorbs it, which is what makes this scenario the fixes' verification. Two recorded frictions
 * are NOT induced here: the stream-stall abort needs an endpoint fault (the `faults` scenario induces it), and the
 * exit-trace gap needs a crash (`pnpm exit-trace-proof` fires it in the built app).
 */
if (wanted.includes('frictions')) {
  const log = await launch('frictions', {
    // PD-TOOLS-007: the write is asked with only `path` and `content`, the shape the directive reads as a create; worded only
    // "Create a file …", a model that reads the schema names the operation and the shape is never asked
    // (docs/defects/fixed/the-live-runs-frictions-prompt-never-asks-pd-tools-007s-inferred-create.md).
    ROTARIS_CAPTURE_PROMPT: 'Create a file called friction-probe.txt in the workspace root containing exactly one line with the text probe-ok: call write_file with only the two arguments path and content, and leave out operation. Then run `node -e "setTimeout(() => {}, 20000)"` in the terminal and stop it by sending SIGINT to its session. Reply DONE when both are finished.',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000', ROTARIS_CAPTURE_PROBE: DURATION_PROBES.join(';;'),
  }, RUN_WAIT_MS + 90_000);
  check(!/capture: wait for result timed out/.test(log), 'the probe run reached its result inside the wait');
  const read = readSession();
  checkPricing('frictions', read?.session);
  checkRunDuration('frictions', log);
  check(read?.session.execution_status === 'completed', 'the probe run completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
  const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
  const names = [...new Set(tools.map((row) => row.tool_name))];
  check(names.includes('write_file'), 'the probe run attempted the file write', names.join(', '));
  // The tool-call record, for the two refusals no surface shows: what the agent passed and what refused it.
  const fdb = new (require('better-sqlite3'))(oneDatabase(), { readonly: true });
  let calls = [];
  try {
    if (read) calls = fdb.prepare('SELECT ordinal, tool_name, agent_name, status, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(read.session.session_id);
  } finally { fdb.close(); }
  const entryOf = (call) => { try { return JSON.parse(call.entry); } catch { return {}; } };
  const resultOf = (call) => String(entryOf(call).result ?? '');
  const argsOf = (call) => entryOf(call).args ?? {};
  const writeOp = calls.filter((call) => call.tool_name === 'write_file' && call.status !== 'ok' && resultOf(call).includes('requires an operation'));
  check(writeOp.length === 0, 'write_file needed no operation repair on first use', writeOp.length === 0 ? 'no refusal in the record' : `${writeOp.length} refusal(s), e.g. ordinal ${writeOp[0].ordinal} (${writeOp[0].agent_name})`);
  // Live-run finding L6: `probe-ok\n` was reported "2 line(s) created". A final newline ends a line, so every create
  // reports the lines its content holds as `wc -l` counts them, plus an unterminated last line.
  const linesIn = (text) => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
  const creates = calls.filter((call) => call.tool_name === 'write_file' && call.status === 'ok' && argsOf(call).operation === 'create' && typeof argsOf(call).content === 'string');
  const miscounted = creates.filter((call) => { const reported = /: (\d+) line\S* created/.exec(resultOf(call)); return reported === null || Number(reported[1]) !== linesIn(argsOf(call).content); });
  if (creates.length === 0) noted('no write_file create settled ok, so its line count was not observed', names.join(', '));
  else check(miscounted.length === 0, 'every write_file create reported the lines its content holds (a final newline ends a line)', miscounted.length === 0 ? `${creates.length} settled, e.g. ${JSON.stringify(resultOf(creates[0]).split(' (sha256')[0])} for ${JSON.stringify(argsOf(creates[0]).content)}` : `ordinal ${miscounted[0].ordinal}: ${JSON.stringify(resultOf(miscounted[0]).slice(0, 120))} for ${JSON.stringify(argsOf(miscounted[0]).content)}`);
  // PD-TOOLS-007, asked by name: the probe's write sent with no operation for a file that does not exist is read as a create,
  // its result saying so. A write that named its operation anyway left the shape unasked, which is a NOTE.
  const probeWrites = calls.filter((call) => call.tool_name === 'write_file' && /friction-probe\.txt$/.test(String(argsOf(call).path ?? argsOf(call).file_path ?? '')));
  const inferredHere = probeWrites.filter((call) => /No operation was given, so this call was read as 'create'/.test(resultOf(call)));
  if (probeWrites.length === 0) noted('the probe file was not written with write_file', names.join(', '));
  else if (inferredHere.length === 0 && writeOp.length === 0) noted("the probe's write named its operation, so PD-TOOLS-007's inferred create was not asked", `${probeWrites.length} write(s), e.g. ordinal ${probeWrites[0].ordinal}: ${resultOf(probeWrites[0]).split('\n')[0].slice(0, 120)}`);
  else check(inferredHere.length > 0 && inferredHere.every((call) => call.status === 'ok' && argsOf(call).operation === 'create'), "the probe's write with no operation was read as a create, its result saying so and its record storing the create (PD-TOOLS-007)", inferredHere.length > 0 ? `ordinal(s) ${inferredHere.map((call) => `${call.ordinal} ${call.status}`).join(', ')}` : `${writeOp.length} refused for want of an operation`);
  const signalled = calls.some((call) => call.tool_name === 'terminal' && argsOf(call).session_action === 'send_signal');
  check(signalled, 'the probe run attempted the SIGINT stop', signalled ? 'send_signal dispatched' : 'no send_signal in the record — the model did not attempt it');
  const sigint = calls.filter((call) => call.tool_name === 'terminal' && resultOf(call).includes('cannot be delivered'));
  check(sigint.length === 0, 'SIGINT was delivered without a platform refusal', sigint.length === 0 ? 'no refusal in the record' : `${sigint.length} refusal(s), e.g. ordinal ${sigint[0].ordinal} (${sigint[0].agent_name})`);
  // Live-run finding L4 (OQ-133): the session the agent stopped with its own signal read `failed (exit -1)`, an error
  // that filed a tool_error. It reads `killed` now; a `failed (exit -1)` anywhere in the record is the old shape.
  const signalDeath = calls.filter((call) => call.tool_name === 'terminal' && /is failed \(exit -1\)/.test(resultOf(call)));
  const readKilled = calls.filter((call) => call.tool_name === 'terminal' && /is killed \(exit -1\)/.test(resultOf(call)));
  // Neither shape in the record means the model never read the session back after its signal: nothing was observed
  // about the product, so it is a NOTE, not a pass.
  if (signalDeath.length === 0 && readKilled.length === 0) noted("no background session's end was read back after the agent's signal", signalled ? 'the model did not query the session after send_signal, so the status of its signal death was not observed' : 'no send_signal in the record');
  else check(signalDeath.length === 0, "no background session read failed (exit -1) after the agent's signal", signalDeath.length === 0 ? `${readKilled.length} observation(s) read killed (exit -1)` : `ordinal ${signalDeath[0].ordinal} (${signalDeath[0].agent_name})`);
  /*
   * K3 of the default live run at c2fdd6a (docs/defects/fixed/the-entry-roles-route-slot-says-the-coordinator-routed-the-task-to-it.md):
   * the root's playbook told the coordinator "the coordinator routed it to you", here beside the direct-work statement
   * (PD-ORCH-006). The root's requests are the ones whose instructions carry that statement, which no child is given.
   * The two ROUTE strings are coupled to the built-in `ROUTE.entry` and `ROUTE.routed` wording in
   * packages/engine/src/playbooks/catalogue.ts (and fetch-proof.mjs reads the same two): re-word them together.
   */
  const systemOf = (record) => { try { const m = JSON.parse(String(record.requestBody ?? '')).messages?.[0]; return m?.role === 'system' ? (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)) : ''; } catch { return ''; } };
  const rootSystems = readTraffic('frictions').filter((r) => String(r.path ?? '').includes('/chat/completions')).map(systemOf).filter((t) => t.includes('For this run you hold the tools to read and write files and run commands yourself'));
  if (rootSystems.length === 0) noted("the root's playbook was not observed", RECORD_TRAFFIC ? 'no recorded request carried the direct-work statement' : 'traffic not recorded (--no-record-traffic)');
  else {
    const misrouted = rootSystems.filter((t) => t.includes('the coordinator routed it to you') || !t.includes('ROUTE: Your assignment is the request itself'));
    check(misrouted.length === 0, "the root's ROUTE slot says the request came from the user, not that a coordinator routed it", misrouted.length === 0 ? `${rootSystems.length} root request(s)` : `${misrouted.length} of ${rootSystems.length}: ${JSON.stringify((/ROUTE: [^\n]*/.exec(misrouted[0]) ?? ['no ROUTE line'])[0])}`);
  }
  // The probe file served its purpose in the record above; the sandbox stays clean for the scenarios after it.
  if (read) {
    check(existsSync(join(workspace, 'friction-probe.txt')), 'the probe file landed in the workspace', 'friction-probe.txt');
    rmSync(join(workspace, 'friction-probe.txt'), { force: true });
  }
  noted('the stream-stall abort is not covered here', 'the `faults` scenario induces it through the recording proxy; the observed shape is recorded in docs/defects/fixed/single-retry-stream-stall-aborted-a-76-minute-run.md');
  // The exit trace's crash handlers are not induced here: no live launch crashes a process. They are fired in the built app
  // by `pnpm exit-trace-proof` (the run host killed, the renderer crashed; PD-MONITOR-002), which reads main's GONE lines
  // (docs/defects/fixed/the-exit-trace-crash-handlers-were-never-fired-in-a-built-app.md).
  results.scenarios.frictions = { status: read?.session.execution_status, tools: names, writeOpRefusals: writeOp.map((call) => call.ordinal), inferredCreates: inferredHere.map((call) => call.ordinal), sigintRefusals: sigint.map((call) => call.ordinal) };
  if (read) preserveRun('frictions', read.session.session_id);
  await budgetGate();
  /*
   * Live-run finding M3 (docs/defects/fixed/an-error-path-tool-record-cuts-its-arguments-and-result-without-the-cut-marker.md):
   * one command that fails on purpose with about 5,000 characters of output, so its record is an error-path record whose
   * result REQ-SESSION-136 cuts to 2,000 characters and REQ-SESSION-194 marks with a closing `...` (before fin23, the bare
   * 2,000-character head). Its own launch, `frictions-cut`: asked as a third step of the probe above (2026-10-06, run
   * `2026-10-06T23-23-38-541Z`), it made that run delegate each step, and the delegated tester stopped the timer with
   * `kill -INT` rather than the terminal's `send_signal`, so the SIGINT probe and the root's ROUTE reading went unasked.
   * `checkToolRecord` reads every session's error-path records the same way at the end.
   */
  const cutLog = await launch('frictions-cut', {
    ROTARIS_CAPTURE_PROMPT: 'Run `node -e "for (let i = 1; i <= 120; i++) console.log(i, Array(40).join(String.fromCharCode(120))); process.exit(3)"` in the terminal once. It fails on purpose, so do not repeat or repair it. Reply DONE when it has finished.',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
  }, RUN_WAIT_MS + 90_000);
  check(!/capture: wait for result timed out/.test(cutLog), 'the failing long-output run reached its result inside the wait');
  const cutRead = readSession();
  checkPricing('frictions-cut', cutRead?.session);
  const longFail = cutRead ? readToolCalls(cutRead.session.session_id).filter((call) => call.tool_name === 'terminal' && typeof call.args?.command === 'string' && call.args.command.includes('process.exit(3)')) : [];
  if (longFail.length === 0) noted('the failing long-output command was not run, so the error-path cut was not observed in its own launch', cutRead ? `${cutRead.session.execution_status} (${cutRead.session.stop_reason})` : 'no session');
  else {
    const c = longFail[0];
    check(c.isError && c.result.length === 2000 && c.result.endsWith('...'), "the failing long-output command's record is cut to 2,000 characters ending with REQ-SESSION-194's marker (REQ-SESSION-136)", `ordinal ${c.ordinal} (${c.agent_name}): ${c.status}, is_error ${c.isError}, ${c.result.length} characters ending ${JSON.stringify(c.result.slice(-12))}`);
  }
  results.scenarios['frictions-cut'] = { status: cutRead?.session.execution_status, cutOrdinals: longFail.map((call) => call.ordinal) };
  if (cutRead) preserveRun('frictions-cut', cutRead.session.session_id);
  await budgetGate();
}

// ── 7. The endpoint misbehaves, on purpose ───────────────────────────────────────────────────────────────
/**
 * Two of the run-autopsy's recorded frictions have always been reported as uncoverable here — "the stream-stall
 * abort is not covered, it needs an endpoint fault". The recording proxy is already in the path, so the
 * endpoint fault is now something this harness can produce, on a call it NAMES rather than on one it hopes for.
 *
 * Separate launches, because one fault can end a run before the next would fire, and a rule that never fired is not
 * evidence about anything:
 *
 *   faults-ladder — a 429 on the second completion and a 500 on the third. Neither reaches the endpoint, so
 *                   this costs the owner nothing but the retries. The question: does the run survive both, and
 *                   does each leave the trace of the layer that retried it? OQ-110 (2026-09-29) ruled the
 *                   dispatch layer's retries (REQ-CONFIG-086) come before the ladder's (REQ-ORCH-091/092), so
 *                   with its default budget of 5 the ladder is not reached and the trace is the session log's.
 *   faults-stall  — the bytes stop mid-stream on the second completion and the socket stays open. The question
 *                   is the eighty-second defect's: a model timeout once collapsed into the same `aborted` flag
 *                   a user's stop sets, and the run reported itself `user_cancelled` with nobody having
 *                   pressed anything. That is the assertion below, and it is a real regression guard.
 *   faults-args   — (since 2026-10-07) every piece of a tool call's streamed arguments held back a little, so one call
 *                   streams for several stall thresholds: is any agent reported stalled while it streams? See its
 *                   own note below.
 *
 * The fault mechanism is unit-tested against a loopback upstream (`lib/model-traffic.test.ts`); what these three
 * launches claim about the PRODUCT is shown only by a live run. Each has executed against a real endpoint and reported
 * back in `docs/architecture/first-executions.md`: the ladder and the stall first on 2026-09-22, `faults-args` on
 * 2026-10-07 (red on the product before its repair, green after).
 */
if (wanted.includes('faults')) {
  if (proxy === null) {
    noted('the fault scenarios did not run', 'they need the recording proxy, and it is not in the path (--no-record-traffic, or it could not start)');
  } else {
    const PROMPT = 'Read src/todos.js and reply, in one sentence, with the names of the functions it exports.';

    proxy.setFaults([{ kind: 'status', at: 2, status: 429 }, { kind: 'status', at: 3, status: 500 }]);
    const ladder = await launch('faults-ladder', {
      ROTARIS_CAPTURE_PROMPT: PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
    }, RUN_WAIT_MS + 90_000);
    void ladder;
    const ladderFired = proxy.stats().faultsFired;
    const ladderTraffic = readTraffic('faults-ladder');
    const injected = ladderTraffic.filter((r) => r.fault !== undefined).map((r) => r.status);
    const ladderRead = readSession();
    checkPricing('faults-ladder', ladderRead?.session);
    check(ladderFired.length === 2, 'both injected refusals reached the product', `${ladderFired.length} of 2 fired; statuses recorded: ${injected.join(', ') || 'none'}`);
    check(ladderRead?.session.execution_status === 'completed', 'the run completed despite a 429 and a 500', `${ladderRead?.session.execution_status} (${ladderRead?.session.stop_reason})`);
    /*
     * WHO retried each refusal, read from the product's own record — never from the traffic alone.
     *
     * This check once read "the ladder retried past the refusals rather than giving up" and passed on the call count:
     * more calls than refusals. The first live run's 429 and 500 were retried by the model client's dispatch layer
     * before the ladder saw either, so it passed with the ladder never reached (live-run finding H3). OQ-110 ruled
     * that order the specification's — REQ-CONFIG-086's `num_retries` (default 5) first, REQ-ORCH-091/092's ladder
     * when they are exhausted — and made the dispatch layer's retries visible: one WARNING line per absorbed retry in
     * the session log, naming the status it met. So each injected refusal must be answered by a trace one of the two
     * layers leaves: that session-log line, or the ladder's own `issues` row (`model_wait` for a 429,
     * `transient_llm_error` for a 500). Which layer it was is noted, not required.
     */
    const ladderLog = ladderRead === null ? '' : readSessionLog(ladderRead.session.session_id);
    const absorbed = [...ladderLog.matchAll(/model request retried by the dispatch layer: .*? met HTTP (\d{3}) and waited (\d+) ms before retry (\d+) of (\d+)/g)]
      .map((m) => ({ status: Number(m[1]), waitedMs: Number(m[2]), attempt: Number(m[3]), of: Number(m[4]) }));
    const ladderIssues = ladderRead === null ? [] : readIssues(ladderRead.session.session_id).filter((issue) => issue.kind === 'model_wait' || issue.kind === 'transient_llm_error');
    const unanswered = [...injected];
    for (const retry of absorbed) { const at = unanswered.indexOf(retry.status); if (at !== -1) unanswered.splice(at, 1); }
    const byLadder = { 429: 'model_wait', 500: 'transient_llm_error' };
    for (const issue of ladderIssues) { const at = unanswered.findIndex((status) => byLadder[status] === issue.kind); if (at !== -1) unanswered.splice(at, 1); }
    check(injected.length > 0 && unanswered.length === 0, 'each injected refusal was retried, read from the session log\'s dispatch-layer lines or the ladder\'s issues (OQ-110)',
      `${injected.length} refusal(s) (${injected.join(', ') || 'none'}); dispatch layer: ${absorbed.map((r) => `HTTP ${r.status} waited ${r.waitedMs} ms, retry ${r.attempt} of ${r.of}`).join('; ') || 'no line'}; ladder: ${ladderIssues.map((issue) => issue.kind).join(', ') || 'no issue'}${unanswered.length === 0 ? '' : `; no trace for ${unanswered.join(', ')}`}; ${ladderTraffic.length} call(s) recorded`);
    noted('which layer retried the refusals', ladderIssues.length === 0
      ? `the dispatch layer alone (${absorbed.length} absorbed retr${absorbed.length === 1 ? 'y' : 'ies'}); the ladder was not reached, as OQ-110 rules for a budget that was not exhausted`
      : `the ladder recorded ${ladderIssues.map((issue) => issue.kind).join(', ')} after the dispatch layer's ${absorbed.length} retr${absorbed.length === 1 ? 'y' : 'ies'}`);
    if (ladderRead) preserveRun('faults-ladder', ladderRead.session.session_id);
    results.scenarios['faults-ladder'] = { fired: ladderFired, injected, calls: ladderTraffic.length, dispatchRetries: absorbed, ladderIssues: ladderIssues.map((issue) => ({ kind: issue.kind, message: issue.message })), status: ladderRead?.session.execution_status, stopReason: ladderRead?.session.stop_reason };
    await budgetGate();

    /*
     * The hold must OUTLAST the product's own idle bound, or this scenario measures the proxy letting go
     * rather than the product noticing. `llm_response_timeout` is 120 s by default (REQ-CONFIG-115, re-armed
     * per part — ADR-0027's fourth execution, which is the repair for the eighty-second defect), so 300 s
     * leaves a wide margin. Lower this below the product's bound and the run recovers for the wrong reason.
     * Measured on the first live execution, 2026-09-22: the product gave up at 120.5 s and retried at 121.5 s,
     * both well inside the hold.
     */
    const HOLD_MS = Number(process.env['LIVE_RUN_STALL_HOLD_MS'] ?? 300_000);
    proxy.setFaults([{ kind: 'stall', at: 2, afterChunks: 2, holdMs: HOLD_MS }]);
    /*
     * A third photograph between the entry agent's stall threshold (90 s of silence) and the product's idle bound (120 s),
     * so the pack shows what a surface drew while the root was stalled — the inspector follows it, and its meta line ends
     * with the watch's figure (REQ-ORCH-089, OQ-153). The other two are `launch`'s own fifth and three fifths.
     */
    const stallDir = scenarioDir('faults-stall');
    const stallShots = [['early', Math.round(RUN_WAIT_MS * 0.2)], ['stalled', 115_000], ['mid', Math.round(RUN_WAIT_MS * 0.6)]]
      .map(([tag, at]) => `${join(stallDir, `faults-stall.${tag}.png`)}@${at}`).join(';;');
    const stalled = await launch('faults-stall', {
      ROTARIS_CAPTURE_PNG_AT: stallShots,
      ROTARIS_CAPTURE_PROMPT: PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
    }, RUN_WAIT_MS + 120_000);
    void stalled;
    const stallFired = proxy.stats().faultsFired;
    const stallRead = readSession();
    checkPricing('faults-stall', stallRead?.session);
    check(stallFired.length === 1, 'the stall was injected', `${stallFired.length} of 1 fired`);
    if (stallRead === null) {
      check(false, 'the stalled run left a session row', 'no session was recorded at all');
    } else {
      /*
       * THE POSITIVE HALF, and the reason it exists.
       *
       * `stop_reason !== 'user_cancelled'` is a check that also passes when nothing stalled at all — a run
       * that never met a fault ends `tasks_complete` too. On its own it is a proof that cannot fail, which
       * `codebase.md` rules is a finding rather than a pass. So the product must be shown to have NOTICED:
       * its own `issues` row, in its own words, saying the stream went quiet and it is retrying.
       *
       * Together the two are the eighty-second defect's question in full — the stream did stall, the product
       * did classify it, and what it classified it as was transient rather than a user's stop.
       */
      const issues = readIssues(stallRead.session.session_id);
      const noticed = issues.filter((issue) => /stream activity|no stream|timed out/i.test(String(issue.message ?? '')));
      check(noticed.length > 0, 'the product noticed the stalled stream and said so', noticed.length > 0 ? `${noticed[0].kind}: ${String(noticed[0].message).slice(0, 120)}` : `none of ${issues.length} issue(s) mentions the stream — the stall may not have reached the run at all`);
      // The eighty-second defect's signature: nobody pressed stop, so nothing may say the user cancelled.
      check(stallRead.session.stop_reason !== 'user_cancelled', 'a stalled stream is not reported as a user cancellation', `stop_reason ${stallRead.session.stop_reason} (${stallRead.session.execution_status})`);
      if (noticed.length > 0) check(noticed.every((issue) => issue.kind !== 'fatal_llm_error'), 'the stalled stream was classified transient, not fatal', noticed.map((issue) => issue.kind).join(', '));
      /*
       * REQ-MONITOR-117/119 (the repair of `a-stalled-child-is-never-shown-stalled.md`): the stalled call is the entry
       * agent's, and "each agent is evaluated for a stall". Its watch's threshold (90 s by default) falls inside the product's
       * idle bound (120 s), so before the call is given up on the watch must have written REQ-MONITOR-119's `stall` issue for
       * the root, in its own words. Until 2026-09-30 the root had no watch, and nothing was written until the bound fired.
       */
      const rootStall = issues.filter((issue) => issue.kind === 'stall' && /^agent appears stalled: no model event or token for \d+ seconds/.test(String(issue.message ?? '')));
      check(rootStall.length > 0, 'the entry agent\'s stall watch reported the stalled stream before the idle bound (REQ-MONITOR-117/119)', rootStall.length > 0 ? `${rootStall.length} \`stall\` issue(s) for ${rootStall[0].actor ?? '?'}; first: ${String(rootStall[0].message).slice(0, 120)}` : `no \`stall\` issue among ${issues.length}`);
      /*
       * PD-MONITOR-005 revision 2 (OQ-127's ruling, 2026-10-06): the `stall` issue is written with its warning only — at
       * entry, then no more often than REQ-MONITOR-120's throttle (the threshold, or 30 s, whichever is longer). Before it,
       * one was written at every evaluation (every 5 s at 90 s), and the check above passed that too (finacc3's finding F14,
       * `docs/defects/fixed/the-faults-stall-check-does-not-assert-the-stall-issue-throttle.md`). Every agent's `stall`
       * issues are read, a stall at a time: a repeat sooner than the throttle after the one before it fails. Here the root's
       * stall should leave one, at 90 s, before the 120 s idle bound gives the call up.
       */
      const cadence = stallIssueCadence(issues);
      check(cadence.tooSoon.length === 0, 'each stall wrote its `stall` issue no more often than its throttled warning (PD-MONITOR-005 rev. 2, REQ-MONITOR-120)', cadence.tooSoon.length === 0
        ? `${cadence.stalls.length} stall(s): ${cadence.stalls.map((s) => `${s.actor} at ${s.silences.join(', ')} s`).join('; ') || 'none'}${cadence.unread.length > 0 ? `; ${cadence.unread.length} unread` : ''}`
        : `${cadence.tooSoon.length} repeat(s) sooner than the throttle; first: ${cadence.tooSoon[0].actor} at ${cadence.tooSoon[0].next} s, ${(cadence.tooSoon[0].gapMs / 1000).toFixed(1)} s after the one at ${cadence.tooSoon[0].previous} s (throttle ≥ ${cadence.tooSoon[0].throttleMs / 1000} s)`);
      noted('what the stalled run settled as', `${stallRead.session.execution_status} / ${stallRead.session.stop_reason} after ${stallRead.session.iterations_completed} iteration(s)`);
      preserveRun('faults-stall', stallRead.session.session_id);
      results.scenarios['faults-stall'] = { fired: stallFired, holdMs: HOLD_MS, status: stallRead.session.execution_status, stopReason: stallRead.session.stop_reason, issues: issues.map((issue) => ({ kind: issue.kind, severity: issue.severity, recordedAt: issue.recorded_at, message: issue.message })) };
    }
    results.scenarios['faults-stall'] ??= { fired: stallFired, holdMs: HOLD_MS, status: null, stopReason: null, issues: [] };
    await budgetGate();

    /*
     * faults-args — one tool call streamed slowly, on purpose. The duress live runs at c2fdd6a (L2) and c2a9444 (N1) found
     * a child warned "appears stalled: no model event or token for 94 seconds" while the endpoint streamed the 3,011
     * argument pieces of its 502-line `write_file` at full speed: the adapter forwarded none of the pieces, so every layer
     * above it heard silence until the call was complete
     * (`docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md`). That depended on a model choosing
     * to write a long file in a long run. Here the recording proxy holds each piece of every tool call's arguments
     * `ARGS_PACE_MS` behind the one before it (its `pace` rule), and the stall threshold is lowered to `ARGS_STALL_S` for
     * this launch alone, so a few hundred pieces stream for several thresholds. The question: was any `stall` issue
     * written while an agent streamed paced arguments (`stallsWhileStreaming`)? A window shorter than the threshold and one
     * evaluation is no evidence either way, and fails as such: the scenario must reach what it asks about.
     */
    const ARGS_STALL_S = Number(process.env['LIVE_RUN_ARGS_STALL_S'] ?? 10);
    const ARGS_PACE_MS = Number(process.env['LIVE_RUN_ARGS_PACE_MS'] ?? 120);
    const argsPrompt = 'Create a new file named PACED.md in the workspace root with one write_file call, without reading any file first: a Markdown list of the integers from 1 to 120, one per line, each followed by its English name (for example "- 7 seven"). Then reply with one sentence saying it is written.';
    const agentsBefore = readFileSync(agentsFile, 'utf8');
    const lowered = withRuntimeKey(agentsBefore, 'child_stall_timeout', ARGS_STALL_S);
    proxy.setFaults([{ kind: 'pace', every: true, delayMs: ARGS_PACE_MS }]);
    let argsRead = null;
    try {
      writeFileSync(agentsFile, lowered);
      check(lowered.includes(`child_stall_timeout: ${ARGS_STALL_S}`), 'faults-args lowered the stall threshold for its launch', `runtime.child_stall_timeout: ${ARGS_STALL_S}`);
      await launch('faults-args', {
        ROTARIS_CAPTURE_PROMPT: argsPrompt,
        ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
      }, RUN_WAIT_MS + 90_000);
      argsRead = readSession();
    } finally {
      writeFileSync(agentsFile, agentsBefore);
    }
    const argsFired = proxy.stats().faultsFired;
    const windows = pacedWindows(readTraffic('faults-args'));
    const thresholdMs = ARGS_STALL_S * 1000;
    const longest = windows[0] ?? null;
    check(longest !== null && conclusive(longest, thresholdMs), 'faults-args streamed a tool call\'s arguments for longer than the stall threshold', longest === null
      ? `no call carried a tool-call piece to pace (${argsFired.length} fired) — the scenario never reached what it asks about`
      : `longest: ${longest.events} piece(s) over ${(longest.spanMs / 1000).toFixed(1)} s against a ${ARGS_STALL_S} s threshold; ${windows.length} paced call(s)`);
    if (argsRead === null) {
      check(false, 'the faults-args run left a session row', 'no session was recorded');
    } else {
      const argsIssues = readIssues(argsRead.session.session_id);
      const during = stallsWhileStreaming(argsIssues, windows, thresholdMs);
      check(during.length === 0, 'no agent was reported stalled while it streamed a tool call\'s arguments (REQ-ORCH-089, REQ-MONITOR-119)', during.length === 0
        ? `${argsIssues.filter((issue) => issue.kind === 'stall').length} \`stall\` issue(s) in the session, none inside ${windows.length} paced window(s)`
        : during.map(({ issue, window }) => `${issue.actor}: ${String(issue.message).slice(0, 100)} at ${issue.recorded_at}, inside a ${(window.spanMs / 1000).toFixed(1)} s window of ${window.events} piece(s)`).join('; '));
      noted('what the faults-args run settled as', `${argsRead.session.execution_status} / ${argsRead.session.stop_reason}; PACED.md ${existsSync(join(workspace, 'PACED.md')) ? 'written' : 'not written'}`);
      preserveRun('faults-args', argsRead.session.session_id);
      results.scenarios['faults-args'] = { fired: argsFired.length, thresholdS: ARGS_STALL_S, paceMs: ARGS_PACE_MS, windows, stallsWhileStreaming: during.map(({ issue }) => ({ actor: issue.actor, recordedAt: issue.recorded_at, message: issue.message })), status: argsRead.session.execution_status, stopReason: argsRead.session.stop_reason };
    }
    results.scenarios['faults-args'] ??= { fired: argsFired.length, thresholdS: ARGS_STALL_S, paceMs: ARGS_PACE_MS, windows, stallsWhileStreaming: [], status: null, stopReason: null };
    proxy.setFaults([]);
    await budgetGate();
  }
}

// ── 8. The terminal under duress ─────────────────────────────────────────────────────────────────────────
/**
 * The shapes the record NAMES, replayed; never a plausible family resembling them.
 *
 * `codebase.md` states why that distinction is the whole scenario: sixty real-PTY runs at four geometries could
 * not reproduce a concatenation the live run had shown, and the trigger the sixty missed was narrow — an empty
 * write between two non-empty ones, present in both production commands and in none of the sixty. **Sixty
 * negative runs are not a negative result when none of them carries the input that failed.** So each shape below
 * is taken from a recorded defect and issued as that defect's own command, and each assertion reads `tool_calls`
 * — what the agent passed and what came back — rather than what the model said about it.
 *
 * | shape | the record it replays |
 * |---|---|
 * | `here-string`   | a multi-line command lost its newlines in the PTY, so a here-string never terminated |
 * | `long-output`   | the concatenation above, and the agent's capture VT-stripped where the window's was not |
 * | `replaces-shell` | acceptance finding A9 — `a-command-that-replaces-the-shell-reads-as-a-soft-pause.md`: `exec bash` kept the pid and never returned to the end frame, so it read as a soft pause and every later call ran under bash (POSIX only; OQ-144) |
 * | `unexpandable`  | live-run finding L1 — `a-posix-command-that-fails-to-expand-loses-its-end-marker.md`: a bash-ism dash cannot expand abandoned the wrapper's end frame, so a finished command read as a soft pause (POSIX only) |
 * | `ends-shell`    | `a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md` (OQ-144's sibling case): `exit 3` ended the shell, so no end frame printed and it read as a soft pause, and the next call ran in a fresh shell reporting `session_reinitialized` false (POSIX only) |
 * | `wedge`         | `hardMs` passed and read nowhere: a call supplying no `timeout` had the soft pause and no hard cap (REQ-TOOLS-097) |
 * | `poll`          | live-run finding L2 — `an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed.md`: an empty poll returned at once and said thirty seconds had passed |
 * | `interrupt`     | `a-poll-after-c-c-says-the-interrupted-command-is-still-running.md` (OQ-147): `C-c` with `is_input`, REQ-TOOLS-098's other advice, and the poll after it read "still running" over a process the interrupt had ended |
 * | `wedge-again`, `behind-paused` | `a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md` (live-run finding a71-8, OQ-164): a command issued while another is soft-paused waited behind it and said only its own exit, and the paused command's end was never reported |
 * | `failed-word`   | `exit-0-output-flagged-on-the-word-failed-twice.md` — PD-TOOLS-003's capitals-only marker, and a real regression guard |
 * | `diff-exit-1`   | `git-diff-with-differences-read-as-a-failure.md` — ESC-41's carve-out, and a real regression guard |
 * | `pipe-to-shell` | `a-read-only-git-pipeline-was-withheld-by-the-pipe-to-shell-rule.md` — also cost, not contradiction |
 * | `steady`        | `the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`: the silent wedge soft-pauses 70 s before REQ-CONFIG-116's 100 s cap, so the default-path hard cap (`hardMs`) is asked by a command that prints every 2 s for 130 s |
 *
 * **A shape the model never attempted is a NOTE, not a failure, and so is a shape whose every send the tool gate refused
 * before it ran** ("not reached", naming each refusal: `GATE_REFUSALS` and `reachedShape` in `lib/terminal-shapes.mjs`, which
 * hold every refusal `gate.ts` settles before a call runs). `pipe-to-shell` is a cost observation whose
 * behaviour is faithful to a requirement, and reporting it as a fault would train a reader to ignore this
 * scenario — the mistake the board scenario made twice. `here-string`, `long-output`, the wedge's bound, `steady`'s
 * hard cap, `failed-word`, `diff-exit-1` and the marker leak are asserted as product facts.
 */
if (wanted.includes('terminal')) {
  /*
   * The shapes, their patterns and the readers live in `lib/terminal-shapes.mjs` and are pinned by
   * `terminal-shapes.test.ts` — a pattern that stopped matching its own command would turn every check below
   * into "the model never attempted it", which is a green run and a question nobody is told has stopped being
   * asked. Per platform, because a here-string and a pipe-into-a-shell are written differently and a scenario
   * that is a no-op off win32 would report green for having asked nothing.
   */
  const SHAPES = terminalShapes();
  const PROMPT = [
    'Run each of the following in the terminal, exactly as written, one call per command, in this order.',
    'Do not rewrite them, do not split them, do not add a timeout argument, and do not skip one because you',
    'expect it to fail — a failure is the answer for some of them. Report what each did in one line.',
    '',
    ...SHAPES.map((shape, i) => `${i + 1}. ${shape.prompt ?? shape.command}`),
  ].join('\n');
  // The `steady` shape runs until the default hard cap ends it, 100 s by design (REQ-CONFIG-116), so the run's wait carries
  // the shape's own length on top of the scenarios' common one: twice since fin46 (L7), with one follow-up turn, because the
  // coordinator_only root delegates the shapes and may have its child run that shape again (`terminalWaitMs`).
  const TERMINAL_WAIT_MS = terminalWaitMs(RUN_WAIT_MS);
  const log = await launch('terminal', {
    ROTARIS_CAPTURE_PROMPT: PROMPT,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(TERMINAL_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000', ROTARIS_CAPTURE_PROBE: DURATION_PROBES.join(';;'),
  }, TERMINAL_WAIT_MS + 120_000);
  check(!/capture: wait for result timed out/.test(log), 'the terminal run reached its result inside the wait');
  const read = readSession();
  checkPricing('terminal', read?.session);
  checkRunDuration('terminal', log);
  const calls = read === null ? [] : readToolCalls(read.session.session_id);
  const terminals = calls.filter((call) => call.tool_name === 'terminal');
  const shapeOf = (id) => SHAPES.find((shape) => shape.id === id);
  // Every reading below takes the first send that REACHED execution (`shapeSends`, `reachedShape`): a send the tool gate refused
  // before it ran (REQ-ORCH-029's todo gate, the schema check, or any other `GATE_REFUSALS`) carries the refusal's text, not the shape's answer, and the confirming
  // run at 0bc3eee failed "all 40 lines" on exactly that while the same command, sent again, had returned all 40. A
  // permission block is a reached send (`pipe-to-shell` is measured by it). `ran` is the same filter over every call, for
  // the finds that follow a shape rather than match one (the poll, the interrupt, the next command after `exit 3`).
  const sendsOf = (id) => shapeSends(shapeOf(id), terminals);
  const attempted = (id) => sendsOf(id).reached;
  const ran = terminals.filter(reachedShape);
  // A shape no reached send carried: "not attempted" where none was sent, "not reached" where the gate refused every send.
  const unread = (id, title, detail, unasked) => {
    const { refused } = sendsOf(id);
    if (refused.length === 0) noted(title, detail);
    else { const note = notReachedNote(id, refused, unasked); noted(note.title, note.detail); }
  };
  // Reaching a result is not reaching the terminal: a run that ended `failed` before any terminal call asked none of the
  // questions below, and each would read as a NOTE over a green run (`terminalRunEndReading`).
  const runEnd = terminalRunEndReading(read?.session ?? null, terminals.length);
  check(runEnd.kind === 'ended' || runEnd.kind === 'failed-later' || runEnd.kind === 'ended-early', 'the terminal run did not end failed before any terminal call', runEnd.detail);
  if (runEnd.kind === 'failed-later') noted('the terminal run ended failed after reaching the terminal', `${runEnd.detail}; the shapes it did not reach read as not attempted`);
  if (runEnd.kind === 'ended-early') noted('the terminal run ended before any terminal call', `${runEnd.detail}; every shape reads as not attempted`);
  const seen = {};
  for (const shape of SHAPES) seen[shape.id] = attempted(shape.id).length;
  // Live-run finding P6 at a68f121: the counts are over every terminal call the session holds, so a shape a later iteration's
  // agent ran again counts twice; the NOTE read "×2" as if the model had tried one shape twice in one pass. It says what it
  // counted, and by which agents when more than one ran the shapes.
  const byAgent = new Map();
  for (const call of ran) if (SHAPES.some((shape) => shape.match.test(String(call.args.command ?? '')))) byAgent.set(call.agent_name, (byAgent.get(call.agent_name) ?? 0) + 1);
  // A send the gate refused before it ran is counted beside the shape, never as a try (`attemptCount`).
  noted('what the model attempted', `${SHAPES.map((s) => attemptCount(s.id, sendsOf(s.id))).join(', ')} — counted over every terminal call the session holds, every iteration and agent included, so a count above 1 can be a later iteration's or another agent's repeat rather than a retry${byAgent.size > 1 ? `; the shapes' calls by agent: ${[...byAgent].map(([agent, n]) => `${agent} ${n}`).join(', ')}` : ''}`);

  const hereString = attempted('here-string')[0];
  if (hereString === undefined) unread('here-string', 'the here-string was not attempted', 'no terminal call carried it; nothing is asserted about the PTY', 'nothing is asserted about the PTY');
  else {
    const d = diagnosticOf(hereString.result);
    // The defect's signature is the here-string never terminating: newlines lost, so the shell waits for a
    // delimiter that never comes and the call dies on its timeout rather than on its own last line.
    check(String(hereString.args.command ?? '').includes('\n'), 'the multi-line command reached the tool with its newlines', `${String(hereString.args.command ?? '').split('\n').length} line(s) in args.command`);
    check(d?.timeout !== true && d?.exit_code === 0, 'the here-string terminated rather than hanging on a lost delimiter', `exit ${d?.exit_code ?? 'none'}${d?.timeout ? ', timed out' : ''}`);
    // Read from the OUTPUT section alone (`hereStringLinesReturned`): the diagnostic repeats the command, which carries
    // both words, so the whole result matched whether or not the shell printed anything — the 2026-09-22 pass was not
    // evidence (`docs/defects/fixed/the-here-string-check-reads-its-own-command-back.md`).
    const printedLines = outputOf(hereString.result) ?? '';
    check(hereStringLinesReturned(hereString.result), 'both lines of the here-string came back, in the output the shell printed', `alpha-one ${/alpha-one/.test(printedLines) ? 'present' : 'absent'}, beta-two ${/beta-two/.test(printedLines) ? 'present' : 'absent'} in the output section`);
  }

  const longOutput = attempted('long-output')[0];
  if (longOutput === undefined) unread('long-output', 'the long-output command was not attempted', 'no terminal call carried it; the concatenation and VT questions are unasked', 'the concatenation and VT questions are unasked');
  else {
    const reading = longOutputReading(longOutput.result);
    check(reading.distinct === LONG_OUTPUT_LINES, `all ${LONG_OUTPUT_LINES} lines of output reached the agent`, `${reading.distinct} distinct of ${reading.markers.length} marker(s)`);
    // The concatenation the sixty runs could not reproduce is visible here as two markers sharing one line.
    check(reading.doubled.length === 0, 'no two output lines were concatenated into one', reading.doubled.length === 0 ? 'every marker on its own line' : `${reading.doubled.length} line(s), e.g. ${reading.doubled[0].slice(0, 120)}`);
    // The agent's capture and the terminal window's are meant to be the same rendering of the same bytes: the
    // strip landed for the live stream and the agent's capture was left behind, so the two diverged.
    check(!reading.escaped, 'the agent read a VT-stripped capture', reading.escaped ? 'an escape sequence survived into the recorded result' : 'no escape sequence in the recorded result');
  }

  // Live-run finding M1: a command past the PTY's input line reaches the shell whole and ends on its own status, never a
  // soft pause with only the continuation prompt. POSIX only (`terminalShapes`); on Windows nothing is asked. Credited only
  // where the command the model SENT was past the line (`longCommandReading`): a shorter copy may have fit, and is a NOTE.
  if (shapeOf('long-command') !== undefined) {
    const long = attempted('long-command')[0];
    if (long === undefined) unread('long-command', 'the long command was not attempted', 'no terminal call carried it; the PTY\'s input line is unasked', 'the PTY\'s input line is unasked');
    else {
      const elapsed = long.elapsedMs ?? NaN;
      const reading = longCommandReading(long.args.command, long.result, elapsed);
      const d = diagnosticOf(long.result);
      const said = `${reading.bytes} bytes sent, outcome ${d?.outcome_kind ?? 'none'}, exit ${d?.exit_code ?? 'none'}, ${Number.isFinite(elapsed) ? Math.round(elapsed) : '?'} ms, printed ${JSON.stringify(reading.printed.slice(0, 60))}, expected ${reading.expected ?? 'none'}`;
      if (reading.kind === 'short') noted('the long command was sent shorter than the PTY\'s input line', `${said}; under ${PTY_INPUT_LINE_BYTES} bytes the line may have fit, so the carrier is unasked`);
      else {
        check(reading.kind !== 'paused', 'a command longer than the PTY\'s input line did not read as a soft pause (live-run M1)', said);
        check(reading.kind === 'whole', 'it reached the shell whole: exit 0 and the here-document\'s own byte count', said);
      }
    }
  }

  // Acceptance A9 (OQ-144): a command that replaces the session's shell ends at once as an execution_error, and the session
  // is restarted on its own shell. POSIX only (`terminalShapes`); on Windows nothing is asked: not applicable, not a NOTE.
  const replaced = shapeOf('replaces-shell') === undefined ? undefined : attempted('replaces-shell')[0];
  const replacedReading = replaced === undefined ? null : replacedShellReading(replaced.result, replaced.elapsedMs ?? NaN);
  if (shapeOf('replaces-shell') !== undefined) {
    if (replaced === undefined) unread('replaces-shell', 'the shell replacement was not attempted', 'no terminal call carried `exec bash`; the watch is unasked', 'the watch is unasked');
    else {
      const d = diagnosticOf(replaced.result);
      const elapsed = replaced.elapsedMs ?? NaN;
      const said = `outcome ${d?.outcome_kind ?? 'none'}, exit ${d?.exit_code ?? 'none'}, ${Number.isFinite(elapsed) ? Math.round(elapsed) : '?'} ms`;
      if (replacedReading.kind === 'not-replaced') noted('`exec bash` replaced nothing', `the watch is unasked this run: ${said}`);
      else {
        check(replacedReading.kind !== 'paused', 'a command that replaced the shell did not read as a soft pause', said);
        check(replacedReading.kind === 'restarted', 'it ended at once as an execution_error that says the shell was replaced', said);
        if (replacedReading.kind === 'restarted') check(replacedReading.killStatus === 'session_reset', 'the session was restarted on its own shell', `kill_status ${replacedReading.killStatus ?? 'none'}`);
      }
    }
  }

  // Live-run L1: the command ends at once with the shell's own error status, never a soft pause after the window. The
  // shape exists only off win32 (`terminalShapes`), so on Windows nothing is asked here: not applicable, not a NOTE.
  // The guard is credited only where a shell refused the expansion (`unexpandableReading`). Until the verifier's second
  // round the three checks ran on any result, and a line bash had expanded (the model had run `exec bash` first) passed
  // all three with the guard never asked.
  if (shapeOf('unexpandable') !== undefined) {
    const unexpandable = attempted('unexpandable')[0];
    if (unexpandable === undefined) unread('unexpandable', 'the unexpandable bash-ism was not attempted', 'no terminal call carried it; the wrapper\'s guard is unasked', 'the wrapper\'s guard is unasked');
    else {
      const d = diagnosticOf(unexpandable.result);
      const elapsed = unexpandable.elapsedMs ?? NaN;
      const reading = unexpandableReading(unexpandable.result, elapsed);
      const said = `outcome ${d?.outcome_kind ?? 'none'}, exit ${d?.exit_code ?? 'none'}, output ${JSON.stringify(reading.printed.slice(0, 120))}`;
      // Acceptance A9: after a replacement the product restarted, the next command meets `/bin/sh` again. Where that is
      // dash, a bash-ism expanded after it means the session stayed in bash — the verifier's live run of 2026-09-29.
      // Only the SAME agent's next command asks it: each agent has its own foreground session (REQ-TOOLS-187), so a
      // bash-ism another agent ran met a shell nothing had replaced, and the pack of 2026-09-30T16-57 passed this check
      // with no restart observed (acceptance round 1's second verifier). Another agent's command is a NOTE.
      const followed = replacedReading?.kind === 'restarted' && replaced.ordinal < unexpandable.ordinal && !/bash$/.test(realpathSync('/bin/sh'));
      if (followed && replaced.agent_name === unexpandable.agent_name) check(reading.kind !== 'expanded', 'the command after the shell was replaced ran in /bin/sh, not in the program that replaced it', said);
      else if (followed) noted('the restart was not observed by a later command', `\`exec bash\` ran in ${replaced.agent_name} and the bash-ism in ${unexpandable.agent_name}, whose foreground session is its own (REQ-TOOLS-187)`);
      if (reading.kind === 'expanded') noted('the shell expanded the bash-ism', `the guard is unasked this run: ${said}`);
      else if (reading.kind === 'other') noted('the bash-ism met neither a refusal nor an expansion', `the guard is unasked this run: ${said}`);
      else {
        check(reading.kind === 'refused', 'the shell refused to expand the line, and the call ended with its nonzero status', said);
        check(d?.outcome_kind !== 'soft_pause' && d?.exit_code !== -1, 'a command sh could not expand ended with its own status, not a soft pause', `outcome ${d?.outcome_kind ?? 'none'}, exit ${d?.exit_code ?? 'none'}`);
        check(Number.isFinite(elapsed) && elapsed < 30_000, 'it ended inside the no-output window rather than after it', `${Number.isFinite(elapsed) ? Math.round(elapsed) : '?'} ms`);
        check(/\bran\b/.test(reading.printed), 'what the line printed before its error came back', `output ${JSON.stringify(reading.printed.slice(0, 120))}`);
      }
    }
  }

  // OQ-144's sibling case: a command that ends the session's shell ends at once as an execution_error, the shell is
  // respawned, and the same agent's next call says the session was reinitialized. POSIX only (`terminalShapes`).
  if (shapeOf('ends-shell') !== undefined) {
    const ended = attempted('ends-shell')[0];
    if (ended === undefined) unread('ends-shell', 'the shell exit was not attempted', 'no terminal call carried `exit 3`; the exit watch is unasked', 'the exit watch is unasked');
    else {
      const d = diagnosticOf(ended.result);
      const elapsed = ended.elapsedMs ?? NaN;
      const reading = endedShellReading(ended.result, elapsed);
      const said = `outcome ${d?.outcome_kind ?? 'none'}, exit ${d?.exit_code ?? 'none'}, ${Number.isFinite(elapsed) ? Math.round(elapsed) : '?'} ms`;
      if (reading.kind === 'other') noted('`exit 3` met neither a respawn nor a pause', said);
      else {
        check(reading.kind !== 'paused', 'a command that ended the shell did not read as a soft pause', said);
        // The exiting shell's `/proc` entry once read as another program's, and the call was told it replaced the shell.
        check(reading.kind !== 'replaced', 'a command that ended the shell did not read as replacing it (OQ-144)', said);
        check(reading.kind === 'restarted', 'it ended at once as an execution_error that says the shell ended', said);
        if (reading.kind === 'restarted') {
          check(reading.killStatus === 'session_reset', 'the shell was respawned', `kill_status ${reading.killStatus ?? 'none'}`);
          // Only the SAME agent's next call ran in the respawned shell: each agent's foreground session is its own (REQ-TOOLS-187).
          const next = ran.find((call) => call.ordinal > ended.ordinal && call.agent_name === ended.agent_name && call.args.is_input !== true && call.args.background !== true && call.args.session_action === undefined && String(call.args.command ?? '') !== '');
          if (next === undefined) noted('no later command of the same agent followed the shell exit', 'what the next call reports is unasked');
          else check(diagnosticOf(next.result)?.session_reinitialized === true, 'the next command the same agent issued reported the session reinitialized', `ordinal ${next.ordinal}: session_reinitialized ${String(diagnosticOf(next.result)?.session_reinitialized ?? 'absent')}`);
        }
      }
    }
  }

  const wedge = attempted('wedge')[0];
  if (wedge === undefined) unread('wedge', 'the wedge was not attempted', 'no terminal call carried it; the hard cap is unasked', 'the hard cap is unasked');
  else {
    const d = diagnosticOf(wedge.result);
    check(wedge.args.timeout === undefined, 'the wedge was issued with no timeout argument, as asked', `timeout ${wedge.args.timeout ?? 'absent'}`);
    // REQ-TOOLS-097 wants BOTH bounds with the first to fire governing. The defect was a call with neither a
    // caller timeout nor a hard cap; either a soft pause or a hard timeout is a bound, and no bound is the fault.
    const bounded = d?.timeout === true || /still running|Poll by calling|No output for/.test(wedge.result);
    check(bounded, 'a call supplying no timeout was still bounded', d?.timeout === true ? `hard timeout at ${d.timeout_seconds}s` : bounded ? 'soft pause' : 'neither bound fired');
    if (d?.timeout === true) {
      check(Number.isFinite(d.timeout_seconds), 'the hard cap named its own bound', `timeout_seconds ${d.timeout_seconds}`);
      // PD-TOOLS-001: the reset must say what it lost AND what it put back, never be silent about the shell.
      check(/restored|failed|no earlier shell state/.test(wedge.result), 'the reset reported what it restored', 'the detail names the shell state');
    } else noted('the wedge soft-paused, as a silent command must', 'it prints nothing, so the 30 s no-output window ends it 70 s before the hard cap; the cap is read from the `steady` shape below');
  }

  // REQ-TOOLS-097's default-path hard cap (`hardMs` = REQ-CONFIG-116's `runtime.shell_command_timeout`, 100 s unset): a call
  // that names no `timeout` and keeps printing is ended by the cap, never by the soft pause (it is never quiet for the window)
  // and never by its own end (130 s). The silent wedge above could never ask it
  // (`docs/defects/fixed/the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`).
  const steady = attempted('steady')[0];
  if (steady === undefined) unread('steady', 'the steady printer was not attempted', 'no terminal call carried it; the default hard cap is unasked', 'the default hard cap is unasked');
  else {
    const cap = hardCapReading(steady, { capSeconds: DEFAULT_SHELL_COMMAND_TIMEOUT_S });
    const said = `${cap.kind}: timeout_seconds ${cap.timeoutSeconds ?? 'none'}, exit ${cap.exit ?? 'none'}, kill_status ${cap.killStatus ?? 'none'}, ${cap.ticks} tick line(s), ${cap.elapsedMs === null ? '?' : Math.round(cap.elapsedMs)} ms`;
    if (cap.kind === 'supplied') noted('the steady printer was issued with a timeout of its own', `timeout ${steady.args.timeout}: the caller's bound governs and turns the soft pause off, so hardMs is unasked (${said})`);
    else if (cap.kind === 'other') noted('the steady printer met neither a bound nor its own end past the cap', said);
    else {
      check(cap.kind === 'capped', `a call supplying no timeout that kept printing was ended by the ${DEFAULT_SHELL_COMMAND_TIMEOUT_S} s default hard cap, not by the soft pause or its own end (REQ-TOOLS-097, REQ-CONFIG-116)`, said);
      if (cap.kind === 'capped') {
        check(cap.elapsedMs !== null && cap.elapsedMs >= DEFAULT_SHELL_COMMAND_TIMEOUT_S * 1000 && cap.elapsedMs < (DEFAULT_SHELL_COMMAND_TIMEOUT_S + 30) * 1000, 'the cap ended it when the cap was reached', said);
        check(cap.killStatus === 'session_reset', 'the cap reset the session to end the process tree', said);
        check(cap.ticks > 0, 'what it printed before the cap came back with the timeout', said);
        // PD-TOOLS-001: the reset must say what it lost AND what it put back, never be silent about the shell.
        check(/restored|failed|no earlier shell state/.test(steady.result), 'the reset reported what it restored', 'the detail names the shell state');
      }
    }
  }

  // Live-run L2: the first poll after the wedge. What it says it waited must be no more than the time between the wedge's
  // end and its own, both as the product recorded them; the no-output window it never waited out must not be claimed.
  const poll = wedge === undefined ? undefined
    : ran.find((call) => call.ordinal > wedge.ordinal && String(call.args.command ?? '') === '' && call.args.is_input !== true && call.args.session_action === undefined && call.args.background !== true);
  // A poll the gate refused before it ran polled nothing: the poll that followed it, if any, is the one read above.
  const pollRefused = wedge === undefined ? [] : terminals.filter((call) => call.ordinal > wedge.ordinal && (poll === undefined || call.ordinal < poll.ordinal) && !reachedShape(call) && String(call.args.command ?? '') === '' && call.args.is_input !== true && call.args.session_action === undefined && call.args.background !== true);
  if (poll === undefined && pollRefused.length > 0) { const note = notReachedNote('poll', pollRefused, 'what a poll states is unasked'); noted(note.title, note.detail); }
  else if (poll === undefined) noted('no poll followed the wedge', 'no empty-command call after it; what a poll states is unasked');
  else {
    const d = diagnosticOf(poll.result);
    const since = /No new output in (under 0\.1|\d+\.\d) seconds since the previous observation/.exec(poll.result);
    const gapMs = poll.endedAt !== null && wedge.endedAt !== null ? poll.endedAt - wedge.endedAt : null;
    if (d?.outcome_kind !== 'soft_pause' || (outputOf(poll.result) ?? '').trim() !== '(no output)') noted('the poll did not find the wedge silent', `outcome ${d?.outcome_kind ?? 'none'}; what an empty poll states is unasked`);
    else {
      check(!/No output for 30 seconds/.test(poll.result), 'an empty poll did not claim the no-output window it never waited out', /No output for 30 seconds/.test(poll.result) ? 'it said "No output for 30 seconds"' : 'no window claimed');
      const claimed = since === null ? null : since[1] === 'under 0.1' ? 0 : Number(since[1]) * 1000;
      check(claimed !== null && gapMs !== null && claimed <= gapMs + 100, 'what the poll said it waited is no more than the time that passed', `stated ${since?.[1] ?? 'nothing'} s, ${gapMs === null ? '?' : Math.round(gapMs)} ms between the wedge's end and the poll's`);
    }
  }

  // OQ-147: the interrupt and the first poll after it. The poll must hand the interrupted wedge over as ended — exit −1,
  // an execution_error saying it ended without a status of its own — and never as still running.
  const interrupt = wedge === undefined ? undefined
    : ran.find((call) => call.ordinal > wedge.ordinal && call.args.is_input === true && shapeOf('interrupt').match.test(String(call.args.command ?? '')));
  const interruptPoll = interrupt === undefined ? undefined
    : ran.find((call) => call.ordinal > interrupt.ordinal && String(call.args.command ?? '') === '' && call.args.is_input !== true && call.args.session_action === undefined && call.args.background !== true);
  const interruptRefused = wedge === undefined ? [] : terminals.filter((call) => call.ordinal > wedge.ordinal && (interrupt === undefined || call.ordinal < interrupt.ordinal) && !reachedShape(call) && call.args.is_input === true && shapeOf('interrupt').match.test(String(call.args.command ?? '')));
  if (interrupt === undefined && interruptRefused.length > 0) { const note = notReachedNote('interrupt', interruptRefused, 'what a poll after it reads is unasked'); noted(note.title, note.detail); }
  else if (interrupt === undefined) noted('the interrupt was not attempted', 'no C-c with is_input followed the wedge; what a poll after it reads is unasked');
  else if (interruptPoll === undefined) noted('no poll followed the interrupt', 'no empty-command call after the C-c; what it reads is unasked');
  else {
    const reading = interruptedPollReading(interruptPoll.result);
    const said = `outcome ${reading.outcome ?? 'none'}, exit ${reading.exit ?? 'none'}, ${interruptPoll.endedAt !== null && interrupt.endedAt !== null ? Math.round(interruptPoll.endedAt - interrupt.endedAt) : '?'} ms after the interrupt`;
    if (reading.kind === 'ended-own') noted('the wedge had ended before the interrupt', `the interrupt reached nothing still running: ${said}`);
    else if (reading.kind === 'other') noted('the poll after the interrupt met neither an end nor a pause', said);
    else {
      check(reading.kind !== 'still-running', 'a poll after C-c did not read the interrupted command as still running', said);
      check(reading.kind === 'ended', 'it handed the command over as ended without an exit status of its own (OQ-147)', said);
    }
  }

  // OQ-164: the command issued while `wedge-again` was soft-paused reports the paused command's end — never the autopsy's
  // silence. Only when the second wedge did soft-pause first and the same agent issued the command behind it.
  const again = attempted('wedge-again')[0];
  const behindPaused = attempted('behind-paused')[0];
  // One of the pair not reached names its refusals, and the other beside it if it was never sent (`pairNotReachedNote`, N92).
  const pairNote = pairNotReachedNote(['wedge-again', 'behind-paused'].map((id) => [id, sendsOf(id)]), 'OQ-164\'s report is unasked');
  if ((again === undefined || behindPaused === undefined) && pairNote !== null) noted(pairNote.title, pairNote.detail);
  else if (again === undefined || behindPaused === undefined) noted('the command behind a soft-paused one was not attempted', `wedge-again×${seen['wedge-again']}, behind-paused×${seen['behind-paused']}; OQ-164's report is unasked`);
  else if (diagnosticOf(again.result)?.outcome_kind !== 'soft_pause') noted('the second wedge did not soft-pause', `outcome ${diagnosticOf(again.result)?.outcome_kind ?? 'none'}; nothing was paused when the next command came`);
  else if (again.agent_name !== behindPaused.agent_name || behindPaused.ordinal < again.ordinal) noted('the command behind the second wedge ran elsewhere', `wedge-again in ${again.agent_name}, behind-paused in ${behindPaused.agent_name}; each agent's foreground session is its own (REQ-TOOLS-187)`);
  else {
    const reading = pausedBehindReading(behindPaused.result);
    const said = `${reading.kind}, ${String(diagnosticOf(behindPaused.result)?.detail ?? '').slice(0, 240)}`;
    if (reading.kind === 'still-running') noted('the command behind the second wedge soft-paused in turn', said);
    else if (reading.kind === 'other') noted('the command behind the second wedge carried no diagnostic', said);
    else {
      check(reading.kind !== 'silent', 'a command issued behind a soft-paused one did not leave the paused command\'s end unreported (OQ-164)', said);
      check(reading.kind === 'reported', 'its observation named the paused command and how it ended', said);
      if (reading.kind === 'reported') check(/slept/.test(String(behindPaused.result)), 'what the paused command wrote came with its end', /slept/.test(String(behindPaused.result)) ? '`slept` present' : '`slept` absent');
    }
  }

  const failedWord = attempted('failed-word')[0];
  if (failedWord === undefined) unread('failed-word', 'the docker line was not attempted', 'no terminal call carried it; PD-TOOLS-003 is unasked', 'PD-TOOLS-003 is unasked');
  else {
    const d = diagnosticOf(failedWord.result);
    // PD-TOOLS-003: REQ-TOOLS-113's `FAILED ` marker matches in capitals only. This is the lower-case docker line
    // that warned in run `2e21e324` and cost the agent a second pass to explain it away — a real regression guard,
    // not a cost note. Its positive half reads the output alone: the diagnostic repeats the command, and with the
    // line absent from the output, "no marker warning" would pass for nothing.
    const printed = /failed to connect to the docker API/.test(outputOf(failedWord.result) ?? '');
    check(d?.exit_code === 0 && printed, 'the docker line was printed and exited 0, as the shape needs', `exit ${d?.exit_code ?? 'none'}, line ${printed ? 'present' : 'absent'} in the output`);
    if (d?.exit_code === 0 && printed) {
      const warnings = d.warnings ?? [];
      check(d.outcome_kind !== 'suspicious_success', 'a lower-case failed at exit 0 was not classified suspicious_success', `outcome ${d.outcome_kind ?? 'none'}`);
      check(!warnings.some((w) => /failure marker/.test(w)), 'no failure-marker warning on the lower-case line', `warnings: ${warnings.join(' ') || 'none'}`);
    }
  }

  const diffExitOne = attempted('diff-exit-1')[0];
  if (diffExitOne === undefined) unread('diff-exit-1', 'the git diff was not attempted', 'no terminal call carried it; ESC-41 is unasked', 'ESC-41 is unasked');
  else {
    const d = diagnosticOf(diffExitOne.result);
    // ESC-41's carve-out: `git diff` exiting 1 IS the answer, and classifying it a failure made the agent
    // explain away its own evidence. A real regression guard, not a cost note.
    check(d?.exit_code === 1, 'the git diff found differences and exited 1, as the shape needs', `exit ${d?.exit_code ?? 'none'}`);
    if (d?.exit_code === 1) check(d?.outcome_kind !== 'shell_failure', 'exit 1 from git diff was not classified a shell failure', `outcome ${d?.outcome_kind ?? 'none'}`);
  }

  const piped = attempted('pipe-to-shell')[0];
  if (piped === undefined) unread('pipe-to-shell', 'the piped git pipeline was not attempted', 'no terminal call carried it', 'the pipe-to-shell rule is unasked');
  else noted('a read-only git pipeline through a pipe', `${piped.status}${/pipe to shell/i.test(piped.result) ? ' by starter:deny-pipe-to-shell' : ''} — REQ-TOOLS-036/038 firing as specified; recorded for cost`);

  // The end marker is the harness the terminal uses to find where a command finished; the model must never
  // read it. Detection matched it unanchored while removal matched it anchored, and it leaked verbatim.
  const leaked = terminals.filter((call) => /__rot_/.test(call.result));
  check(leaked.length === 0, 'no end marker leaked into what the model read', leaked.length === 0 ? 'no __rot_ in any terminal result' : `${leaked.length} call(s), e.g. ordinal ${leaked[0].ordinal}`);

  results.scenarios.terminal = {
    platform: process.platform, status: read?.session.execution_status, stopReason: read?.session.stop_reason,
    attempted: seen, terminalCalls: terminals.length,
    // `attempted` names the call each shape was read from, which is one that reached execution; `refusedAtGate` lists the
    // ordinals of the sends the gate refused before they ran (`shapeSends`), so a shape read as not attempted is told
    // apart from one the gate kept from running.
    diagnostics: SHAPES.map((shape) => {
      const call = shape.id === 'poll' ? poll : shape.id === 'interrupt' ? interruptPoll : attempted(shape.id)[0];
      const refusedAtGate = (shape.id === 'poll' ? pollRefused : shape.id === 'interrupt' ? interruptRefused : sendsOf(shape.id).refused).map((refused) => refused.ordinal);
      return { id: shape.id, command: shape.command, refusedAtGate, ...(call === undefined ? { attempted: false } : { attempted: true, ordinal: call.ordinal, status: call.status, diagnostic: diagnosticOf(call.result) }) };
    }),
  };
  if (read) preserveRun('terminal', read.session.session_id);
  await budgetGate();
}

// ── 8b. At a permission mode that asks ───────────────────────────────────────────────────────────────────
// `lib/approval-scenarios.mjs` holds each scenario; the script hands it what it owns.
const approvalContext = () => ({ launch, check, noted, readSession, readSessionLog, oneDatabase, preserveRun, budgetGate, withRuntimeKey, agentsFile, workspace, scenarioDir, results, RUN_WAIT_MS });
if (wanted.includes('away')) await runAwayScenario(approvalContext());
if (wanted.includes('approvals')) await runApprovalsScenario(approvalContext());
if (wanted.includes('plan-gate')) await runPlanGateScenario(approvalContext());

// ── 8g. A call cut in flight ───────────────────────────────────────────────────────────────────────────────
// PD-TOOLS-013 (N51): `lib/cut-scenario.mjs` quits the launch it is handed (`inFlight`) once the sleep's record is open.
if (wanted.includes('cut')) await runCutScenario({ ...approvalContext(), inFlight: () => launchInFlight });

// ── 8h. The edit directives on a CRLF file ─────────────────────────────────────────────────────────────────
// PD-TOOLS-014 to PD-TOOLS-018 (N52): `lib/crlf-scenario.mjs` generates the fixture into the sandbox and removes it after.
if (wanted.includes('crlf')) await runCrlfScenario(approvalContext());

// ── 8e. A child cut off at the Per-agent timeout a person set ───────────────────────────────────────────────
/**
 * OPT-IN (`--only=cutoff`), a few minutes: the one path no live run had reached since the fin32 and fin33 repairs, a child cut
 * off at its per-agent timeout (the 2026-10-13 survey's N50; the 552d346 duress pack cut no child off at 2,700 s). Three
 * launches, the limit set the way a person sets it:
 *
 *   1. `cutoff-settings` — Settings › Runtime › Per-agent timeout set to `LIVE_RUN_CUTOFF_MIN` (default 1) minute(s) and
 *      saved through the save bar (`lib/settings-runtime-field.mjs`), never written into the file by the harness;
 *   2. `cutoff`          — one delegated child given more work than the limit allows; the Workspace sidebar's timed-out tag
 *      read as it appears;
 *   3. `cutoff-continue` — the session reopened from the Sessions browser and a follow-up that asks for the offer to be taken.
 *
 * Asserted (each from the store, the recorded traffic or the screen, never from the model's prose): the limit Settings saved
 * is the one the run read; a child cut off at it ends `failed` with "Child timed out after <N>s", PD-ORCH-004's statement and
 * its offer; the tag's line is PD-CONFIG-003's minutes form (revisions 3 and 4, CN1); OQ-217 as repaired for D9 — the
 * summarising request's facts open "Outcome of this agent, not of the session: failed — Child timed out after <N>s.", the
 * stored summary's first sentence states the limit and never opens "The run failed", and no `child_result` entry of a session
 * that completed relays "The run failed". A child the limit never reached, or an offer the follow-up's root did not take, is a
 * NOTE: the model's pace and its choice, not the product's. The workspace's `agents.yaml` is restored afterwards, so a scenario
 * after this one runs under the product's 1200 s (`lib/cut-off-reading.mjs`).
 */
const CUTOFF_MIN = Number(process.env['LIVE_RUN_CUTOFF_MIN'] ?? 1);
if (wanted.includes('cutoff') && !(Number.isInteger(CUTOFF_MIN) && CUTOFF_MIN >= 1 && CUTOFF_MIN <= 240)) {
  throw new Error(`LIVE_RUN_CUTOFF_MIN must be whole minutes from 1 to 240, the Per-agent timeout control's range (PD-CONFIG-003); got ${JSON.stringify(process.env['LIVE_RUN_CUTOFF_MIN'])}`);
}
if (wanted.includes('cutoff')) {
  const limitS = CUTOFF_MIN * 60;
  const agentsBeforeCutoff = readFileSync(agentsFile, 'utf8');
  const PROMPT = [
    'Delegate exactly one task to a single child and wait for it to end; do not do the work yourself and do not delegate',
    'anything else. The child\'s task: for every file under src/ and test/ in this repository, one file at a time, read the',
    'file, then add to docs/walkthrough.md a section naming the file and explaining each function in it line by line with an',
    'example call, and after every file run `node --test` in the terminal and record its result in that section. It must not',
    'stop before every file has its section. When the child has ended, reply with one sentence saying how it ended.',
  ].join('\n');
  const Database = require('better-sqlite3');
  const readCut = (sessionId) => {
    const db = new Database(oneDatabase(), { readonly: true });
    try {
      const children = db.prepare('SELECT task_id, canonical_name, state, parent_id, continuation_of, report FROM children WHERE session_id = ? ORDER BY spawned_at').all(sessionId);
      const timeline = db.prepare('SELECT name, message FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sessionId);
      const ids = new Set(children.map((c) => c.task_id));
      const roots = [...new Set(db.prepare('SELECT task_id FROM agent_messages WHERE session_id = ? ORDER BY seq').all(sessionId).map((r) => r.task_id))].filter((id) => !ids.has(id));
      return { children, timeline, roots };
    } finally { db.close(); }
  };
  let cutoffRecord = { limitS };
  try {
    // 1. The limit, through the control.
    const setLog = await launch('cutoff-settings', runtimeFieldSteps({ id: 'child-timeout', value: CUTOFF_MIN }), 90_000);
    const saved = fieldSaveReading(setLog, { id: 'child-timeout' });
    const yaml = readFileSync(agentsFile, 'utf8');
    cpSync(agentsFile, join(scenarioDir('cutoff-settings'), 'agents.yaml'));
    check(saved.afterEdit === 'Unsaved changes' && saved.atEnd === 'All changes saved' && saved.field === String(CUTOFF_MIN), `Settings › Runtime › Per-agent timeout took ${CUTOFF_MIN} and Save stored it (PD-CONFIG-003)`, JSON.stringify(saved));
    check(new RegExp(`^\\s+child_timeout: ${limitS}\\s*$`, 'm').test(yaml), `the control's Save wrote child_timeout: ${limitS} into the workspace file`, /^\s+child_timeout:.*$/m.exec(yaml)?.[0]?.trim() ?? 'no child_timeout line');
    cutoffRecord = { ...cutoffRecord, control: saved };

    // 2. The run that meets it.
    const log = await launch('cutoff', {
      ROTARIS_CAPTURE_PROMPT: PROMPT,
      ROTARIS_CAPTURE_EVAL_AT: `${TAG_EVAL}>>${TAG_SELECTOR}@~${RUN_WAIT_MS}`,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
    }, RUN_WAIT_MS + 90_000);
    check(log.includes(`child_timeout=${limitS} s`), 'the run read the Per-agent timeout Settings saved', /child_timeout=\d+ s/.exec(log)?.[0] ?? 'no child_timeout line');
    const read = readSession();
    checkPricing('cutoff', read?.session);
    if (read === null) check(false, 'the cut-off run left a session row', 'no session was recorded');
    else {
      const sessionId = read.session.session_id;
      preserveRun('cutoff', sessionId);
      const { children, timeline } = readCut(sessionId);
      const bodies = readTraffic('cutoff').map((r) => String(r.requestBody ?? ''));
      const cut = cutOffChildren(children, limitS, bodies);
      cutoffRecord = { ...cutoffRecord, sessionId, status: read.session.execution_status, children: children.map((c) => `${c.canonical_name} ${c.state}`), cut };
      if (cut.length === 0) noted(`no child reached the ${timeoutLimitText(limitS)} limit`, `${children.length} child(ren): ${children.map((c) => `${c.canonical_name} ${c.state}`).join(', ') || 'none'} — the cut-off checks are unasked; LIVE_RUN_CUTOFF_MIN is ${CUTOFF_MIN}`);
      else {
        const first = cut[0];
        check(cut.every((c) => c.state === 'failed'), `every child cut off at ${limitS} s ended failed with "Child timed out after ${limitS}s" (REQ-ORCH-088)`, cut.map((c) => `${c.name} ${c.state}`).join(', '));
        if (!first.makingProgress) noted('the first cut-off child was not making progress', `${first.name}: no tool call completed inside the stall window, so no statement and no offer (PD-ORCH-004)`);
        else check(first.offer !== null && first.offer.includes(`continuation_of: "${first.taskId}"`), 'the cut-off child made progress and its report carries the continuation offer (PD-ORCH-004)', first.offer ?? 'no offer');
        // PD-CONFIG-003 revisions 3 and 4 (CN1): the sidebar's tag, read as it appeared.
        const tag = tagReading(log);
        const expected = timeoutLine(limitS, first.makingProgress);
        check(tag !== null && tag.text === 'timed out' && tag.title === expected && tag.description === expected, `the timed-out tag reads PD-CONFIG-003's line in the minutes form ("${timeoutLimitText(limitS)}")`, tag === null ? 'the tag was never read (see cutoff/app.log)' : `title "${tag.title}"`);
        // OQ-217 as repaired (D9).
        check(cut.every((c) => c.factsHead), `each cut-off child's summarising request opened its facts with "${OUTCOME_HEAD} failed — Child timed out after ${limitS}s." (OQ-217)`, cut.map((c) => `${c.name}: ${c.factsHead ? 'head' : 'no head in the recorded traffic'}`).join('; '));
        for (const v of summaryOpeningVerdicts(cut)) { if (v.verdict === 'note') noted(v.what, v.detail); else check(v.passed, v.what, v.detail); }
        const relays = runFailedRelays(timeline);
        if (read.session.execution_status === 'completed') check(relays.length === 0, 'no child_result entry of the completed session relays "The run failed" (OQ-217, D9)', relays.map((e) => e.message).join(' | ') || 'none');
        else noted('the cut-off session did not complete, so the D9 relay question is unasked', `${read.session.execution_status} (${read.session.stop_reason})`);

        // 3. A later run's root takes the offer up (PD-ORCH-004 revisions 3 and 4).
        if (first.offer !== null) {
          const followLog = await launch('cutoff-continue', {
            ROTARIS_CAPTURE_RESUME: 'latest',
            ROTARIS_CAPTURE_PROMPT: `The child ${first.name} was cut off at its time limit before it finished. Take up its continuation offer: delegate its continuation with continuation_of set to its task id and a complete brief, wait for it to end, then reply with one sentence.`,
            ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
          }, RUN_WAIT_MS + 90_000);
          check(/capture: opened session "latest" from the browser/.test(followLog), 'the follow-up reopened the cut-off session from the Sessions browser');
          const after = readCut(sessionId);
          preserveRun('cutoff-continue', sessionId);
          const taken = offerTaken(after.children, first.taskId, after.roots);
          cutoffRecord = { ...cutoffRecord, followUp: taken };
          if (!taken.taken) noted('the follow-up\'s root did not take the offer up', `no child records continuation_of ${first.taskId}; children: ${after.children.map((c) => c.canonical_name).join(', ')}`);
          else check(taken.byLaterRoot, 'the offer was taken up by the later run\'s root (PD-ORCH-004 revisions 3 and 4)', JSON.stringify(taken.continuation));
        }
      }
    }
  } finally {
    writeFileSync(agentsFile, agentsBeforeCutoff);
  }
  results.scenarios.cutoff = cutoffRecord;
  await budgetGate();
}

// ── 8f. Delegation: a follow-up, attachments, delegates_to, swarm, and an edited artifact handed on ──────────
/**
 * Five delegation features the 2026-10-13 survey (item N57) found built and scripted-tested, with no live scenario asking any
 * of them; `pnpm delegation-proof` and `pnpm artifacts-proof` launches 8 and 9 take the same paths with the scripted client.
 * Three launches:
 *
 *   delegation       — the orchestrator's `delegates_to` narrowed to `codebase-analyst` and `docs-writer` (OQ-229), and a
 *                      prompt that asks for a `codebase-analyst` child, then a `docs-writer` child given that child's report
 *                      artifact through `attach_artifacts` (PD-TOOLS-006 revision 5), then a follow-up of the first child by
 *                      its `session_id` (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22). Read from the store and the traffic:
 *                      the catalogue the root was offered, each delegation's observation, the children, the timeline.
 *   delegation-edit  — the same session reopened; a person edits the session's latest artifact in the Library's inspector and
 *                      saves (PD-LIBRARY-003 (c)), then continues the session. The fresh root's first request must carry the
 *                      edited document as REQ-SESSION-115's handoff, marked `edited`, frontmatter removed (PD-LIBRARY-003 (e)).
 *   delegation-swarm — `rotaris.delegation_strategy: swarm` (PD-ORCH-006 revision 3, REQ-ORCH-025): whichever way the intent
 *                      mapping goes, what the root is told and offered must match — the swarm layer and the coordination-only
 *                      set on a run it does not grant, the direct-work statement and the writing tools on one it does.
 *
 * What a model chose not to ask is a NOTE; what the product got wrong is a FAIL. Not asked by any launch: PD-MCP-002's
 * "session whose agents work in different trees" — every agent of a session works in the session's one recorded tree
 * (`effectiveRootOf`, packages/engine/src/sessions.ts), so no session can hold agents in two trees as the product is built.
 */
if (wanted.includes('delegation')) {
  const DELEGATES_TO = ['codebase-analyst', 'docs-writer'];
  const KNOWN_TARGETS = ['requirements-engineer', 'codebase-analyst', 'librarian', 'architect', 'planner', 'coding-agent', 'tester', 'docs-writer', 'refactorer', 'verifier', 'ui-verifier'];
  const agentsBefore = readFileSync(agentsFile, 'utf8');
  const PROMPT = [
    'Work in three steps, each through the delegate tool, waiting for each child to end (wait_for_tasks) before the next step.',
    '1. Delegate to codebase-analyst, with task_name exports, the task of reading src/todos.js and reporting every function it exports.',
    "2. When it has ended, find that child's report artifact with artifact_list, and delegate to docs-writer, with task_name exports-doc,",
    '   the task of writing docs/exports.md listing those functions; pass the report artifact\'s id in attach_artifacts so the child starts from it.',
    '3. Then ask the first child one more question by calling delegate with session_id set to its task_id (do not delegate a new child for',
    '   this): which exported function has the most lines.',
    'Reply with one sentence naming that function.',
  ].join('\n');
  let log = '';
  try {
    writeFileSync(agentsFile, withPersonaKey(agentsBefore, 'orchestrator', 'delegates_to', `[${DELEGATES_TO.join(', ')}]`));
    cpSync(agentsFile, join(scenarioDir('delegation'), 'agents.yaml'));
    log = await launch('delegation', {
      ROTARIS_CAPTURE_PROMPT: PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(EDIT_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
    }, EDIT_WAIT_MS + 120_000);
  } finally {
    writeFileSync(agentsFile, agentsBefore);
  }
  check(!/capture: wait for result timed out/.test(log), 'the delegation run reached its result inside the wait');
  const read = readSession();
  checkPricing('delegation', read?.session);
  const sid = read?.session.session_id ?? null;
  const calls = sid === null ? [] : readToolCalls(sid);
  const delegates = calls.filter((c) => c.tool_name === 'delegate');
  const Database = require('better-sqlite3');
  let children = [];
  let timeline = [];
  let latest = null;
  if (sid !== null) {
    const db = new Database(oneDatabase(), { readonly: true });
    try {
      children = db.prepare('SELECT task_id, canonical_name, persona, state FROM children WHERE session_id = ? ORDER BY spawned_at, rowid').all(sid);
      timeline = db.prepare("SELECT name, metadata FROM timeline WHERE session_id = ? AND name IN ('child_resumed', 'context_selection') ORDER BY ordinal").all(sid).map((t) => ({ name: t.name, metadata: (() => { try { return JSON.parse(t.metadata); } catch { return {}; } })() }));
      // The artifact the next run's handoff names, chosen as `latestArtifactText` chooses it (`handoffArtifact`): the last the
      // latest iteration's root published, else the last that nothing superseded.
      latest = handoffArtifact(
        db.prepare('SELECT id, key_findings, edited_at, superseded_by, conversation_id FROM artifacts WHERE session_id = ? ORDER BY created_at, id').all(sid),
        db.prepare('SELECT opened_at, root_task_id FROM iterations WHERE session_id = ? ORDER BY iteration').all(sid),
        db.prepare('SELECT opened_at FROM plan_cycles WHERE session_id = ? ORDER BY cycle').all(sid));
    } finally { db.close(); }
  }
  const rootRequests = readTraffic('delegation').filter((r) => String(r.path ?? '').includes('/chat/completions')).map(requestOf).filter((r) => r !== null && /^You are the orchestrator/.test(r.system));
  // OQ-229: the catalogue says the list narrows it and names no persona outside it; a delegation outside it is refused.
  const narrowing = delegatesToReading(rootRequests, DELEGATES_TO, delegates, KNOWN_TARGETS);
  if (narrowing.kind === 'not-offered') noted('no root request was offered delegate', 'the delegates_to catalogue is unasked');
  else {
    check(narrowing.kind === 'narrowed', `the root's delegate catalogue was narrowed to its delegates_to (${DELEGATES_TO.join(', ')}) (OQ-229)`, narrowing.kind === 'narrowed' ? 'the description says so and names no other persona' : `says ${narrowing.says}; names ${narrowing.named.join(', ') || 'none'} outside the list`);
    if (narrowing.outside > 0) check(narrowing.admittedOutside === 0, 'every delegation to a persona outside delegates_to was refused naming the list (OQ-229)', `${narrowing.outside} outside, ${narrowing.admittedOutside} admitted`);
    else noted('no delegation named a persona outside delegates_to', 'the refusal is unasked live; delegation-proof measures it');
  }
  // PD-TOOLS-006 revision 5: the report artifact attached to the docs-writer.
  const attached = attachReading(delegates, timeline.filter((t) => t.name === 'context_selection').map((t) => t.metadata), children);
  if (attached.kind === 'not-asked') noted('no delegation attached an artifact', 'attach_artifacts is unasked this run');
  else if (attached.kind !== 'attached') noted('a delegation named attachments, and none was given whole', `${attached.kind}: ${delegates.filter((d) => Array.isArray(d.args.attach_artifacts) && d.args.attach_artifacts.length > 0).map((d) => `#${d.ordinal} ${JSON.stringify(d.args.attach_artifacts)}`).join(', ')}`);
  else check(attached.faults.length === 0, "an attached artifact was given to the child whole, the observation and the child's context_selection entry agreeing (PD-TOOLS-006 revision 5)", attached.faults.length === 0 ? `${attached.given} given whole over ${attached.asked} admitted delegation(s)${attached.rejected > 0 ? `; ${attached.rejected} rejected by the gate, not read` : ''}` : attached.faults.join('; '));
  // PD-TOOLS-006 revision 3 / PD-ORCH-005 clause 22: the first child followed up under its own task id.
  const followed = followUpReading(delegates, children, timeline.filter((t) => t.name === 'child_resumed'));
  if (followed.kind === 'not-asked') noted('no delegation carried a session_id', 'the follow-up of a settled child is unasked this run');
  else if (followed.kind === 'refused') {
    const named = followed.refused.every((r) => /names no settled child of yours|has not ended|cut off by its child_timeout/.test(r.reason));
    if (named) noted('every follow-up was refused for a reason PD-TOOLS-006 revision 3 lists', followed.refused.map((r) => `#${r.ordinal}: ${r.reason}`).join('; '));
    else check(false, 'a follow-up by session_id was accepted or refused for a listed reason', followed.refused.map((r) => `#${r.ordinal}: ${r.reason}`).join('; '));
  } else check(followed.faults.length === 0, 'a settled child followed up by session_id resumed under its own task id, with its child_resumed entry (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22)', followed.faults.length === 0 ? `ordinal(s) ${followed.accepted.join(', ')}` : followed.faults.join('; '));
  results.scenarios.delegation = { status: read?.session.execution_status, delegations: delegates.length, children: children.map((c) => `${c.canonical_name}:${c.persona}:${c.state}`), narrowing: narrowing.kind, attached: attached.kind, followUp: followed.kind, latestArtifact: latest?.id ?? null };
  if (sid !== null) preserveRun('delegation', sid);
  await budgetGate();

  // ── delegation-edit: a person's edit of the latest artifact, handed to the next run (PD-LIBRARY-003 (c), (e)) ──
  if (sid === null || latest === null) noted('the delegation session left no artifact to edit', 'PD-LIBRARY-003 (c) and (e) are unasked this run');
  else {
    const MARKER = 'LIVE-EDIT-MARKER';
    const editLog = await launch('delegation-edit', {
      ROTARIS_CAPTURE_RESUME: sid,
      ROTARIS_CAPTURE_RESIZE: '1360x980@500',
      ROTARIS_CAPTURE_VIEWS: '6@4000',
      ROTARIS_CAPTURE_CLICKS: [`${ARTIFACTS_TAB}@4600`, `tr[data-artifact-id="${latest.id}"]@5400`, '[data-testid="library-artifacts-inspect"]@6200', '[data-testid="artifact-tab-markdown"]@7400', 'textarea[data-testid="artifact-editor"]@8000', '[data-testid="artifact-save"]@10200'].join(';;'),
      // Since PD-LIBRARY-003 revision 2 the editor holds only the text below the read-only block, so the click cannot land in
      // the frontmatter; the Ctrl+End chord, which moved the caret past it before, is now redundant and harmless.
      ROTARIS_CAPTURE_CHORDS: 'Ctrl+End@8500',
      ROTARIS_CAPTURE_TYPE_AT: ` ${MARKER}@9000`,
      ROTARIS_CAPTURE_PROBE_AT: '[data-testid="artifact-inspector-status"]@11000',
      ROTARIS_CAPTURE_PROMPT: 'In one sentence: what does the latest artifact handed to you end with?',
      ROTARIS_CAPTURE_PROMPT_MS: '12500',
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
    }, RUN_WAIT_MS + 120_000);
    const db = new Database(oneDatabase(), { readonly: true });
    let after = null;
    try { after = db.prepare('SELECT * FROM artifacts WHERE session_id = ? AND id = ?').get(sid, latest.id) ?? null; } finally { db.close(); }
    const saved = /capture: probe-at 11000 \[data-testid="artifact-inspector-status"\] → (\[.*\])/.exec(editLog)?.[1] ?? '[]';
    const status = (() => { try { return JSON.parse(saved)[0]?.text ?? ''; } catch { return ''; } })();
    if (after?.edited_at === null || after === null) noted('the person\'s edit was not saved, so the handoff of an edited artifact is unasked', `inspector status ${JSON.stringify(status)}; the Library is driven at fixed times and the reopened session may not have been ready`);
    else {
      check(after.key_findings === latest.key_findings, "the edit stamped edited_at and left key_findings as published (PD-LIBRARY-003 (c))", `edited_at ${after.edited_at}`);
      // PD-LIBRARY-003 revision 2 (c): the saved document's block is the record's rendering, the save's edited_at included.
      const savedDocument = (() => { try { return readFileSync(join(dirname(oneDatabase()), 'sessions', sid, after.body_file), 'utf8'); } catch { return ''; } })();
      const savedBlock = leadingFrontmatter(savedDocument);
      check(savedBlock === frontmatterOfRow(after) && savedBlock.includes(`edited_at: "${after.edited_at}"`), "the saved document's frontmatter is the record's rendering, carrying edited_at (PD-LIBRARY-003 revision 2 (c))", savedBlock === '' ? `no leading block in ${after.body_file}` : savedBlock.trim().split('\n').slice(1, -1).join('; '));
      const first = readTraffic('delegation-edit').filter((r) => String(r.path ?? '').includes('/chat/completions')).map(requestOf).find((r) => r !== null && /^You are the orchestrator/.test(r.system)) ?? null;
      const handoff = handoffReading(first?.firstUser ?? null, latest.id, MARKER);
      if (handoff.kind === 'absent' || handoff.kind === 'other-artifact') noted('the continued run\'s first root request did not name the edited artifact', `${handoff.kind}: ${handoff.header ?? 'no artifact line'}`);
      else if (handoff.kind === 'carried' && handoff.cutBeforeMarker) noted('the edited document reached the handoff\'s cut before the person\'s text, so whether the text is carried is unasked', `${handoff.header}; the block is cut at ${HANDOFF_ARTIFACT_CAP} characters (REQ-SESSION-194)`);
      else check(handoff.kind === 'carried' && handoff.carriesMarker && !handoff.frontmatter, "the continued run's handoff carried the edited document, marked edited, the person's text in it and no frontmatter (PD-LIBRARY-003 (e), REQ-SESSION-115)", `${handoff.header}; marker ${handoff.carriesMarker ? 'present' : 'absent'}; frontmatter ${handoff.frontmatter ? 'present' : 'absent'}`);
    }
    const editRead = readSession();
    checkPricing('delegation-edit', editRead?.session);
    results.scenarios['delegation-edit'] = { artifact: latest.id, saved: after?.edited_at !== null && after !== null, status };
    await budgetGate();
  }

  // ── delegation-swarm: the strategy, as the mapping in force reads it (PD-ORCH-006 revision 3, REQ-ORCH-025) ──
  const SWARM_PROMPT = 'Make addTodo in src/todos.js refuse an empty or blank title, add a test for it beside the existing ones, and mention the rule in README.md. Run the tests when done. Reply with one sentence.';
  let swarmLog = '';
  const swarmStartedAt = Date.now();
  try {
    writeFileSync(agentsFile, withSectionKey(agentsBefore, 'rotaris', 'delegation_strategy', 'swarm'));
    cpSync(agentsFile, join(scenarioDir('delegation-swarm'), 'agents.yaml'));
    swarmLog = await launch('delegation-swarm', {
      ROTARIS_CAPTURE_PROMPT: SWARM_PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(EDIT_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
    }, EDIT_WAIT_MS + 120_000);
  } finally {
    writeFileSync(agentsFile, agentsBefore);
  }
  const swarmEndedAt = Date.now();
  const swarmRead = readSession();
  /*
   * The run's length is the model's, not what this launch measures (PD-ORCH-006 revision 3 is read from the first root
   * request below). At b9e3005 the coordinator invented a README loss and then a user ask to move persistence to Dexie, and
   * ran out the 840 s wait doing that work with the product clean (acceptance finding L8,
   * docs/defects/fixed/a-swarm-run-the-model-kept-working-past-its-wait-fails-the-live-run.md). So an overrun takes the duress
   * run's reading (`overrunReading`, finding H-h): still progressing with the product holding at most a tenth of the wait is
   * the window's bound, a NOTE; a run that stopped moving, or a product that held more, still FAILS.
   */
  const swarmDeadline = overrunReading({
    log: swarmLog, startedAt: swarmStartedAt, endedAt: swarmEndedAt, records: readTraffic('delegation-swarm'),
    calls: swarmRead === null ? [] : readToolCalls(swarmRead.session.session_id), budgetMs: EDIT_WAIT_MS, recorded: proxy !== null, raise: 'LIVE_RUN_EDIT_WAIT_MS',
  });
  if (swarmDeadline.outcome === 'window') noted('the swarm run was bounded by the window, not by the product', `${swarmDeadline.detail}; what the coordinator chose to do with the time is the model's (PD-ORCH-006 revision 3 is read from its first root request below)`);
  else check(swarmDeadline.outcome === 'inside', 'the swarm run reached its result inside the wait', swarmDeadline.detail);
  checkPricing('delegation-swarm', swarmRead?.session);
  const firstRoot = readTraffic('delegation-swarm').filter((r) => String(r.path ?? '').includes('/chat/completions')).map(requestOf).find((r) => r !== null && /^You are the orchestrator/.test(r.system)) ?? null;
  const swarm = swarmReading(firstRoot);
  if (swarm.kind === 'absent') noted('no root request of the swarm run was recorded', RECORD_TRAFFIC ? 'the strategy is unasked' : 'traffic not recorded (--no-record-traffic)');
  else check(swarm.faults.length === 0, swarm.kind === 'granted' ? 'a swarm run the mapping granted was told the direct-work statement, no swarm layer, and offered the writing tools beside delegate (PD-ORCH-006 revision 3)' : "a swarm run the mapping did not grant carried REQ-ORCH-025's swarm layer and its coordination-only tool set", swarm.faults.length === 0 ? `${swarm.kind}; offered ${swarm.offered.join(', ')}` : swarm.faults.join('; '));
  const swarmChildren = swarmRead === null ? 0 : readToolCalls(swarmRead.session.session_id).filter((c) => c.tool_name === 'delegate' && c.status === 'ok').length;
  if (swarm.kind === 'coordinating') noted('what the swarm coordinator delegated', `${swarmChildren} admitted delegation(s); how widely it divided the work is the model's, and is recorded rather than asserted`);
  results.scenarios['delegation-swarm'] = { status: swarmRead?.session.execution_status, kind: swarm.kind, offered: swarm.offered, delegations: swarmChildren, deadline: swarmDeadline.outcome };
  if (swarmRead) preserveRun('delegation-swarm', swarmRead.session.session_id);
  await budgetGate();
}

// ── 8i. A symbol rename through the code-intelligence EDIT tier ─────────────────────────────────────────────
/**
 * OPT-IN (`--only=rename`), a few minutes (fin42, N59): the first live run of a cross-file code-intelligence EDIT call that
 * needs a language server. OQ-245's ruling — the run host observes a reach-scoped EDIT call before and after it, so a child's
 * report lists every file the call changed — was measured in the built app for the cross-file replacement (`code-intel-proof`
 * launch 9) and the rename (launches 10 and 11), never live; the default and duress runs at 552d346 made no EDIT-tier call at all.
 *
 * The fixture's `remaining` is declared in `src/todos.js` and imported and called by `src/App.jsx` and `src/todos.test.js`. One
 * coding-agent child is asked to rename it with `rename_symbol` and then run the suite. Asserted from the store and the files
 * (`lib/rename-reading.mjs`), never from the model's prose: the first rename row `ok`; none of the three files still calls or
 * imports `remaining`; the renaming child's stored report and its child-report artifact list every one of the three that now
 * carries `countRemaining`; `node --test` green, run here. `summary.md` (REQ-SESSION-140) has no edited-files section, so whether
 * the session's summary names the files is a NOTE. A run with no `rename_symbol` call is a NOTE, "not reached": a live model may
 * choose another tool, and the questions above are then unasked. Whether the child searched for the symbol's references before its
 * first rename is recorded beside the reading: a rename with nothing before it renamed the declaring file alone in the pinned
 * runtime (docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md),
 * and since PD-MCP-004 (OQ-273, ruled 2026-10-13 under R-072) the run host sends the reference search itself before every rename,
 * writing no row for it, so a cold rename whose importing files were left behind, or mended by another tool afterwards, is a
 * finding against that directive. Until the ruling it was a NOTE naming OQ-273. At `3c03287` it failed on the fixture's shape,
 * a JavaScript workspace with no `tsconfig.json` or `jsconfig.json`, where the search answers nothing and the rename stays in the
 * declaring file (fin47, reopening the note). The failure's detail says whether the workspace held a project file, since that,
 * and not the search's timing, decides whether the search can help. Since PD-MCP-004 revision 2 (OQ-362, ruled 2026-10-20 under
 * R-072) the run host places a `jsconfig.json` of the product's own at the workspace root for the search and the rename where no
 * project file covers the declaring file, and removes it when the rename has answered; the fixture has none, so a `jsconfig.json`
 * standing at its root after the run is a FAIL ("the product's project file was removed"), and the application log's placements
 * and removals of the file are a NOTE beside it. The reading it replaces, kept beside it: "(OQ-362, open)".
 *
 * It renames a symbol every later scenario's prompts may read, so it runs after the default set and the workspace's three files
 * are restored afterwards.
 */
if (wanted.includes('rename')) {
  const before = Object.fromEntries(RENAME_FILES.map((f) => [f, readFileSync(join(workspace, f), 'utf8')]));
  let renameRecord = { notReached: true };
  try {
    const log = await launch('rename', {
      ROTARIS_CAPTURE_PROMPT: [
        `Rename the function \`${RENAME_FROM}\` declared in src/todos.js to \`${RENAME_TO}\`, everywhere it is used. Delegate exactly one`,
        'coding-agent child for it and do no work yourself. Tell the child to make the rename with ONE call of the code_intelligence',
        `server's rename_symbol tool (name_path "${RENAME_FROM}", relative_path "src/todos.js", new_name "${RENAME_TO}"), then to run`,
        '`node --test` in the terminal and report whether it passed and which files it changed. Delegate nothing else, and answer with',
        'one sentence as soon as the child has reported.',
      ].join('\n'),
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
    }, RUN_WAIT_MS + 90_000);
    check(!/capture: wait for result timed out/.test(log), 'rename: the run reached its result inside the wait');
    const read = readSession();
    checkPricing('rename', read?.session);
    if (read === null) check(false, 'rename: the run left a session row', 'no session was recorded');
    else {
      const sessionId = read.session.session_id;
      preserveRun('rename', sessionId);
      const Database = require('better-sqlite3');
      const db = new Database(oneDatabase(), { readonly: true });
      let children; let artifacts;
      try {
        children = db.prepare('SELECT canonical_name, persona, state, report FROM children WHERE session_id = ? ORDER BY spawned_at').all(sessionId);
        artifacts = db.prepare("SELECT edited_files FROM artifacts WHERE session_id = ? AND kind = 'child_report'").all(sessionId);
      } finally { db.close(); }
      const files = Object.fromEntries(RENAME_FILES.map((f) => [f, existsSync(join(workspace, f)) ? readFileSync(join(workspace, f), 'utf8') : null]));
      mkdirSync(join(scenarioDir('rename'), 'changed'), { recursive: true });
      for (const f of RENAME_FILES) if (files[f] !== null) writeFileSync(join(scenarioDir('rename'), 'changed', basename(f)), files[f]);
      writeFileSync(join(scenarioDir('rename'), 'diff.txt'), `${git('diff', '--', ...RENAME_FILES)}\n`);
      const calls = readToolCalls(sessionId);
      const r = renameReading({ calls, files, children, artifacts });
      const suiteRun = spawnSync(process.execPath, ['--test'], { cwd: workspace, encoding: 'utf8', timeout: 120_000 });
      writeFileSync(join(scenarioDir('rename'), 'node-test.log'), `${suiteRun.stdout ?? ''}\n${suiteRun.stderr ?? ''}`);
      renameRecord = { sessionId, status: read.session.execution_status, children: children.map((c) => `${c.canonical_name} (${c.persona}) ${c.state}`), ...r, suiteExit: suiteRun.status };
      if (!r.reached) {
        noted('rename: no agent called rename_symbol, so the rename was NOT REACHED', `tools used: ${[...new Set(calls.map((c) => c.tool_name))].join(', ') || 'none'}; files still naming ${RENAME_FROM}: ${r.leftBehind.join(', ') || 'none'} — OQ-245's rename and PD-MCP-004 are unasked in this run`);
      } else {
        check(r.first.status === 'ok', 'rename: the first rename_symbol call is ok', `${r.agent}: ${r.first.status} — ${JSON.stringify(r.first.result)}`);
        noted(`rename: ${r.agent} ${r.searchedFirst ? 'searched for the symbol\'s references before its first rename' : 'renamed with no reference search of its own before it (a cold rename; PD-MCP-004\'s search is the run host\'s and writes no row)'}`, `${r.renames} rename call(s); the first said ${JSON.stringify(r.first.result)}`);
        const projectFiles = ['tsconfig.json', 'jsconfig.json'].filter((f) => existsSync(join(workspace, f)));
        if (r.cold) check(!r.coldLeftBehind, 'rename: the cold rename reached the importing files on its own (PD-MCP-004)', `left behind: ${r.leftBehind.join(', ') || 'none'}; written by another tool after it: ${r.mendedAfter.join(', ') || 'none'} — the run host's reference search before the rename, and the product's own jsconfig.json for it where no project file covers the files (PD-MCP-004 revision 2, OQ-362, ruled 2026-10-20), did not make it reach them; the workspace root holds ${projectFiles.join(' and ') || 'no tsconfig.json or jsconfig.json'} after the run (docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)`);
        // PD-MCP-004 revision 2 (OQ-362): the fixture has no project file, so the run host placed a jsconfig.json of the product's
        // own at the root for each rename's search and rename, and removed it when the rename had answered; none may be left.
        const placements = log.split('\n').filter((l) => /mcp: (placed|adopted) the product's project file /.test(l)).length;
        const removals = log.split('\n').filter((l) => /mcp: removed the product's project file /.test(l)).length;
        const productFileLeft = existsSync(join(workspace, 'jsconfig.json'));
        check(!productFileLeft, 'rename: the product\'s project file was removed (PD-MCP-004 revision 2)', `the workspace root ${productFileLeft ? 'holds a' : 'holds no'} jsconfig.json after the run (the fixture has none); the application log holds ${placements} placement(s) and ${removals} removal(s) of the product's project file`);
        noted('rename: the application log\'s placements and removals of the product\'s project file (PD-MCP-004 revision 2, written at info)', `${placements} placement(s), ${removals} removal(s) for ${r.renames} rename call(s)`);
        check(r.leftBehind.length === 0 && r.carrying.length === RENAME_FILES.length, `rename: ${RENAME_FILES.join(', ')} call and import ${RENAME_TO} and no longer ${RENAME_FROM} (REQ-MCP-015)`, `carrying ${r.carrying.join(', ') || 'none'}; still naming ${RENAME_FROM}: ${r.leftBehind.join(', ') || 'none'}${r.cold ? ' (cold rename, PD-MCP-004)' : ''}`);
        check(r.reportFiles !== null && r.reportMissing.length === 0, 'rename: the renaming child\'s stored report lists every file the rename changed (OQ-245, PD-ORCH-004, REQ-ORCH-109)', `edited_files ${JSON.stringify(r.reportFiles)}; missing ${JSON.stringify(r.reportMissing)}`);
        check(r.artifactMissing.length === 0, 'rename: the child-report artifact lists every file the rename changed (REQ-LIBRARY-088)', `${JSON.stringify(r.artifactFiles)}; missing ${JSON.stringify(r.artifactMissing)}`);
        check(suiteRun.status === 0, 'rename: node --test is green in the workspace afterwards', `exit ${suiteRun.status ?? suiteRun.signal}`);
        const summaryFile = join(scenarioDir('rename'), 'summary.md');
        const summary = existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : '';
        const unnamed = r.carrying.filter((f) => !summary.includes(f));
        noted('rename: whether the session\'s summary.md names the files (REQ-SESSION-140 has no edited-files section, so this is the model\'s prose)', unnamed.length === 0 ? `all of ${r.carrying.join(', ')}` : `not named: ${unnamed.join(', ')}`);
      }
    }
  } finally {
    for (const [f, text] of Object.entries(before)) writeFileSync(join(workspace, f), text);
  }
  results.scenarios.rename = renameRecord;
  await budgetGate();
}

// ── 8j. A plan left open at the answer (PD-ORCH-015) ─────────────────────────────────────────────────────────
/**
 * OPT-IN (`--only=plan-open`), a few minutes (fin42, the survey's N56). `PD-ORCH-015` had been measured only by
 * `coordinator-plan.test.ts` and `part-h-proof`'s scripted `plan-correction` and `plan-held` launches: the default and duress
 * live runs at 552d346 never reached it, every coordinator closing its plan before it answered (0 of 174 requests carried the
 * correction). So the prompt asks for the shape: a plan of three items, the first two done by the coordinator itself, and an
 * answer given with the third still PENDING.
 *
 *   1. `plan-open` — nothing more is asked; a model that records the item when corrected closes the iteration `succeeded`.
 *      Asserted: one correction warning, the correction sent in the root's own conversation and saying the answer was shown, no
 *      answer re-prompt (PD-ORCH-009 revision 2), no held row, one iteration `succeeded`, `completed` / `tasks_complete`.
 *   2. `plan-held` — the prompt also tells it to answer a correction with one word and leave its plan alone, so the correction
 *      is spent and the task re-queued. Asserted: the held `system` row in `planHeldRowText`'s words, and the next fresh root's
 *      first request carrying the continuation marker and an answer of this session labelled as the one the person was shown.
 *      Its outcome — a later root that records the item, or the task given up on at the retry limit — is recorded.
 *
 * A coordinator that closed its plan before answering, in either launch, is a NOTE: "not reached". Read from the log, the
 * recorded traffic, the transcript's `system` rows and the iterations, never from the model's prose (`lib/plan-open-reading.mjs`).
 * Without the recording proxy the traffic half is unasked and said so.
 */
const PLAN_OPEN_PROMPT = [
  'Before anything else, write your todo list with the todo tool, with exactly these three items: "Read src/todos.js",',
  '"Read src/App.jsx" and "Name the function that counts the remaining todos". Do the first two items yourself with read_file',
  'and mark each COMPLETED as you finish it. Delegate nothing. Then answer in one sentence naming the function that counts the',
  'remaining todos, and give that answer WITHOUT touching the todo list again: the third item must still be PENDING when you answer.',
].join('\n');
const PLAN_HELD_TAIL = '\nIf you are then told that an item of your plan is not complete, reply with the single word "Noted." and do not use the todo tool again in this conversation.';
function planLaunchReading(name, log) {
  const read = readSession();
  if (read === null) { check(false, `${name}: the run left a session row`, 'no session was recorded'); return null; }
  preserveRun(name, read.session.session_id);
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  let iterations;
  try { iterations = db.prepare('SELECT iteration, outcome FROM iterations WHERE session_id = ? ORDER BY iteration').all(read.session.session_id); } finally { db.close(); }
  const systemRows = read.rows.filter((r) => r.kind === 'system').map((r) => String(r.body ?? ''));
  const answers = read.rows.filter((r) => r.kind === 'agent').map((r) => String(r.body ?? '')).filter((b) => b.trim() !== '');
  const bodies = proxy === null ? [] : readTraffic(name).map((r) => String(r.requestBody ?? ''));
  return { read, r: planReading({ log, bodies, systemRows, iterations, answers }) };
}
if (wanted.includes('plan-open')) {
  const record = {};
  {
    const log = await launch('plan-open', { ROTARIS_CAPTURE_PROMPT: PLAN_OPEN_PROMPT, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000' }, RUN_WAIT_MS + 90_000);
    check(!/capture: wait for result timed out/.test(log), 'plan-open: the run reached its result inside the wait');
    const got = planLaunchReading('plan-open', log);
    if (got !== null) {
      const { read, r } = got;
      checkPricing('plan-open', read.session);
      record['plan-open'] = { status: read.session.execution_status, stopReason: read.session.stop_reason, ...r };
      if (!r.reached) noted('plan-open: the coordinator closed its plan before answering, so PD-ORCH-015\'s correction was NOT REACHED', `iterations ${JSON.stringify(r.outcomes)}; ${r.corrections} correction(s) in the traffic`);
      else {
        check(r.warnings.length === 1 && r.warnings[0].n === 1, 'plan-open: one correction was sent into the root\'s conversation (REQ-ORCH-078 under PD-ORCH-015)', JSON.stringify(r.warnings));
        if (proxy === null) noted('plan-open: the correction\'s text was not read', 'traffic not recorded (--no-record-traffic)');
        else check(r.corrections >= 1 && r.shownSaid, 'plan-open: the correction reached the model in the root\'s own conversation, saying the answer had been shown (PD-ORCH-015)', `${r.corrections} correction request(s); "has been shown" ${r.shownSaid ? 'said' : 'not said'}`);
        check(r.reprompts === 0, 'plan-open: a root that answered was not asked for its answer again (PD-ORCH-009 revision 2)', `${r.reprompts} re-prompt(s)`);
        if (r.requeued) noted('plan-open: the coordinator did not record the item when corrected, and its task was re-queued', `${r.heldRows.join(' | ')} — the held path, which plan-held asks for`);
        else check(r.outcomes.length === 1 && r.outcomes[0] === 'succeeded' && read.session.execution_status === 'completed' && read.session.stop_reason === 'tasks_complete', 'plan-open: the corrected iteration closed succeeded, one iteration, completed / tasks_complete', `${JSON.stringify(r.outcomes)}; ${read.session.execution_status} / ${read.session.stop_reason}`);
      }
    }
  }
  await budgetGate();
  {
    const log = await launch('plan-held', { ROTARIS_CAPTURE_PROMPT: `${PLAN_OPEN_PROMPT}${PLAN_HELD_TAIL}`, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000' }, RUN_WAIT_MS + 90_000);
    check(!/capture: wait for result timed out/.test(log), 'plan-held: the run reached its result inside the wait');
    const got = planLaunchReading('plan-held', log);
    if (got !== null) {
      const { read, r } = got;
      checkPricing('plan-held', read.session);
      record['plan-held'] = { status: read.session.execution_status, stopReason: read.session.stop_reason, ...r };
      if (!r.reached) noted('plan-held: the coordinator closed its plan before answering, so PD-ORCH-015 was NOT REACHED', `iterations ${JSON.stringify(r.outcomes)}`);
      else if (!r.requeued) noted('plan-held: the coordinator recorded the item when corrected despite the prompt, so the held answer was NOT REACHED', `iterations ${JSON.stringify(r.outcomes)}; ${r.warnings.length} correction warning(s)`);
      else {
        check(r.heldRows.length >= 1, 'plan-held: the held system row names the open item and says the task was returned to the queue or given up on (PD-ORCH-015)', r.heldRows.join(' | '));
        if (proxy === null) noted('plan-held: the held answer\'s carriage was not read', 'traffic not recorded (--no-record-traffic)');
        else {
          check(r.carries >= 1, 'plan-held: the next fresh root\'s first request carried the continuation marker (REQ-ORCH-075)', `${r.carries} carrying request(s)`);
          check(r.heldIsAnAnswer, 'plan-held: it carried an answer of this session, labelled as the one the person was shown (PD-ORCH-015)', r.heldAnswers.map((a) => JSON.stringify(a.slice(0, 160))).join(' | ') || 'none');
        }
        noted('plan-held: how the re-queued task ended', `iterations ${JSON.stringify(r.outcomes)}; ${read.session.execution_status} / ${read.session.stop_reason}`);
      }
    }
  }
  results.scenarios['plan-open'] = record;
  await budgetGate();
}

// ── 8k. A root that answers with nothing (PD-ORCH-009 revision 2) ──────────────────────────────────────────────
/**
 * OPT-IN (`--only=empty-answer`), a few minutes (fin42, the survey's N56). No live run had met a silent root: at 552d346 every
 * root's last request ended `stop` with text. The recording proxy's `empty` rule (`lib/model-traffic.mjs`) answers the
 * coordinating root's completions — the requests whose instructions open "You are the orchestrator.", the intent classifier's
 * excluded — with a well-formed completion that has no content and no tool call, finished `stop`, and never contacts the
 * endpoint for them.
 *
 *   1. `empty-answer` — both of the root's calls answered empty: exactly one re-prompt sent and logged, then "The run ended
 *      without an answer: …" in a `system` row and one warning `incomplete_execution` issue (`reprompted`, `run_ended`).
 *   2. `empty-once` — the first call alone: one re-prompt, the model's own answer to it, and neither the row nor the issue.
 *
 * In both, since PD-ORCH-009 revision 3 (OQ-282; the live run at ce5f952, F1): the re-prompt is the request's final message, no
 * loop classification reads 'Trigger: stuck', and the session holds no root `loop_supervisor_activation` with trigger `stuck`.
 *
 *   3. `empty-wait` (fin45, PD-ORCH-009 revision 5, OQ-296) — the root asked to delegate one background child and wait for it; the
 *      proxy empties the root's first request that holds the delegation's `task_id: bg_` and no report, so the root's turn ends
 *      with neither text nor a call while its child runs. The child's report must then be the final message of the request that
 *      resumes the root (no "Pause and reassess" behind it), with no stuck classification, no root stuck activation, and the
 *      session not `agent_session_aborted`. A root that delegated nothing is a NOTE, "not reached".
 *
 * It needs the proxy; without it the scenario is a NOTE.
 */
if (wanted.includes('empty-answer')) {
  const record = {};
  if (proxy === null) noted('the empty-answer scenario did not run', 'it needs the recording proxy, and it is not in the path (--no-record-traffic, or it could not start)');
  else {
    const PROMPT = 'Read README.md and reply with one sentence naming the application it describes.';
    for (const c of [{ name: 'empty-answer', times: 2, told: true }, { name: 'empty-once', times: 1, told: false }]) {
      proxy.setFaults([{ kind: 'empty', when: ROOT_MARK, unless: CLASSIFIER_MARK, times: c.times }]);
      const log = await launch(c.name, { ROTARIS_CAPTURE_PROMPT: PROMPT, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000' }, RUN_WAIT_MS + 90_000);
      const fired = proxy.stats().faultsFired.filter((f) => f.kind === 'empty').length;
      proxy.setFaults([]);
      check(!/capture: wait for result timed out/.test(log), `${c.name}: the run reached its result inside the wait`);
      const read = readSession();
      if (read === null) { check(false, `${c.name}: the run left a session row`, 'no session was recorded'); continue; }
      preserveRun(c.name, read.session.session_id);
      checkPricing(c.name, read.session);
      const supervision = readSupervision(read.session.session_id);
      const r = answerReading({ log, bodies: readTraffic(c.name).map((x) => String(x.requestBody ?? '')), systemRows: read.rows.filter((x) => x.kind === 'system').map((x) => String(x.body ?? '')), issues: readIssues(read.session.session_id), fired, activations: supervision.activations, childNames: supervision.childNames });
      record[c.name] = { status: read.session.execution_status, stopReason: read.session.stop_reason, ...r };
      check(r.fired === c.times, `${c.name}: the proxy answered ${c.times} of the root's completion(s) empty`, `${r.fired} empty answer(s) over ${r.rootRequests} root request(s)`);
      check(r.reprompts === 1 && r.logged === 1, `${c.name}: the root was asked for its answer exactly once, in its own conversation (PD-ORCH-009)`, `${r.reprompts} re-prompt request(s), ${r.logged} log line(s)`);
      // PD-ORCH-009 revision 3 (OQ-282, ruled 2026-10-13 under R-072): the silent turn the re-prompt answers is no stuck report, so
      // the re-prompt is the request's final message — the live run at ce5f952 (F1) appended "Pause and reassess …" after it.
      check(r.stuckClassifications === 0, `${c.name}: no stuck classification was asked (PD-ORCH-009 revision 3)`, `${r.stuckClassifications} classifier request(s) reading 'Trigger: stuck'`);
      check(r.stuckActivations.length === 0, `${c.name}: the root wrote no stuck loop_supervisor_activation (PD-ORCH-009 revision 3)`, JSON.stringify(r.stuckActivations));
      if (c.told) {
        check(r.unanswered.length === 1 && /^The run ended without an answer: /.test(r.unanswered[0]), `${c.name}: the person was told once that the run ended without an answer (PD-ORCH-009)`, r.unanswered.join(' | ') || 'no such row');
        check(r.incomplete.length === 1 && r.incomplete[0].severity === 'warning' && r.incomplete[0].metadata.reprompted === true && r.incomplete[0].metadata.run_ended === true, `${c.name}: one warning incomplete_execution issue, reprompted and run_ended`, JSON.stringify(r.incomplete));
      } else {
        check(r.unanswered.length === 0 && r.incomplete.length === 0, `${c.name}: a root that answered when asked is not reported answerless (PD-ORCH-009)`, `${r.unanswered.length} row(s), ${r.incomplete.length} issue(s)`);
        const answered = read.rows.some((x) => x.kind === 'agent' && String(x.body ?? '').trim() !== '');
        if (!answered) noted(`${c.name}: the model wrote no answer when asked either`, 'the re-prompt reached it; its reply was empty');
      }
    }
    // PD-ORCH-009 revision 5 (OQ-296, ruled 2026-10-14 under R-072): a parent's silent wait on its children is no stuck report.
    {
      const name = 'empty-wait';
      proxy.setFaults([{ kind: 'empty', when: [ROOT_MARK, DELEGATED_MARK], unless: [CLASSIFIER_MARK, REPORT_MARK], times: 1 }]);
      const log = await launch(name, { ROTARIS_CAPTURE_PROMPT: 'Delegate one codebase-analyst child in the background to read README.md and report the name of the application it describes. Then wait for its report, and reply with that name in one sentence. Delegate nothing else.', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000' }, RUN_WAIT_MS + 90_000);
      const fired = proxy.stats().faultsFired.filter((f) => f.kind === 'empty').length;
      proxy.setFaults([]);
      check(!/capture: wait for result timed out/.test(log), `${name}: the run reached its result inside the wait`);
      const read = readSession();
      if (read === null) check(false, `${name}: the run left a session row`, 'no session was recorded');
      else {
        preserveRun(name, read.session.session_id);
        checkPricing(name, read.session);
        const supervision = readSupervision(read.session.session_id);
        const r = waitReading({ bodies: readTraffic(name).map((x) => String(x.requestBody ?? '')), fired, activations: supervision.activations, childNames: supervision.childNames });
        record[name] = { status: read.session.execution_status, stopReason: read.session.stop_reason, ...r };
        if (r.fired === 0) noted(`${name}: not reached`, 'the root made no request after an admitted background delegation, so no silent wait was made');
        else {
          check(r.resumed >= 1, `${name}: the root, silent while its child ran, was resumed with the child's report as its request's final message (PD-ORCH-009 revision 5)`, `${r.resumed} request(s) ending with a report over ${r.rootRequests} root request(s)`);
          check(r.followed === 0, `${name}: no message followed a report in the request it resumed (PD-ORCH-009 revision 5)`, `${r.followed} request(s) with a message behind the report`);
          check(r.stuckClassifications === 0, `${name}: no stuck classification was asked (PD-ORCH-009 revision 5)`, `${r.stuckClassifications} classifier request(s) reading 'Trigger: stuck'`);
          check(r.stuckActivations.length === 0, `${name}: the root wrote no stuck loop_supervisor_activation (PD-ORCH-009 revision 5)`, JSON.stringify(r.stuckActivations));
          check(read.session.stop_reason !== 'agent_session_aborted', `${name}: the run was not aborted by loop supervision`, `${read.session.execution_status} / ${read.session.stop_reason}`);
        }
      }
    }
  }
  results.scenarios['empty-answer'] = record;
  await budgetGate();
}

// ── 9. The long run ──────────────────────────────────────────────────────────────────────────────────────
/**
 * OPT-IN (`--only=duress`), one of five: `OPT_IN` also names `cutoff`, `rename`, `plan-open` and `empty-answer` (8e, 8i, 8j
 * and 8k above), and no default run reaches any of them. What only they ask — PD-ORCH-009 revisions 3 to 5 (`empty-answer`),
 * PD-ORCH-015 (`plan-open`), PD-MCP-004's cold rename (`rename`), PD-CONFIG-003's cut-off child (`cutoff`) and the long run
 * here — is measured by a run that names them, never by a default one (acceptance finding L9 at b9e3005,
 * docs/defects/fixed/the-live-runs-duress-section-calls-itself-its-only-opt-in-scenario.md).
 *
 * `codebase.md` names the gap this exists to enter: "`pnpm live-run` runs short tasks against an unmetered
 * endpoint, so it holds **no generation near the model timeout, no multi-line command, and no re-spawn**. Every
 * one of the seven lived in exactly that gap." Scenario 8 takes the multi-line command. This one takes the
 * length: a delegating run long enough to reach compression, a child that ends badly, and the aggregates that
 * only diverge after a while.
 *
 * **What it asserts is coherence, not correctness.** A long run's failures are mostly records that disagree with
 * each other — a stopped run with a null summary, tokens with no cost, a compressions counter that never
 * counted, a child report that hardcoded an empty command list. `autopsy.mjs` already computes most of those, so
 * the checks read its output and the store rather than re-deriving them here; that is what makes a thirty-minute
 * scenario cheap to write and hard to fool. What the model produced is NOT asserted: a weak model doing the work
 * badly is a fact about the model.
 *
 * Its children's limit is PD-CONFIG-003's Per-agent timeout at `LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN` (default 45 minutes), written
 * into the workspace's `agents.yaml` as Save stores it for this launch alone and restored after; every other scenario keeps the
 * product's 1200 s. OQ-214's reopening and second ruling (2026-10-07, R-072; finding D2 of the duress run at a68f121, where the
 * 1200 s ceiling cut off a verifier and its continuation each working on its own task): the ceiling stands, and this is the
 * relief its ruling counts on, set as a user on a slow reasoning model would set it. The pack carries `duress/agents.yaml`,
 * `results.json` `scenarios.duress.childTimeoutS`, and a NOTE whenever the value is not the default, so a pass at a raised
 * limit is never read as a pass at the default.
 *
 * Its wall clock is `LIVE_RUN_DURESS_MS` (default 40 minutes, the owner's figure of 2026-09-22). An overrun says where
 * the time went, and one the endpoint held while the run was still progressing is a NOTE that the window was the bound,
 * not a failure of the product (live-run finding H-h; `lib/duress-checks.mjs`, docs/proofs/live-run.md "`LIVE_RUN_DURESS_MS`").
 *
 * **The fixture question, ruled rather than left open (2026-09-22, delegated by the owner): the default stays
 * `todo-app`, and the LENGTH comes from the work asked for rather than from the tree's weight.** A bigger
 * fixture is a second tree to maintain and to keep in step with five other scenarios' prompts, and it does not
 * actually buy what it looks like it buys — a five-file repository and a five-hundred-file one both delegate
 * exactly as much as the prompt commissions. So the prompt below is three WAVES that each depend on the last,
 * which is what reaches compression, re-spawn and a child that ends badly; `--duress-fixture` remains for
 * pointing this at a real tree when the question is about size specifically.
 */
if (wanted.includes('duress')) {
  /*
   * Three dependent waves. Wave two cannot start until wave one's reports exist and wave three cannot start
   * until wave two's do, so the parent's conversation grows monotonically across all of them — which is the
   * thing a long run is FOR. A single wave of three parallel children finishes in minutes and measures the
   * short path under a longer deadline.
   */
  const PROMPT = [
    'Work through this repository as a team, delegating rather than doing the work yourself. Three waves, in order,',
    'each waiting for the one before it.',
    '',
    'Wave 1 — commission three children and wait for all three:',
    '  a. document every exported function under src/ into docs/api.md, one section each, with its signature,',
    '     its parameters and an example call taken from real usage in the repository;',
    '  b. add test/extra.test.js covering every branch of the list functions, run `node --test` in the terminal,',
    '     and keep fixing until it is green;',
    '  c. write docs/overview.md summarising the repository with a file-by-file table and a dependency list.',
    '',
    'Wave 2 — read all three outputs yourself, then commission two more children and wait for both:',
    '  d. reconcile docs/api.md against docs/overview.md and fix every disagreement in both files;',
    '  e. add docs/decisions.md recording, for each source file, one design decision it embodies and the',
    '     alternative it rejected, citing the lines that show it.',
    '',
    'Wave 3 — commission one final child to verify the whole result: it must re-read every file the other five',
    'touched, run `node --test` again in the terminal, and write docs/verification.md listing what it checked,',
    'what it found and what it could not confirm.',
    '',
    'Read files before describing them; do not describe a file you have not opened. When wave 3 has reported,',
    'reply with one paragraph naming what each child did and which files changed.',
  ].join('\n');
  const agentsBeforeDuress = readFileSync(agentsFile, 'utf8');
  const duressAgents = withRuntimeKey(agentsBeforeDuress, 'child_timeout', DURESS_CHILD_TIMEOUT_S);
  const startedAt = Date.now();
  let log = '';
  try {
    writeFileSync(agentsFile, duressAgents);
    cpSync(agentsFile, join(scenarioDir('duress'), 'agents.yaml'));
    log = await launch('duress', {
      ROTARIS_CAPTURE_PROMPT: PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(DURESS_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
      // Live-run finding D8: the `pendingLanes` trap (`lib/lanes-trap.mjs`), installed before the prompt is typed and
      // read every two minutes. It simulates React's nested-update count and writes a `rotaris-lanes-trap:` line, carried
      // into duress/app.log by the console relay, at each new high from 10 on and at any update-depth error, naming the
      // fibers that hold the pending work and the components the commit re-rendered.
      ROTARIS_CAPTURE_EVAL_AT: lanesTrapSteps({ installAtMs: 2500, readEveryMs: 120_000, untilMs: DURESS_MS }),
    }, DURESS_MS + 180_000);
  } finally {
    writeFileSync(agentsFile, agentsBeforeDuress);
  }
  const elapsed = Date.now() - startedAt;
  // Live-run finding D8: what the trap saw. Since OQ-278's ruling (2026-10-13, R-072) the instrument itself is checked: a trap
  // that did not install, or whose `rotaris-lanes-trap: installed` line did not reach this log through the console relay,
  // FAILS (`lanesTrapGuard`), since a guard that did not run cannot close the note. What it saw stays a NOTE.
  const lanes = lanesTrapReading(log);
  scenarioEvidence.duress.lanesTrap = { installed: lanes.installed, relayed: lanes.relayed, reason: lanes.reason, readings: lanes.readings, last: lanes.last, lines: lanes.lines };
  const lanesGuard = lanesTrapGuard(lanes);
  check(lanesGuard.passed, lanesGuard.what, lanesGuard.detail);
  if (lanes.installed) noted('the long run\'s pendingLanes trap (D8)', `${lanes.last?.commits ?? 0} commits; the nested-update run's high ${lanes.last?.maxRun ?? 0} of React's 50 (holders ${JSON.stringify(lanes.last?.maxRunHolders ?? [])}; re-rendered ${JSON.stringify(lanes.last?.maxRunRendered ?? [])}), the longest synchronous burst ${lanes.last?.maxBurst ?? 0}, ${lanes.last?.updateDepthErrors ?? 0} update-depth errors seen${lanes.lines.length > 0 ? `; its lines: ${lanes.lines.map((l) => JSON.stringify(l)).join(' | ')}` : ''}`);
  // OQ-214 as re-ruled: the run host read the Per-agent timeout this launch wrote (`configuration.ts`'s loaded line).
  check(log.includes(`child_timeout=${DURESS_CHILD_TIMEOUT_S} s`), 'the long run\'s children ran under the Per-agent timeout the harness set', `runtime.child_timeout: ${DURESS_CHILD_TIMEOUT_S} written; the run host's line ${/child_timeout=\d+ s/.exec(log)?.[0] ?? 'is absent'}`);
  if (DURESS_CHILD_TIMEOUT_S !== 1200) noted('the long run\'s per-agent timeout', `${DURESS_CHILD_TIMEOUT_S} s — PD-CONFIG-003's Per-agent timeout raised as a user on a slow reasoning model would raise it (OQ-214, re-ruled 2026-10-07); LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN=20 measures the product's 1200 s default`);
  const read = readSession();
  /*
   * Where the wait went, from the traffic (each call's interval at the endpoint) and the store (each tool call's), so
   * an overrun says whose it was (live-run finding H-h). The first execution failed at 2,406 s of 2,400 s with nothing
   * beside the two figures, and a request was open at the endpoint for all but seven seconds of it. An overrun while
   * the run was still progressing and the product held almost none of the wait is the WINDOW's bound — a NOTE, and
   * `LIVE_RUN_DURESS_MS` is what asks the longer question; the owner's forty minutes stay the default (docs/proofs/live-run.md).
   * "Still progressing" is read only from what ENDED ON ITS OWN before the wait ran out — a request the quit cut off
   * ends at the quit whatever it was doing, so a stream hung from early in the wait would otherwise read as progress.
   */
  const durRecords = readTraffic('duress');
  const durTraffic = durRecords.map(trafficCall);
  const durCalls = read === null ? [] : readToolCalls(read.session.session_id);
  // A wait on children is not a tool running: `overrunReading`'s `toolIntervals` leaves it out (finding H7 at 27a5127).
  const deadline = overrunReading({ log, startedAt, endedAt: startedAt + elapsed, records: durRecords, calls: durCalls, budgetMs: DURESS_MS, recorded: proxy !== null });
  if (deadline.outcome === 'window') noted('the long run was bounded by the window, not by the product', deadline.detail);
  else check(deadline.outcome === 'inside', 'the long run reached its result inside the wait', deadline.detail);
  checkPricing('duress', read?.session);
  if (read === null) check(false, 'the long run left a session row', 'no session was recorded at all');
  else {
    const sessionId = read.session.session_id;
    // The autopsy is written FIRST, because the checks below read it. `preserveRun` never throws.
    preserveRun('duress', sessionId);
    const autopsyFile = join(scenarioDir('duress'), 'autopsy.txt');
    const autopsy = existsSync(autopsyFile) ? readFileSync(autopsyFile, 'utf8') : '';
    const coherent = (label) => new RegExp(`${label}: (true|false|unasked)`).exec(autopsy)?.[1] ?? null;
    if (autopsy === '') check(false, 'the autopsy reader produced a reading of the long run', 'autopsy.txt is absent or empty');
    else {
      // A session that never stopped is not a stopped run, so the question is unasked rather than passed (H-c).
      const nullSummary = coherent('null summary on stopped run');
      if (nullSummary === 'unasked') noted('the null-summary question is unasked: the long run never stopped', `execution_status ${read.session.execution_status}, stop_reason ${read.session.stop_reason ?? 'none'}`);
      else check(nullSummary === 'false', 'a stopped run did not end with a null summary', `autopsy says ${nullSummary}`);
      /*
       * "Zero cost with tokens" is only incoherent where a cost COULD have been computed. This check used to condition
       * itself on the endpoint's accounting kind, because the reader answered `true` for any zero cost beside tokens —
       * on katalyst, unpriced, that read `true` against 18,810 tokens with nothing wrong (the 2026-09-22 `faults` pack).
       * The reader now reads the session's own `cost_qualifier` and answers `false` where no request had a figure
       * (`lib/autopsy-coherence.mjs`, live-run finding K2(b), 2026-09-29), so the question is asked as it stands.
       */
      check(coherent('zero cost with tokens') === 'false', 'tokens were not recorded against a zero cost where a figure existed', `autopsy says ${coherent('zero cost with tokens')}`);
    }

    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    let children = [];
    let compressed = 0;
    let aggregate = null;
    try {
      children = db.prepare('SELECT canonical_name, given_name, persona, state, tool_calls, report FROM children WHERE session_id = ? ORDER BY spawned_at').all(sessionId);
      compressed = db.prepare("SELECT COUNT(*) AS n FROM timeline WHERE session_id = ? AND name = 'context_compressed'").get(sessionId)?.n ?? 0;
      aggregate = db.prepare('SELECT compressions FROM sessions WHERE session_id = ?').get(sessionId)?.compressions ?? null;
    } finally { db.close(); }
    const reportOf = (child) => { try { return JSON.parse(child.report ?? '{}'); } catch { return {}; } };
    const calls = durCalls;

    // A run that commissioned nobody asked none of the questions below. That is a fact about the model and the
    // fixture, not a fault of the product, so it is a NOTE — and the checks that depend on it say so too.
    // Six were asked for, over three dependent waves. Fewer is a fact about the model, not a fault of the
    // product, so it is reported rather than failed — but how many arrived decides whether this run reached
    // the depth the scenario is named for, and a reader should not have to count the list to find out.
    if (children.length === 0) noted('the long run commissioned no children', `fixture ${basename(workspaceFixture)}; delegation was asked for and not taken, so the child-record checks are unasked`);
    else if (children.length < 6) noted('the long run commissioned fewer children than it was asked for', `${children.length} of 6 across three waves — it did not reach the depth this scenario is for`);
    else {
      noted('what the long run commissioned', children.map((c) => `${c.given_name} [${c.persona}] ${c.state}, ${c.tool_calls} calls`).join('; '));
      // The eighty-second defect's shape at the child level: four of eleven children died with an empty
      // `final_response` because a model timeout was read as a user abort. An empty report from a failed child
      // is the observable, whatever the cause underneath it — but an empty `final_response` alone is not one:
      // REQ-ORCH-110 leaves it empty for a child cut off mid-work, whose `last_response` and `cut_off` say what it
      // did (H-a). An error entry alone says nothing: the product writes one on every failed child, and the
      // eighty-second's children carried one naming the abort and nothing else.
      const silent = silentFailedChildren(children, reportOf);
      check(silent.length === 0, 'no child ended failed with nothing to say', silent.length === 0 ? 'every failed child reported' : `${silent.length}: ${silent.map((c) => c.given_name).join(', ')}`);
      // The eighty-eighth: `commands: []` was hardcoded at all three construction sites, so a child that ran
      // eight commands reported none. Derived from the transcript now; this is the live reading of that.
      // A call names its agent by the canonical name, never the given one (H-b).
      // And only a child with a report is asked: one paused at the deadline or still running has none yet.
      const { asked: ranCommands, mute, unsettled } = commandsReading(children, calls, reportOf);
      if (unsettled.length > 0) noted('a child that ran commands had not settled, so has no report to list them in', unsettled.map((c) => `${c.given_name} (${c.state})`).join('; '));
      if (ranCommands.length === 0) noted('no settled child ran a terminal command', 'the report.commands reading is unasked this run');
      else check(mute.length === 0, 'every child that ran a command reported its commands', mute.length === 0 ? `${ranCommands.length} child(ren) reported theirs` : `${mute.length} reported none, e.g. ${mute[0].given_name}`);
    }

    // The eighty-seventh: the session `compressions` aggregate was declared, rehydrated, copied into every save
    // and never added to — three `context_compressed` entries against a persisted 0 (REQ-SESSION-139, ADR-0008).
    // Why not is the size of the largest prompt against the trigger, never the iteration count (H-d).
    if (compressed === 0) {
      const yaml = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : '';
      const setting = (key) => { const m = new RegExp(`^\\s+${key}:\\s*(\\d+)\\s*$`, 'm').exec(yaml); return m === null ? undefined : Number(m[1]); };
      const prompts = durTraffic.map((c) => c.promptTokens).filter((t) => t !== null);
      const trigger = compressionTrigger({ contextTokens: endpoint.contextTokens ?? null, thresholdPercentage: setting('threshold_percentage'), defaultThreshold: setting('default_threshold') });
      noted('the long run never compressed its context', compressionNote({ largestPrompt: prompts.length === 0 ? null : Math.max(...prompts), trigger, calls: { withUsage: prompts.length, total: durTraffic.length } }));
    }
    else check(aggregate === compressed, 'the compressions aggregate counted what the timeline recorded', `aggregate ${aggregate} against ${compressed} timeline entr${compressed === 1 ? 'y' : 'ies'}`);

    const leaked = calls.filter((call) => call.tool_name === 'terminal' && /__rot_/.test(call.result));
    check(leaked.length === 0, 'no end marker leaked into what the model read', leaked.length === 0 ? 'no __rot_ in any terminal result' : `${leaked.length} call(s), e.g. ordinal ${leaked[0].ordinal}`);

    // Whether this run was duress at all. Said plainly rather than inferred from a green: a scenario built for
    // the long path that finished in four minutes has measured the short path under a longer deadline.
    noted('how long the long run was', `${Math.round(elapsed / 1000)} s, ${read.session.iterations_completed} iteration(s), ${calls.length} tool call(s), ${children.length} child(ren), ${compressed} compression(s) — fixture ${basename(workspaceFixture)}`);
    // The ceiling is written into the sandbox once for every scenario, so the long run inherits the smoke
    // test's. A run that stopped at it was bounded by the harness and not by the work, and the difference is
    // invisible in a green: `--max-iterations` is what raises it.
    if (read.session.iterations_completed >= MAX_ITERATIONS) noted('the long run stopped at the iteration ceiling', `${MAX_ITERATIONS} iterations — it was bounded by --max-iterations, not by the work; raise it to ask the longer question`);
    results.scenarios.duress = {
      fixture: basename(workspaceFixture), elapsedMs: elapsed, budgetMs: DURESS_MS, childTimeoutS: DURESS_CHILD_TIMEOUT_S,
      status: read.session.execution_status, stopReason: read.session.stop_reason,
      iterations: read.session.iterations_completed, toolCalls: calls.length, compressions: { aggregate, timeline: compressed },
      children: children.map((c) => ({ name: c.given_name, persona: c.persona, state: c.state, toolCalls: c.tool_calls, commands: (reportOf(c).commands ?? []).length })),
    };
  }
  await budgetGate();
}

await budgetGate();
const spentTokens = (results.tokens?.input ?? 0) + (results.tokens?.output ?? 0);
if (accountingKind === 'unmetered') noted('no ceiling was imposed', `${spentTokens} tokens over the run; this endpoint is registered unmetered`);
else if (typeof results.spentUsd === 'number') check(results.spentUsd <= BUDGET, `the spend stayed under the ${BUDGET.toFixed(2)} USD ceiling`, `${results.spentUsd.toFixed(4)} USD`);
else check(spentTokens <= MAX_TOKENS, `the run stayed under the ${MAX_TOKENS} token ceiling`, `${spentTokens} tokens`);
finish(0);
