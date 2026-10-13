# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered)

> **In the record since 2026-10-13** (fin41, `fin41-comments-and-evidence`). Written on 2026-10-06 in the orchestrator's
> session scratchpad by a read-only examination of the default live pack `2026-10-06T15-47-11-941Z` at `c2fdd6a`, and copied here unchanged so the record that
> cites it does not depend on the container. Only two things were added: this note, and an HTML comment on each line
> that names a defect note at the path it was proposed under (every such note now sits in `docs/defects/fixed/`).
> Paths under `scratchpad/` and `/home/user/Rotaris-crw-wt-live/.live-run/` name the orchestrator's container: the
> packs are git-ignored and are not carried into the repository. No host, URL, key or token is quoted. The index is
> [`README.md`](README.md).

- **Pack:** `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-06T15-47-11-941Z/`. I copied it to
  `scratchpad/c2f/pack/` and read the copy, so the pack itself was never opened for writing.
- **Console:** `scratchpad/live-c2fdd6a-default.log`. The run took 15:47:11 to 16:02:19 UTC and ended `live-run PASSED`:
  143 PASS, 0 FAIL, 13 NOTE (`results.json`).
- **Code and record:** `/home/user/Rotaris-crw-wt-live`, detached at `c2fdd6a`. Nothing was built or launched there, and
  no live run or proof was started. The only program I executed in that tree was the read-only reader
  `apps/desktop/scripts/autopsy.mjs`, against the copied store. The run's sandbox under `/tmp/rotaris-live-run/` no longer
  exists, so the workspace's files are known only through the store, the logs and the traffic.
- **Method:** `.agents/skills/run-autopsy/SKILL.md`, steps 1 to 6, applied to all 8 sessions and to the 2 launch-only logs
  (sign-in, shell). For every session, the reader's output equals that scenario's `autopsy.txt` apart from the store path
  and one trailing blank line. I then read:
  - the store's `sessions`, `iterations`, `children`, `tool_calls`, `issues`, `timeline`, `transcript_rows`, `events`,
    `launch_audits` and `agent_fingerprints`;
  - every `model-traffic.jsonl`, parsed request by request (timing, usage, tools offered, system prompt and its SHA-256,
    reasoning characters, calls emitted);
  - every `app.log`, `session.log` and `transcript.md`, all 16 PNGs, and the pack's `agents.yaml`.

  I checked each finding against `docs/defects/` (7 open notes) and `docs/defects/fixed/` (485 notes) at `c2fdd6a`.
- **Conventions:**
  - `#N` is a `tool_calls.ordinal`.
  - "row N" is a `transcript_rows.row_index`.
  - "traffic #N" is the 0-based line of that scenario's `model-traffic.jsonl`.
  - A prompt is named by the first 10 hex digits of its SHA-256.

## Verdict

The run is clean, and the 2026-10-06 rulings hold wherever this pack reaches them:
- **Exercised and holding (13):** OQ-162, OQ-105, OQ-202, REQ-TOOLS-135 (G6), OQ-119, OQ-127, OQ-157, G8, G5, OQ-115,
  OQ-194, H4 and OQ-114.
- **Broken:** none.
- **Not exercised (9):** REQ-TOOLS-032 for MCP (G3), OQ-116 mid-pass, OQ-139, OQ-163, OQ-199, OQ-177, OQ-185, OQ-188 and
  OQ-189.
- **Fixed notes:** none recurred.
- **Findings:** none blocks a release or degrades a run. Three new findings, all cosmetic:
  - **K1** (product defect): the run header floors the run's duration and the inspector's run-level row rounds the same
    interval, so they read a second apart.
  - **K2** (owner question): REQ-ORCH-029's todo-list clause reaches the coordinator only as instruction text, and three
    coordinators finished multi-step work with no plan of their own.
  - **K3** (product defect): the ROUTE playbook text tells the coordinator that "the coordinator routed it to you".

The largest cost is still the fixed figures OQ-114 keeps, now ruled. About 53 s of classification sat on the critical
path, 35.9 s of it in three 12 s fallbacks (edit, resume, terminal). About 91 s of report summarising ran with no other
model request in flight, mostly while a parent waited on it. Together that is roughly 144 s of 817 s of session wall
time.

## Sizing

| scenario | session | wall (created → last update) | requests | in / out tokens | tool calls (failed / blocked) | intent |
|---|---|---|---|---|---|---|
| ask | 3ce37ae3 | 15.2 s | 5 | 28,140 / 703 | 2 (0/0) | question 0.97 |
| edit | 8a7d0d7c | 133.7 s | 29 | 357,385 / 12,614 | 31 (0/0) | moderate_feature (12 s fallback) |
| resume | 1248a1f2 | 90.3 s (21.8 s + 68.2 s; rested 0.29 s) | 25 | 278,644 / 8,225 | 17 (2/0), plus 5 the pause stopped before they ran | moderate_feature (12 s fallback), carried at the Continue |
| requirements (board) | bef9de1f | 198.5 s | 41 | 539,320 / 13,593 | 48 (1/1) | small_feature 0.92 |
| frictions | 21ebbb5d | 20.8 s | 8 | 65,152 / 1,142 | 5 (0/0) | explicit_trivial 0.99 |
| faults-ladder | 055e5eba | 13.5 s | 6 (2 injected) | 18,554 / 326 | 1 (0/0) | question 0.94 |
| faults-stall | 64426c61 | 131.3 s | 6 (1 stalled) | 18,554 / 582 | 1 (0/0) | question 1.0 |
| terminal | 09450abb | 213.8 s | 24 | 301,477 / 9,192 | 21 (4/1) | moderate_feature (12 s fallback) |
| **total** | 8 sessions | **817.2 s** (27a5127: 924.4 s) | 144 | **1,607,226 / 46,377** | 126 (7/2) | |

**Accounting is coherent.**
- **Tokens.** In 7 of 8 sessions the store's totals equal the sum of `usage` in the traffic, to the token. faults-stall's
  traffic holds 8,778 in / 128 out more. That is the answer the proxy withheld (traffic #2, `aborted` after 120,738 ms),
  which never reached the product. The store's total, 1,653,603, equals the console's spend line and the last NOTE.
- **Counters.** In all 8 sessions:
  - `sessions.tool_calls` equals the session's rows;
  - `iterations.root_tool_calls` equals the root's rows;
  - each `children.tool_calls` equals that child's rows (for example terminal 7 + 14 = 21, requirements 19 + 16 + 13 = 48).
- **Cost.** 0 with `cost_qualifier: unknown` everywhere; the strip reads "n/a cost". Correct for an unpriced endpoint.
- **Summaries.** All 8 rows read `completed` / `tasks_complete` / "The run completed.". Resume's first run rested with
  "The run came to rest at the user's request." (`warning` notice, REQ-ORCH-082 rule 1).

**Where the time went.**
- **The product's own share is small.** Subtracting the union of request and tool intervals from each session's wall time
  leaves 0.3 to 1.3 s per session. The exception is faults-ladder at 7.3 s, which includes the two designed dispatch-layer
  waits of 2,005 and 4,002 ms.
- **The endpoint was healthy** apart from the injected faults.
- **Classification** took 53.1 s over 8 calls:
  - 5 completed in 2.5 to 4.2 s;
  - 3 were cut at the bound: edit 11,968 ms, resume 11,968 ms and terminal 11,959 ms, with 3,613 to 4,098 reasoning
    characters and no answer.
- **Report summarising**: 7 passes took 127.3 s, of which 91.2 s ran with no other model request in flight. The five passes
  that closed a parent's wait each ended 5 to 31 ms before that `wait_for_tasks` returned:

  | session | summariser time alone on the critical path |
  |---|---|
  | terminal | 31.2 s |
  | requirements | 22.5 s + 10.3 s |
  | resume | 16.5 s + 3.0 s |
  | edit | 7.7 s |

- **Ruled, not a defect.** OQ-114's ruling keeps both figures, so these are costs, not findings.
- **The post-run improvement analyst** was cut off at quit in all 8 sessions (the last traffic record of each, `aborted`).
  That is REQ-LIBRARY-127 at the harness's quit, as at `27a5127`.

## The rulings this run exercises

| ruling | status | evidence in this pack |
|---|---|---|
| **OQ-162** / PD-ORCH-005 rev. 7 clause 40 — Continue keeps the launch's intent and tools | **holds** | Resume, Continue pressed 15:50:37.106 (app.log). The next line is "intent: moderate_feature" at 15:50:37.217, with no `via json_schema` and no fallback wording. Timeline #10 `run_continuation_intent` at .217. resume.png reads "Intent: moderate_feature (continued from the previous run)". Of 25 requests only traffic #0 is a classification (the launch's, cut at 11,968 ms); none follows the Continue. The orchestrator's system prompt is `b5eafd7a46` with 24 tools before the pause (traffic #1, #2) and after it (#7, #23), so the playbook is unchanged. Every child request before and after the pause carries `383efeb362` (#3–#6, #8–#20). At `27a5127` (G1) the Continue classified again (8.6 s) and changed three playbook lines. |
| **OQ-105** / PD-ORCH-005 rev. 7 clause 14 — no `resumed_under_changed_instructions` on an unchanged persona; the fingerprint is the persona's own | **holds** | Resume has 2 issues, both `terminal_shell_failure` (a child's own checks); no `resumed_under_changed_instructions`. `agent_fingerprints` holds 3 rows, all digests marked `persona:`. The root's instructions digest `6081cb864fe5…` equals the SHA-256 of the orchestrator's prompt up to its PLAYBOOK block; the whole request prompt hashes to `b5eafd7a46f2…`. Each child's `e1f0c4598e9e…` equals the SHA-256 of the coding-agent persona's own 162-character prefix. |
| **OQ-202** / PD-ORCH-006 — on `explicit_trivial` the coordinator does the work itself and is told so | **holds** | Frictions' launch audit records `intent_grant: direct-work`. Traffic #1 offers 29 tools including `write_file` and `terminal`. Its prompt opens "You are the orchestrator. For this run you hold the tools to read and write files and run commands yourself: do the work with them rather than handing it to a specialist…" and no longer says it modifies no files. Traffic #1 took 2,964 ms, 112 output tokens and 231 reasoning characters ("Let me do the file creation first, then the terminal."), and went straight to `write_file` (#1). At `27a5127` (G2) it took 14,495 ms and 1,034 output tokens. |
| **REQ-TOOLS-032** (G3) — an MCP call failing its advertised `inputSchema` is refused at the gate | **not exercised** | 8 MCP calls (`list_memories` ×3, `read_memory`, `write_memory` ×2, `get_diagnostics_for_file` ×2), each checked against the `parameters` offered in its request; every required field is present. 0 `invalid_request` rows. |
| **REQ-TOOLS-135** (G6) — an edit reports its lines | **holds** | Edit #16 `haet_edit`: "Edited src/todos.js: 4 lines replaced by 9 at line 38 (+5 -0)." This is the exact shape the repair note predicted for the `27a5127` case; requirements #17 is identical. Edit #26: "2 lines replaced by 25 at line 35 (+23 -0)". Creates: "9 lines created", "14 lines created", "1 line created". No agent re-read a file to check a count. |
| **OQ-116** / PD-ORCH-008 — tool-call totals current while a pass runs | **not exercised (mid-pass)** | No capture shows the session-wide total during a pass. terminal.early.png (16:00:01.8) shows only the child's live count, "6 tool calls" (5 completed, 1 in flight); 7 calls had completed in the session by then. At the end every persisted counter equals its rows in 8 of 8 sessions (Sizing). |
| **OQ-119** / PD-ORCH-007 — the summariser sees the whole brief | **holds** | All 7 summariser requests contain their child's `delegate` task verbatim. Four tasks exceed 2,000 characters (2,133; 2,849; 2,915; 3,354). The transcript part of each request is held to 12,000 characters, for example requirements traffic #36: 4,379 characters of facts, then a 12,001-character "Transcript:" section including its newline. |
| **OQ-127** / PD-MONITOR-005 rev. 2 — one stall issue per throttled warning; the watchdog's facts on the timeline; intended states at INFO | **holds** | faults-stall writes exactly 1 `stall` issue (15:58:01.021, 94 s) beside its one warning; `27a5127` wrote 6. Timeline: `stall_recovered` (15:58:31.026, `info`); terminal `waiting_on_tools` (16:00:58.844, `info`). Session logs at INFO: REQ-MONITOR-118's wait (terminal 16:00:58.843), the pause's "2 child(ren) left paused by pause" (resume 15:50:36.915) and REQ-MONITOR-120's recovery (faults-stall 15:58:31.025). The whole run logs 5 warnings, none of them an intended state: `git_commit` executor_absent; two dispatch-layer retries; the stall; the transient failure. `27a5127` had 10 warnings, 5 of them intended states. |
| **OQ-157** / PD-ORCH-014 — every timeline name inside the vocabulary | **holds** | 19 distinct names across 8 sessions, all among the 71 words of `tools/check-timeline-vocabulary.mjs`'s `VOCABULARY`. These include `run_pause_requested`, `child_paused`, `iteration_paused`, `run_continuation_intent`, `iteration_resumed`, `child_resumed`, `notice`, `context_selection`, `stall_recovered` and `waiting_on_tools`. |
| **G8** — a continuation's run duration counts its pre-flight | **holds** | Resume `run_started_at` 15:50:37.212 precedes `run_continuation_intent` at 15:50:37.217 (the repair note's own check); the Continue was pressed 106 ms earlier. The second `session.end` reads `duration_seconds` 68.22. resume.png "Completed 1:08", inspector "1m 8s", Overview "1:08". With no classification on the Continue, the pre-flight is now about 5 ms, so G8's 8.6 s shape cannot recur here either. |
| **G5** — a run completes only when the coordinator's own plan agrees | **holds** (the agreeing case; the re-queue branch not reached) | Requirements: the agent plan holds 3 of 3 `COMPLETED` (#30, #46, #47) before the answer (traffic #39). Terminal: 2 of 2 `COMPLETED` (#20, #21, 16:02:02–04) before the answer (traffic #22); terminal.png "2 of 2 tasks done" beside "Completed 3:33" (`27a5127`: "1 of 2"). Each closed its plan unprompted; 1 iteration each. |
| **OQ-139** / PD-TOOLS-007 — `write_file` without an operation creates a missing file | **not exercised** | `write_file` ×3 (resume #9, #13; frictions #1), each sending `operation: create`. |
| **OQ-163** / PD-TOOLS-008 — a todo refusal's wording | **not exercised** | `todo replace` ×2 (requirements #8, terminal #1), both accepted, one task `IN_PROGRESS` each. |
| **OQ-115** / PD-MCP-001 — the manual tool's description | **holds** | In the MCP section of all 7 distinct agent prompts, and in the tool definition, `initial_instructions` reads "Returns the code-intelligence server's manual: how its symbol, search, edit and memory tools are meant to be used together. The other tools work without it; fetch it only when that guidance would help with the task at hand." 0 calls to it in 126 (`27a5127`: 2 calls, 2.6–2.9 s each). |
| **OQ-194** / PD-MCP-002 — an isolated run's MCP servers rooted in its tree | **holds** (the part a default run launches) | Requirements app.log 15:52:00.358: discovery "(project …/.rotaris/requirements/worktrees/rotaris-req-req-104-u1)"; 15:52:05.551: connected "(… project …/rotaris-req-req-104-u1)". Behaviourally, the worktree's `list_memories` (#1) answered `{}` where the main checkout's (edit #23, terminal #18) answered `["memory_maintenance"]`. The worktree's `write_memory` "verification-baseline" (#48) is absent from the main checkout's later listing (terminal #18). No filesystem or `lsp` server is configured, so those clauses are not exercised. |
| **H4** — the prompt's instruction files closed before the MCP section | **holds** | All 7 distinct agent system prompts put "<!-- end of instruction files: nothing below this line is part of them -->" before "## MCP servers". Requirements' source marker names the worktree's `AGENTS.md`. |
| **OQ-199** / PD-ORCH-009 — a coordinator that writes no answer is asked once more | **not exercised** | All 8 coordinators' last requests ended `stop` with text (138 to 3,071 characters). |
| **OQ-114** / PD-ORCH-004 rev. 5 — a continuation's parent told it starts with no memory | **holds** (the `delegate` half) | Every coordinator request's `delegate` description carries "A continuation starts with no memory of the child it continues: write its task as a complete brief of what was asked, what that child did and found, and what remains." No child was cut off, so the continuation offer was not exercised. |
| **OQ-177, OQ-185, OQ-188, OQ-189** — model switches, Keep waiting, helper calls, out-of-quota model | **not exercised** | The run recorded none of `entry_model_switched`, `model_override`, `model_exhausted` or `quota_fallback_model`. No `model_wait` issue, and `model_slot_queue` is empty. The injected 429 was absorbed by the dispatch layer (2,005 ms). |

## The previous default run's findings (`27a5127`, G1 to G11), in this pack

| id | status here | evidence |
|---|---|---|
| G1 — Continue classifies again and changes the playbook | **gone** | OQ-162 above |
| G2 — direct-work bundle against "you do not modify files" | **gone** | OQ-202 above |
| G3 — MCP calls bypass the gate's schema check | **not exercised** | REQ-TOOLS-032 above |
| G4 — classifier and summariser on the critical path | **ruled (OQ-114, figures kept)** | about 144 s this run (Sizing) |
| G5 — success with the coordinator's plan item pending | **holds** | above |
| G6 — edit reports the old string's line count | **gone** | above |
| G7 — folded "Blocked" rail breaks mid-word | **gone** | requirements.early.png (1264×800): the folded rails read "Ready", "Review", "Needs Update", "Done", "Blocked", each label whole |
| G8 — continuation timing skips its pre-flight | **gone** | above |
| G9 — intended states at WARNING | **gone** | OQ-127 above |
| G10 — fourteen explicit nulls in the starter | **gone** | the pack's `agents.yaml` carries 12 nullable keys (9 still null after the harness fills 3 slots), none of them `retrospective_model` |
| G11 — timeline names outside the vocabulary | **gone** | OQ-157 above |

## Fixed notes re-checked: none recurred

| note | what this pack shows | verdict |
|---|---|---|
| `continue-classifies-the-intent-again-and-widens-the-resumed-roots-tools-mid-iteration.md` | OQ-162 row | holds |
| `a-continuations-run-timing-starts-after-its-pre-flight-where-a-launchs-counts-it.md` | G8 row | holds |
| `the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md` | G5 row | holds (agreeing case) |
| `an-edit-reports-the-old-strings-line-count-as-the-lines-it-changed.md` | G6 row | holds |
| `an-mcp-tool-call-that-fails-its-advertised-input-schema-reaches-the-server.md`, `an-advertised-schema-marked-async-compiles-a-check-that-never-refuses.md` | no schema-failing MCP call | not exercised |
| `the-folded-blocked-rail-breaks-its-label-inside-the-word.md` | G7 row | holds |
| `the-users-own-pause-is-logged-at-warning.md` | resume session.log 15:50:36.915 INFO | holds |
| `the-run-writes-timeline-events-outside-its-closed-vocabulary.md` | OQ-157 row | holds |
| `the-starter-agents-yaml-writes-fourteen-explicit-nulls-where-the-specification-names-twelve.md` | G10 row | holds |
| `nothing-marks-where-the-last-instruction-file-ends-so-agents-read-the-mcp-section-as-part-of-it.md` | H4 row | holds |
| `write-files-first-use-refusal-recurred-under-duress.md`, `a-rejected-todo-replace-names-an-active-task-it-never-stored.md` | 3 of 3 `write_file` sent `operation`; no `replace` refused | not exercised |
| `a-disabled-servers-unresolved-placeholder-line-says-a-key-would-make-it-available.md`, `the-unresolved-placeholder-warning-names-no-configuration-file.md` | 10 of 10 launches: "…in its url, from the built-in defaults, could not be resolved …; the server is disabled by its configured 'enabled: false' (REQ-CONFIG-465), so nothing connects to it, and enabling it will also need the placeholder resolved" (`info`) | holds |
| `the-repository-card-and-the-git-view-count-uncommitted-paths-differently.md` (ruled as built, OQ-201) | shell app.log: card `touched=4 uncommitted=2`, Git view `uncommitted=4`; shell.png "4 files touched · 2 uncommitted" | as ruled |
| `the-run-timer-counts-from-the-newest-row-not-from-the-model-call-in-flight.md` (PD-CHAT-008) | terminal.early.png "Run active 0:23", 80 s into the run, with the 30 s wedge in flight since the newest row | as ruled |
| `the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md` | no `git status` in either checkout (edit #20, resume #11/#15, requirements #26/#38/#45) lists `.gitignore` or `.serena` | holds |
| `a-first-run-workspace-never-gets-the-starter-agents-yaml.md` | sign-in app.log 15:47:15.348 "configuration bootstrap at the open of …/workspace: written"; 15:47:19.899 "…: exists" | holds |

---

## Run autopsy — 1248a1f2-653e-4f66-acb2-6e35dbbf2a59 (resume, v1-4ec58051303c4300829be798789f98db, 90.3 s over 2 runs, 278,644 in / 8,225 out)

**The launch.** Classification was cut at 11,968 ms (traffic #0, 4,098 reasoning characters, fallback `moderate_feature`).
Two background coding children started at 15:50:34.40 and 15:50:34.47.

**The pause.** Pause was pressed at 15:50:34.719 and accepted at .742. The current step finished, and both children were
paused at 15:50:36.871 and .910. The run rested `paused` at 15:50:36.924. Five calls emitted at the step's end were not
run (rows 7 to 11, `blocked`, "This call was not run: it was interrupted by the pause before it started…"); this is
PD-ORCH-005 clause 2, as built.

**The Continue** was pressed at 15:50:37.106. It made no classification; the intent was carried (OQ-162 row). Both
children resumed under their own ids, and the iteration closed `succeeded` at 15:51:45.436.

### 1. Spec-faithful and harness observations (no finding)
- **Transcript row 13** reads "Intent classified: moderate_feature (continued from previous run)" although nothing was
  classified. REQ-SESSION-114 fixes that row's wording, so it is spec-faithful. The header's "(continued from the previous
  run)" is the clause-40 wording.
- **The two `terminal_shell_failure` issues** (#6 exit 2, #10 exit 1) are notes-functions' own `ls` and `grep` checks
  (REQ-SESSION-136).
- **The summariser held the parent's wait** for 16.5 s (traffic #22, which ended 13 ms before #5 returned). OQ-114 keeps
  that figure.
- **Harness scenario order, not the product:** both children spent turns proving that `src/todos.js` and
  `src/todos.test.js`, modified in the shared workspace, were not theirs (#12, #16: `git diff --stat` with `ls -l`
  mtimes; rows 30, 32, 40, 42). These are the edit scenario's uncommitted changes, which the harness leaves in the workspace
  the next scenario uses.

## Run autopsy — 21ebbb5d-3020-4f93-98cf-8eaab894af5b (frictions, v1-4ec58051303c4300829be798789f98db, 20.8 s, 65,152 in / 1,142 out)

`explicit_trivial` (0.99). The coordinator made 5 calls, all `ok`:
- `write_file create` ("1 line created");
- a background `node`;
- a SIGINT;
- a `query` that read "killed (exit -1)";
- `cat -A`.

No todo list; see K2.

### 1. Spec-faithful (no finding)
- **The one warning** is `git_commit` "removed from orchestrator by prerequisite (executor_absent)" (15:55:39.753). It stays
  a warning as `coordinator-only-removals-are-logged-as-warnings.md` ruled.
- **The first request** answered without reasoning about a contradiction (OQ-202 row).

## Run autopsy — bef9de1f-36aa-4b85-8b54-eedea1e140d1 (requirements, v1-4ec58051303c4300829be798789f98db, 198.5 s, 539,320 in / 13,593 out)

The board released REQ-104 u1 at 15:51:57.076. The run was confined to `.rotaris/requirements/worktrees/rotaris-req-req-104-u1`
with checkpoints enabled. Classification: `small_feature` 0.92 in 3,650 ms.

The run went:
1. the implementer (16 calls), in the background;
2. the coordinator's review reads (#27–#29);
3. the verifier (13 calls; `context_selection`: 1 sibling artifact);
4. checkpoint 1 over 3 files;
5. completion, the board's review, and the accept to done (requirements.png: "Accept recorded for REQ-104. The review you
   were reading is out of date. [Reload the review]").

### 1. Model behaviour meeting spec-faithful refusals (no finding)
- **#15 `haet_edit` failed** with "src/todos.js changed since the hash you hold was taken…" (issue 1, `tool_error`).
  - The agent never held a hash. It had read the file with `read_file` (#11), which carries no `content_hash`; its
    request (traffic #10) contains no hash anywhere, so `8dc3ee1b…` was invented.
  - The refusal's wording is REQ-TOOLS-189's.
  - The agent recovered in one step: `haet_read` (#16), then #17.
  - Cost: 1 failed call, 1 issue, about 1.6 s.
- **#41 refused by `starter:deny-recursive-delete`** (REQ-TOOLS-038; issue 2 `permission_denied`). The verifier's baseline
  script; it recovered with `rm -f` and `rmdir` (#43, #45).

## Run autopsy — 09450abb-a3a5-4971-b9f0-8a09bd28b090 (terminal, v1-4ec58051303c4300829be798789f98db, 213.8 s, 301,477 in / 9,192 out)

**The classification and the delegation.** Classification was cut at 11,959 ms (traffic #0), so the run fell back to
`moderate_feature` and the coordinator was coordination-only. Its first request (traffic #1) took 31,247 ms and 6,043
reasoning characters weighing whether to delegate a task that said "run each of the following in the terminal". It then
delegated the sequence to one coding child, and its `wait_for_tasks` was held for 140.4 s.

**The 13 shapes.** The child attempted all 13 shapes in 14 terminal calls (#4 to #17), and every terminal check passed:
- `exec bash` (#6) and `exit 3` (#8) gave `execution_error` with `session_reset`;
- `${PIPESTATUS[0]}` (#7) exited 2 in 38 ms;
- the wedge soft-paused at 30.0 s (#9, #13);
- the poll after C-c gave `execution_error` −1 (#12);
- #14 reported the paused command's end and its `slept`.

### 1. Spec-faithful (no finding)
- **#17 refused by `starter:deny-pipe-to-shell`** (REQ-TOOLS-036/038).
- **REQ-MONITOR-118's wait** is logged at INFO and written to the timeline as `waiting_on_tools` (16:00:58.844).
- **The summariser's pass** (traffic #18, 31,249 ms) ended 31 ms before the foreground wait returned (OQ-114, kept).
- **The 31 s deliberation and the delegation hop** follow from the 12 s fallback's `moderate_feature`. `27a5127` classified
  this prompt `exploration` and `1763f7f` `explicit_trivial`; the classification is the model's, and the bound is ruled.

## Run autopsy — 8a7d0d7c-31ad-4319-b39d-cfd414a15772 (edit, v1-4ec58051303c4300829be798789f98db, 133.7 s, 357,385 in / 12,614 out)

**Classification** was cut at 11,968 ms (traffic #0, 3,631 reasoning characters), falling back to `moderate_feature`.

**The children.** Two write-scoped coding children ran in parallel: the implementer with 11 calls on `src/todos.js`, the
tests child with 10 on `src/todos.test.js`. `node --test` is green 10/10, and the diff is 2 files, +29 −1. No call
failed. No agent wrote outside its scope (NOTE 2).

**The coordinator** made 10 calls and no `todo` call (K2).

**The agents' "tension" rows** (rows about "arrow-function body" against the file's `export function` style) come from
the coordinator's own task text (#6), so they are model behaviour.

## Run autopsy — 3ce37ae3-7ed7-4d7b-b7fa-892831f2bcea (ask, 15.2 s, 28,140 in / 703 out)

One `read_file` and one `grep`. The answer names the file's six exports, which is correct. The setup ran beside the run and
completed during it (`code-intelligence-setup → success` at 15:47:36.729).

**Model behaviour, not the product.** Traffic #2's reasoning (row 3) answers "a correction: `toggle` instead of
`toggleTodo`", and traffic #3's reasoning (row 5) answers a "hint" about a toggle "that matches on array position". Neither
text is in any request: the request bodies contain no "correction", "hint" or "position". The model invented both. Cost:
the extra `grep` (#2) and a turn, about 4 s.

## Run autopsy — 055e5eba-d035-4bfb-95cf-58389f5ca38e (faults-ladder, 13.5 s, 18,554 in / 326 out)

The dispatch layer absorbed the injected 429 (traffic #1) and 500 (traffic #2), waiting 2,005 ms and then 4,002 ms, with
two `warning` lines naming REQ-CONFIG-086. 0 issues; completed. No finding.

## Run autopsy — 64426c61-22f1-4882-b86c-bbaf0eae25e6 (faults-stall, 131.3 s, 18,554 in / 582 out)

The stall was injected at traffic #1. The run wrote one `stall` issue and one warning at 94 s. faults-stall.stalled.png
(15:58:15.8) reads "stalled 104s", the live figure the callback keeps. At 15:58:26.739 came `transient_llm_error` "retry 1
of 1 … no stream activity for 120000 ms". `stall_recovered` (info) followed at 15:58:31.026, and the run completed. The
answer names seven exports, which is correct for the shared workspace after edit. Spec-faithful; no finding.

## Launch-only logs — sign-in and shell (no session)

- **sign-in.** The starter `agents.yaml` was written at the open, and sign-in.png's notice reads "Added …; discovered 1
  model." (the endpoint's display name elided). The provider list follows REQ-PROVIDER-140's order by id (`claude-code`, `codex`, `concrete-cloud`, `copilot`,
  `deepseek`, `openai-compatible`). The background setup was cut at the quit during `index` ("the run is cancelled and
  nothing is recorded for it", then "→ failure — … the run host exited before the setup finished", both `info`); the next
  launch found it pending and completed it. Unchanged since `1763f7f`.
- **shell.** Overview lists 4 sessions, with duration labels 3:18, 1:08, 2:13 and 0:15. The repository card is as OQ-201
  ruled.

---

## Cross-session findings

### K1. Show one run's duration a second apart in the run header and the inspector's run-level row
- **Class**: bug (cosmetic)
- **Status**: new
- **Evidence**:
  - **Screenshots.** Each pair below is the header's frozen value against the inspector's run-level row, for one interval:

    | screenshot | header | inspector | interval |
    |---|---|---|---|
    | edit.png | "Completed 2:13" | "orchestrator done · 2m 14s" | 133.67 s, `run_started_at` 15:47:52.310 to `updated_at` 15:50:05.981 |
    | terminal.png | "3:33" | "3m 34s" | 213.79 s |
    | frictions.png | "0:20" | "21s" | 20.74 s |
    | resume.png | "1:08" | "1m 8s" (they agree) | 68.22 s |

  - **One interval, two roundings.** Both read `session.runStartedAt` to `session.updatedAt`:
    `packages/ui/src/agents.ts:114` for the run-level row, and `runTimingSeconds` at `packages/ui/src/composer.ts:489-499`
    for the header.
    - The header's `formatDuration` floors (`composer.ts:465`), as the session list does (Overview "2:13", "3:18").
    - `elapsedLabel` (`packages/ui/src/AgentTree.tsx`) uses `Math.round`.
  - **Spec.** REQ-CHAT-158 freezes the header at "that run's total wall-clock duration", and REQ-MONITOR-107 fixes the
    agent's figure at "the difference between its completion and spawn timestamps"; neither fixes the rounding.
- **Cost**: none to the run. A reader sees two figures for one duration, side by side, in 3 of the 4 multi-second runs
  captured.

### K2. Ask the coordinator for a todo list by instruction text alone, though REQ-ORCH-029 says the constraint holds whatever the text
- **Class**: friction (owner question)
- **Status**: new
- **Evidence**:
  - **What REQ-ORCH-029 requires.** "work spanning more than one step is accompanied by a todo list it keeps current", a
    constraint that "MUST hold no matter what playbook cell or instruction text is in force" and is "externally checkable
    from the run's own records". PD-ORCH-006 keeps this clause binding on a direct-work run.
  - **Three coordinators did multi-step work with no plan of their own:**
    - edit: 10 calls, `delegate` ×2, `wait_for_tasks`, verification reads;
    - resume: 3 calls, `delegate` ×2 and a wait;
    - frictions: 5 calls; the user named two steps.

    None made a `todo` call. Their `sessions.todo` holds only the planner plan (schema 1, no `agent` plan), while the
    requirements and terminal coordinators wrote one (schema 2 with `agent`). All three runs completed.
  - **The clause reaches the model only as text.** It appears in `ORCHESTRATOR_COORDINATING`
    (`packages/engine/src/children/personas.ts:118`) and `DIRECT_WORK_INSTRUCTION` (`:126`). The G5 repair enforces the
    clause's sibling (no success while an item is open) but not this one.
- **Owner question:** is the product-kept planner plan the "todo list" this clause means? If it is not, how is the clause
  held beyond instruction text? The G5 note reads REQ-ORCH-029's "todo item" as the coordinator's own plan.
- **Cost**: none measured this run. The record cannot show the constraint holding on 3 of the 6 multi-step runs.

### K3. Tell the coordinator that "the coordinator routed it to you"
- **Class**: friction (cosmetic)
- **Status**: new
- **Evidence**:
  - **The text.** Every orchestrator request in all 8 sessions renders "ROUTE: Your assignment is inside the standard flow:
    the coordinator routed it to you by need and the rest of the run expects the outcome named in the task.". That is the
    catalogue's `routed` variant (`packages/engine/src/playbooks/catalogue.ts:11`), given to the entry role, which is the
    coordinator. It appears in the direct-work prompt as well (frictions traffic #1).
  - **Spec.** REQ-ORCH-026 fixes no variant text ("No variant text is fixed by this document"), so the text is the
    product's own. REQ-ORCH-019 puts the playbook in every role's instructions.
- **Cost**: none measured. No reasoning row cites it. Terminal's "routed these to a specialist" (traffic #1) is the model's
  own wording.

## The thirteen NOTE lines

| # | NOTE | verdict |
|---|---|---|
| 1 | sign-in: "code-intelligence discovery did not run in this launch" | **Correct.** The sign-in starts no run. Its setup was cut by the quit with nothing recorded, and ask's launch completed it. Hides nothing. |
| 2 | edit: "writes the gate refused for a live scope — none" | **Correct.** #16 wrote only `src/todos.js`; #25 and #26 only `src/todos.test.js`. The PASS above it (0 refusals) is vacuous, and this NOTE says so. |
| 3 | shell: "code-intelligence discovery did not run in this launch" | **Correct.** No run; initialization reported "0 pending". |
| 4 | frictions: "no call was refused at the tool gate as invalid_request" | **Correct.** 0 `invalid_request` rows. The 8 MCP calls of the run also met their advertised schemas, so G3's repair has no live evidence either. Hides nothing. |
| 5 | frictions: "no write_file call left out its operation" | **Correct.** 3 of 3 `write_file` calls sent `operation: create`, so PD-TOOLS-007 is unexercised. The PASS "no todo call was sent to a task id a refusal named" is likewise vacuous (0 refused `replace`). |
| 6 | "the stream-stall abort is not covered here" | **Correct.** faults-stall covers it in this run; the cited path exists. |
| 7 | "the exit-trace gap is not covered here" | **Correct.** It needs a crash, so that repair has no live coverage. The path exists. |
| 8 | faults-ladder: "the dispatch layer alone (2 absorbed retries); the ladder was not reached" | **Correct.** 2 dispatch-layer warnings, 0 issues, traffic #3 a 200 (OQ-110). The ladder stays unexercised. |
| 9 | faults-stall: "completed / tasks_complete after 1 iteration(s)" | **Correct.** Stall seen at 94 s, retried at 120 s, completed. |
| 10 | terminal: "what the model attempted — here-string×1 … pipe-to-shell×1" | **Correct.** 14 terminal calls (#4 to #17), 13 shapes, 2 polls. |
| 11 | terminal: "the wedge did not reach the hard cap" | **Correct, by design.** #9 and #13 soft-paused at 30.0 s; the 100 s bound is unmeasured. A coverage gap, not a defect. |
| 12 | terminal: "a read-only git pipeline through a pipe — blocked by starter:deny-pipe-to-shell" | **Correct, spec-faithful** (REQ-TOOLS-036/038). |
| 13 | "no ceiling was imposed — 1653603 tokens" | **Correct.** Equals 1,607,226 + 46,377, the store's 8 sessions. Aborted requests (8 analysts, 3 classifiers, the stalled answer) carry no usage. |

None of the thirteen hides a product defect.

## Unverified (no finding drawn)

- **OQ-116 mid-pass.** The pack holds no reading of the persisted session total during a pass. The end-of-run counters
  agree, but whether the displayed total tracked completed calls mid-pass is not shown.
- **REQ-NOTIFY-031's notice names the session by its identifier.** requirements.png reads "Session
  bef9de1f-36aa-4b85-8b54-eedea1e140d1 completed". The requirement says only "naming that session", while the session
  list names it by its prompt. Not judged a defect.
- **The setup cut at quit logs "→ failure"** right after "nothing is recorded for it" (sign-in, `info`). Nothing was
  recorded, and the next launch ran it. Unchanged since `1763f7f`.
- **Launch-time reads.** Each launch logs "prompt roots: 0 file(s)" two or three times, 60 to 700 ms apart. These are
  separate reads, not a double sink. Noise at `info`.

## Defect notes

- **Open notes this pack hits:** none of the 7 open notes is exercised by this run's evidence.
- **Fixed notes recurring:** none.
- **New, not recorded:** K1 (product defect, cosmetic), K2 (owner question against REQ-ORCH-029), K3 (product text,
  cosmetic). The brief made this examination read-only, so nothing was written to `docs/defects/`. CLAUDE.md's standing
  policy records such notes without asking.

**Highest-cost finding.** The cost remains OQ-114's ruled figures: about 144 s of classification and summarising on the
critical path in 817 s, including three 12 s fallbacks. The highest-cost new finding is **K2**, which costs nothing this
run but leaves a REQ-ORCH-029 constraint unchecked on half the multi-step runs. K1 to K3 are ready to be recorded in
`docs/defects/` (or K2 raised as an open question) on a go-ahead.
