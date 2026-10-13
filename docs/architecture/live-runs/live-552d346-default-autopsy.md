# Live-run autopsy — origin/main `552d346`, final default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered)

> **In the record since 2026-10-13** (fin41, `fin41-comments-and-evidence`). Written on 2026-10-13 in the orchestrator's
> session scratchpad by a read-only examination of the default live pack `2026-10-13T07-25-27-766Z` at `552d346`, and copied here unchanged so the record that
> cites it does not depend on the container. Only two things were added: this note, and an HTML comment on each line
> that names a defect note at the path it was proposed under (every such note now sits in `docs/defects/fixed/`).
> Paths under `scratchpad/` and `/home/user/Rotaris-crw-wt-live/.live-run/` name the orchestrator's container: the
> packs are git-ignored and are not carried into the repository. No host, URL, key or token is quoted. The index is
> [`README.md`](README.md).

- **Pack:** `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-13T07-25-27-766Z/`. I copied it to `scratchpad/552/pack/` and
  read only the copy (store opened `mode=ro`).
- **Console:** `scratchpad/live-552d346-default.log`. The run took 07:25:46 to 07:54:06 UTC and ended **`live-run PASSED`**
  (0 FAIL; NOTE lines as listed below).
- **Code and record:** `/home/user/Rotaris-crw-wt-live`, detached at `552d346` (168 commits after `a68f121`). Nothing was
  built or launched. The only program run in that tree was the read-only reader `apps/desktop/scripts/autopsy.mjs`, against the
  copied store: for all 10 sessions its output equals the scenario's `autopsy.txt` but for the store path and one trailing blank
  line.
- **Method:** `.agents/skills/run-autopsy/SKILL.md`, steps 1–6, over 10 sessions and the 2 launch-only logs. I read the
  store (`sessions`, `iterations`, `children`, `tool_calls`, `issues`, `timeline`, `transcript_rows`, `launch_audits`), every
  `model-traffic.jsonl` request by request (timing, usage, system prompt, tool descriptions, reasoning, calls), every
  `app.log` / `session.log` / `summary.md`, and `edit.png` and `terminal.png`. For comparison I re-read the `a68f121` default
  pack copy (`scratchpad/a68/pack/`). Findings were checked against `docs/defects/` at `552d346` (7 open notes, 604 fixed)
  and against origin/main's `docs/defects/` (`4e69b00`).
- **Conventions:** `#N` is a `tool_calls.ordinal`; "t#N" is the 0-based line of that scenario's `model-traffic.jsonl`; "row N"
  is a `transcript_rows.row_index`; the model key is written `openai-compatible--<endpoint>/qwen3.8-flash-next`; no host, URL,
  key or token is quoted. New findings are numbered **Q1–Q3**.

## Verdict

**The pack is green and no directive under test failed. Most of what landed since `a68f121` was not reached by this pack,
because every coordinator closed its own plan before answering: no correction, no re-queue, no cancelled call, no timed-out
child, no loop activation and no cross-file edit.** All three `a68f121` findings that cost time (P1, P6, P7) are gone from the
pack: P1 by model behaviour, not by the new mechanism, and P6 and P7 by the harness repairs.

- **Restored COMPLETED items (the path 4e69b00 repairs, not in this build): 0.** 5 `todo replace` calls in the pack, every one
  the opening write of a plan; all 11 plan closes were per-item `update` calls (edit #27/#28, resume #15/#16, requirements
  #23/#38/#66/#67, terminal #20/#21, frictions #10). **Time cost: 0 s.** The defect is latent here. `todo`'s description
  already warns that a `replace` keeps "COMPLETED, ABANDONED and IN_PROGRESS tasks … by id whatever the incoming list says",
  and every model closed with `update`.
- **React "Minified React error #185": 0.** There were 0 `renderer console` lines in 12 app logs, although two children streamed
  at once in edit (07:28:21–07:29:21) and resume.
- **New findings (three, all low cost):**
  - **Q1** (product, friction). A `send_signal` sent with `background: true` is refused as "A command is required when
    background=True.", and the `terminal` description never says how a session action is sent. 2 refused calls.
  - **Q2** (observation, cause not separable). The intent classifier was cut at its 12 s bound in 4 of 10 launches (2 of 10 at
    `a68f121`). faults-args, the one prompt whose category PD-ORCH-011 revision 2 defines, lost its direct-work route.
  - **Q3** (product, friction, cosmetic). PD-TOOLS-006 revision 6's "names no todo item" refusal lists the plan's open items
    but names `add_task` only when there are none. The work here matched no listed item.
- **Where the time went.** The endpoint, not the product or the host.
  - The pack ran 1,608 s of session wall, against 1,073 s at `a68f121`.
  - In three stretches single requests ran at 10–22 output tokens/s with nothing else of this run in flight: edit's
    summarisers (88.6 s and 115.8 s), resume's two (57.5 s each) and faults-args' (53.6 s). The same requests ran at 64–74
    tokens/s in requirements and terminal.
  - Host-side signals were quiet: code-intelligence discovery took 2.3–3.4 s in every launch (3.3–8.2 s at `a68f121`), and
    there was no `presenter liveness lapsed` line.
  - Terminal finished 339.3 s into its 420 s wait, so 80.7 s were left.

## Directives under test, first live execution

| directive | verdict | session / call / row it rests on |
|---|---|---|
| **PD-ORCH-015** — plan correction in the root's own conversation | **NOT REACHED** | No root answered with an item open. All 10 iterations closed `succeeded` on the first try (`iterations`), and 0 of 174 requests carry "of your plan not complete". Terminal (`8cf99832`), the case the directive's first-execution entry named, closed both items itself (`#20` run14, `#21` report) before answering at t#24, so no correction was owed. The outcome the directive aimed at did hold: `completed` / `tasks_complete` in 1 iteration, inside the wait. It was reached by model behaviour, not by the correction. |
| PD-ORCH-015 — held answer carried to the re-queued root; `system` row | **NOT REACHED** | No re-queue. 0 requests carry "previous iteration on this task"; the 12 `system` rows are 10 "The run completed.", 1 pause row and 1 carried-intent row. |
| **PD-ORCH-009 rev 2** — re-prompt only when the answer is empty | **NOT REACHED** | 0 requests carry the answer re-prompt, and every root's last request ends `stop` with text. |
| **`iteration_end` timeline entries** (P4 repair, `98652aa`/`46c92f3`/`b9ebade`) | **PASS** | 10 entries for 10 closed iterations, each with `iteration`, `task_id`, `task`, `outcome`, `summary`. Each is stamped at its iteration's `closed_at` to the millisecond (e.g. edit 07:31:40.504), before `run_end`. Resume's paused iteration wrote none at the pause and one at its close (07:34:36.335). The follow-up payload that reads them was not driven (no follow-up). |
| **PD-TOOLS-013 rev 2** — cancelled calls read `interrupted`, no `tool_error` | **NOT REACHED** | No tool call was cut in flight. Terminal completed before the capture's quit, and the resume Pause cut no running call. Its neighbour case held: resume rows 12–14 (`read_file`, `glob`, `wait_for_tasks`, emitted in the step the pause ended) read "This call was not run: it was interrupted by the pause before it started …", with no `tool_calls` record and no issue. 0 `interrupted` buckets in any summary.md, and 0 Timeouts. |
| **PD-TOOLS-006 rev 5** — attached-artifact budget | **NOT REACHED** | 0 of 11 delegations passed `attach_artifacts`. The 3 `context_selection` entries (requirements, `attached_included: 0`) carry sibling indexes only. "Mostly-elided artifacts: 0" in 10 of 10 summary.md files. |
| **PD-TOOLS-006 rev 6** — a delegation names its todo item | **PASS** | 9 children carry `todo_item`: edit `9946d29d`/`e63a7653`; resume `a1f3c0d7`/`b2e4d1e8`; requirements `a1`/`a2`/`98abbfc9`/`a3`; terminal `run14`. faults-args' single delegation named none, and it kept no list (spec-faithful). There was 1 refusal: requirements `#39` (docs-writer, no `todo_item`), rejected before any record, with a WARNING at 07:38:14.859 and issue 3. The coordinator added the item (`#40 add_task` → `98abbfc9`) and re-delegated (`#41`). Cost: about 11.9 s (t#33 2.9 s + t#34 9.0 s) and a 906-token brief typed twice. See Q3. |
| **PD-TOOLS-006 rev 7** — admission marks the item IN_PROGRESS | **PASS** | 10 of 10 admitted delegations that named an item answer "Todo item … is now IN_PROGRESS." and append the Todo state (edit #7/#8, resume #2/#3, requirements #12/#24/#41/#52, terminal #2). |
| **PD-TOOLS-008 rev 2** — a running delegation's item is outside the single-active count | **PASS** | Two parallel delegations each left two items IN_PROGRESS with no refusal: edit `#8`'s and resume `#3`'s Todo states each show `[IN_PROGRESS]` ×2. P3 of `a68f121` (2 refused `todo` calls and 1 refused `delegate`, about 19.5 s) is gone. Harness: "no coordinator's plan recorded a running child's todo item PENDING", PASS. |
| **Restored COMPLETED items** (4e69b00's path) | **0 occurrences, 0 s** | See the Verdict. |
| **PD-TOOLS-006 rev 8 / OQ-250** — brief offers no tool the persona lacks; routing sentence | **PASS** | The routing sentence ("Each route names the persona whose judgement the need calls for; give the work itself to a persona whose entry in delegate's list allows it …") is in 53 of 53 coordinating-prompt orchestrator requests; the 11 direct-work requests (frictions, frictions-cut) carry no routing table, as before. "never write in a brief that a command or tool its entry does not show is available to it" is in 64 of 64 `delegate` descriptions. The docs-writer briefs (#39, #41) say "Do not run any command". 0 write-scope refusals, and 0 unknown-tool calls by a child. |
| **OQ-228 / OQ-229** — delegation targets only | **PASS** | `intent-classifier` is gone from the catalogue (P5 of `a68f121`): it appears in 0 of 64 `delegate` descriptions, against 71 of 71 at `a68f121`. Every child is a listed target (8 coding-agent, 1 docs-writer, 1 verifier). |
| **PD-ORCH-011 rev 2** — what `single_file_change` means | **NOTE** (Q2) | The new sentence reached 10 of 10 classifier requests (system prompt 898 → 1,141 characters). The one prompt it defines, faults-args, was cut at 11,978 ms with 3,600 reasoning characters and still undecided, and fell back to `moderate_feature` (launch audit `fallback: true`). `a68f121` classified it `single_file_change` 0.92 in 7.0 s. The cut sent a one-file create through a coordinator and a child: 169.1 s, against 43.3 s. The endpoint's pace confounds the cause (Q2). |
| **PD-TOOLS-012 rev 2** — product directories statement | **PASS** | "Product directories: … `.rotaris/` … `.serena/` …" is in 144 of 144 agent requests (64 orchestrator, 80 child). `.serena` shows only in terminal listings (requirements #36 `ls -a`, #53 `ls -la`), which the statement allows. 0 agent answers, child reports or artifacts name it. The worktree's `git status` (#22, #35) lists no `.serena/`. |
| **PD-TOOLS-014** — `haet_edit` near-miss reply | **NOT REACHED** | 3 `haet_edit` calls (edit #14, requirements #29/#32), all applied first time. Harness NOTE: "no haet_edit miss matched at match level 2 or 3". |
| **PD-TOOLS-015** — level-3 `write_file` shift | **NOT REACHED** | 9 `write_file` edits, all applied, none saying "shifted" or refused. Each `old_string`'s lines appear verbatim among the lines the agent had read or written, so all matched at level 1 by that proxy. |
| **PD-TOOLS-016** — CRLF / bytes kept on a window match | **NOT REACHED** | Same 12 edits; the fixture is LF, so no window match was needed. |
| **PD-ORCH-016** — raw-count fallback, same action | **NOT REACHED** | No supervisor activation: the most calls by one agent is 25 (requirements orchestrator), against a threshold of 60. No four identical consecutive calls, and no loop-classifier request among the 174. |
| **Loop-classification cap** (`74538bf`, `9218efc`) | **NOT REACHED** | As above. |
| **PD-CONFIG-003 rev 3** — timed-out tag | **NOT REACHED** | No child reached `child_timeout=1200`: the longest lived 176.2 s (edit's tests child). Settings were not captured. |
| **XE1 / OQ-245** — cross-file EDIT paths | **NOT REACHED** | 0 code-intelligence EDIT-tier calls. The 5 MCP calls are `list_memories` ×4 and `get_diagnostics_for_file` ×1 (8,100 ms, returned `{}`). |
| **PD-LIBRARY-002 rev 2** | **NOT REACHED** | No retrospective gesture was driven. The post-run analyst (REQ-LIBRARY-127) was cut at the harness's exit in 10 of 10 sessions (each final traffic record `aborted`, 2.6–7.3 s), as before. |
| **React #185** | **0** | See the Verdict. |

### The `a68f121` findings, in this pack

| id | repair | here |
|---|---|---|
| P1 (re-queued root blind) | PD-ORCH-015, `2d98e15` | **Not met.** Terminal's coordinator closed `report` itself (#21) before answering; 1 iteration, 338.8 s. |
| P2 (cancel read as 100 s timeout) | PD-TOOLS-013, `4e0eb81` | Not met: no in-flight call at any quit. |
| P3 (single-active refuses parallel delegations) | PD-TOOLS-008 rev 2, `ebb3810` | **Holds**, as in the table. |
| P4 (`iteration_end` never written) | `98652aa`, `46c92f3`, `b9ebade` | **Holds**, 10 of 10. |
| P5 (`intent-classifier` offered) | OQ-228/229, `2b83b44` | **Holds**, 0 of 64. |
| P6 (prompt typed inside the wait) | `cdd340f`, `bf435f0` | **Holds.** "the prompt was submitted 12828 ms after the wait was installed; the wait for result counts from here" (terminal `app.log`). Typing took 12.8 s, against 27.4 s. |
| P7 (Pause caught one child) | `cdd340f`, `a5c1efa` | **Holds.** `child_paused` for both `bg_12b2c59e` and `bg_b3ff4a2e`; `iteration_paused` `paused_agents: 3`; "2 held; 2 child(ren) running at the press". |

**OQ-213's refusal** fired once, at frictions #2 (`todo_list_owed`, `blocked`, no issue, one WARNING). Recovery took one
`todo` (t#2, 3.9 s) and the retry (t#3, 1.5 s), about 5.4 s. Edit and resume planned first under the harness's list-first
prompts (`57fdcb0`), so the 19.5 s and 9.5 s refusals of `a68f121` did not recur.

## Sizing

| scenario | session | wall | requests | in / out tokens | calls (failed / blocked) | intent |
|---|---|---|---|---|---|---|
| ask | e3bef5dc | 9.1 s | 4 | 20,102 / 292 | 1 (0/0) | question 0.97 (2.7 s) |
| edit | dda43941 | 330.0 s (145.9) | 27 | 341,744 / 13,119 | 28 (0/0) | **fallback** at 12 s (3.7 s at `a68f121`) |
| resume | 9d4e35d0 | 168.8 s (77.0): 70.4 s + 98.2 s, rested 0.15 s | 23 | 246,685 / 5,620 | 16 (0/0); 3 not-started rows | fallback at 12 s, carried at Continue |
| requirements | 142ecafe | 400.4 s (216.8) | 58 | 793,893 / 29,568 | 68 (3/0) | small_feature 0.90 (5.3 s) |
| frictions | f16b13fe | 30.6 s | 11 | 109,879 / 1,741 | 10 (2/1) | explicit_trivial 0.88 (6.6 s) |
| frictions-cut | be379d88 | 10.8 s | 4 | 24,189 / 545 | 1 (1/0) | explicit_trivial 1.0 (4.0 s) |
| faults-ladder | 83ddb97b | 15.8 s | 6 (2 injected) | 20,169 / 532 | 1 (0/0) | question 0.95 (4.7 s) |
| faults-stall | eaaee2bc | 134.9 s | 6 (stalled stream) | 20,169 / 732 | 1 (0/0) | question 0.86 (7.7 s) |
| faults-args | 80e4e29b | 169.1 s (43.3) | 9 | 80,043 / 5,464 | 4 (0/0) | **fallback** at 12 s (single_file_change 0.92 at `a68f121`) |
| terminal | 8cf99832 | 338.8 s (396.2, cut) | 26 | 474,131 / 12,986 | 21 (4/1) | fallback at 12 s, 0 bytes received |
| **total** | 10 | **1,608.3 s** | 174 | **2,131,004 / 70,599** | 151 (10/2) | |

Figures in brackets are `a68f121`'s.

- **Accounting is coherent.**
  - Tokens: the store's totals equal the traffic's `usage` in 9 of 10 sessions. faults-stall's traffic holds the stalled
    stream's 9,553 / 106 more, which never reached the product. 2,131,004 + 70,599 = 2,201,603 is the console's spend line and
    the status bar's workspace figure in `terminal.png`.
  - Counters (PD-ORCH-008): every `sessions.tool_calls` equals its rows and its `root_tool_calls` + `children.tool_calls`
    (edit 13+15, requirements 25+43, terminal 6+15, faults-args 1+3, resume 6+10).
  - Cost: 0 with `cost_qualifier: unknown`; summary.md reads "n/a (price not established)".
  - Summaries: 10 of 10 read `completed` / `tasks_complete` / "The run completed.". Each Tool errors line equals its Issues
    line's `tool_error` count.
- **Children.** 10, all `succeeded`: 8 coding-agent, 1 docs-writer, 1 verifier. Requirements ran four sequential
  foreground children (two at `a68f121`): logic, App.jsx, docs and verification.
- **Where the time goes.**
  - Classification: 4 cuts at 12 s.
  - Summariser passes holding a parent's wait (OQ-114): edit 115.8 s, resume 57.5 s, faults-args 53.6 s, requirements
    64.6 s over four, terminal 16.6 s.
  - Endpoint pace (output tokens/s on requests of at least 500 output tokens): median 76.6 over 45 requests, against 79.3 at
    `a68f121`. The low tail is new: 10.7–22.1 in the edit, resume and faults-args summarisers, 14.9 in terminal t#24 (57.2 s
    for 853 tokens), and edit t#1 at 42.1 s for 325 tokens.
  - Terminal's classifier received 0 bytes in 11,967 ms. The endpoint was queueing.
- **Log triage.**
  - 8 WARNING lines in all: `git_commit` `executor_absent` ×2 (ruled); dispatch retries 429/500 ×2 (faults-ladder, by
    design); OQ-213 refusal ×1; stall ×1 and transient ×1 (faults-stall, by design); todo-item refusal ×1.
  - No `error` from the app. Per launch, the Chromium noise is the 7 D-Bus lines and one `LatencyInfo vector size N is too big`.
  - No double emission and no child stderr.

## Run autopsy — 8cf99832-96b2-44bc-ba84-aedd286a4344 (terminal, 338.8 s, 474,131 in / 12,986 out)

The coordinator wrote a 2-item plan (#1), delegated the 14 shapes to one coding-agent (#2, `todo_item: run14`), and waited
168.9 s (#3). It read the verbatim report (#19), closed both items (#20, #21), and answered at t#24. All terminal product
checks passed: M1's staged script printed `4648` in 28 ms (#6), OQ-147 and OQ-164 held (#13, #15), and pipe-to-shell was
blocked (#18). No finding.

## Run autopsy — dda43941-6780-41a0-a445-4f1ba8cd0193 (edit, 330.0 s, 341,744 in / 13,119 out)

Classification was cut at 12 s. The coordinator planned (#6), then delegated two write-scoped coding-agents in one step (#7,
#8, both items IN_PROGRESS, no refusal). It waited 166.0 s (#13), of which the tests child's summariser took 115.8 s at 14.1
tokens/s, and closed both items by `update`. `node --test` is green; 2 files changed, +31 −1. No finding; the 184 s over
`a68f121` are endpoint pace (classifier 12 s, t#1 42.1 s, summarisers 88.6 s and 115.8 s).

## Run autopsy — 9d4e35d0-82ee-4ccc-8865-d9a50f71d53d (resume, 168.8 s over 2 runs, 246,685 in / 5,620 out)

Plan (#1), two delegations in one step (#2, #3, both IN_PROGRESS), Pause at 07:32:55.204 with both children running, rest
`paused` at 07:32:57.963, Continue at 07:32:58.108 ("Intent classified: moderate_feature (continued from previous run)"). Both
children resumed and completed; both notes written; plan closed by `update`. The three calls cut before they started are
transcript rows 12–14 (`blocked`, no issue). No finding.

## Run autopsy — 142ecafe-c359-417b-a4b7-046ca2c4c919 (requirements, worktree `rotaris-req-req-104-u1`, 400.4 s, 793,893 in / 29,568 out)

Board release → run in the worktree (REQ-MCP-034 PASS) → four sequential foreground children → review → done; checkpoint 1.

### 1. Name `add_task` in the no-item refusal when no open item matches the work — see Q3
- **Class**: friction (cosmetic)
- **Status**: new
- **Evidence**:
  - `#39` was refused: "This delegation names no todo item … gives todo_item, the id of the open item it serves. Its open
    items: Verify: node --test is green and REQ-104 acceptance criteria hold (a3)."
  - The only item listed is the verification item, which is not the docs work.
  - The model added `98abbfc9` (`#40`) and re-delegated (`#41`).
- **Cost**: about 11.9 s, a 906-token brief typed twice and 1 `tool_error` issue.

### 2. Model behaviour meeting spec-faithful refusals (no finding)
- `#10 todo` sent with no `operation` → `invalid_request` (issue 1). The model recovered in one step (`#11`).
- `#18 write_file` was edit-shaped with no `operation` → `invalid_request` (issue 2), the same as `a68f121`'s `#19`.
  PD-TOOLS-007 infers only a create, and the model recovered in one step (`#19`).

## Run autopsy — f16b13fe-8e46-4133-9ef3-9b2945f9e5f6 (frictions, 30.6 s, 109,879 in / 1,741 out)

### 1. Say in `terminal`'s description how a session action is sent, so a signal is not refused as a missing command — see Q1
- **Class**: friction
- **Status**: new
- **Evidence**:
  - `#5` (`background: true, command: "", session_action: send_signal, session_id: ts_da70a111, signal: SIGINT`) and `#6`
    (the same without `command`) were both refused: "A command is required when background=True." (issues 1–2, `tool_error`).
  - `#7` (`background: false`) sent the signal.
  - t#6 reasoning: "The send_signal path requires background not to be true."
- **Cost**: 2 refused calls, 2 `tool_error` issues and about 3.8 s (t#4 2.2 s, t#5 1.6 s).

OQ-213's refusal of `#2` is costed above. SIGINT stopped the session ("killed (exit -1)").

## Run autopsy — 80e4e29b-bd4d-459b-ba04-6c1e652ae0ae (faults-args, 169.1 s, 80,043 in / 5,464 out)

The classification was cut (Q2), so the root delegated the one-file create to a coding-agent, in the foreground for 126.0 s.
- The child streamed `write_file create` in 222 pieces over 26.6 s against `child_stall_timeout: 10`.
- No `stall` issue was filed. `waiting_on_tools` fired for the waiting root at 11, 41, 71 and 101 s (REQ-MONITOR-118, info).
- This is REQ-ORCH-089's repair green live for a **child** for the first time: `a68f121` measured the root.
- Cost of the reroute: about 126 s and 57 k tokens over `a68f121`'s direct work, 53.6 s of it the summariser at 12.4 tokens/s.

## Run autopsy — ask, frictions-cut, faults-ladder, faults-stall (no finding)

- **ask** (`e3bef5dc`, 9.1 s): one `read_file`; six exports named, correct before edit.
- **frictions-cut** (`be379d88`, 10.8 s): `#1` exited 3 with 120 lines; its record is cut to 2,000 characters ending "...".
- **faults-ladder** (`83ddb97b`, 15.8 s): 429 and 500 absorbed by the dispatch layer (2,003 ms, 4,003 ms), 0 issues. The
  answer miscounts ("six functions … seven in all"), which is the model's slip.
- **faults-stall** (`eaaee2bc`, 134.9 s): the stall issue was filed at 94 s, the retry came at 120 s, `stall_recovered` at
  07:45:12.527, and the run completed.

## Launch-only logs — sign-in and shell

The starter `agents.yaml` was bootstrapped, and the sign-in notice reads "Added …; discovered 1 model.". Overview lists 4
sessions, and the repository card reads "no base → main". Beyond the Chromium noise above, the only other line is one
`atom_cache` line at sign-in. No finding.

---

## Cross-session findings

### Q1. Say in `terminal`'s description how a session action is sent, so a signal is not refused as a missing command
- **Proposed note:** `docs/defects/a-session-action-sent-with-background-true-is-refused-as-a-missing-command.md` <!-- historical-path: docs/defects/a-session-action-sent-with-background-true-is-refused-as-a-missing-command.md -->
- **Class**: friction (product). **Status**: new. No open or fixed note covers it, at `552d346` or at origin/main.
- **Description:**
  - `terminal`'s description names only "`query` / `kill`" for a background session's id. It never says that a session
    action (`send_signal`, `send_input`, `list`) is sent with `background` false or absent.
  - A `send_signal` sent with `background: true` is dispatched as a new spawn (REQ-TOOLS-120), and its refusal reads only "A
    command is required when background=True." (REQ-TOOLS-101's fixed text). The refusal names no remedy, and the model
    repeated the call once before finding the path itself.
- **Evidence**: frictions `f16b13fe` `#5`, `#6`, issues 1–2, t#6 reasoning; `#7` succeeded with `background: false`.
- **Cost**: 2 refused calls, 2 `tool_error` issues and about 3.8 s. Low, but it recurs in any run that signals a background
  session.
- **Spec**:
  - REQ-TOOLS-110 (the five session actions; the description is not fixed by any requirement, and REQ-TOOLS-104 governs only
    Windows).
  - REQ-TOOLS-101 (the refusal's exact text, faithful as built).
  - REQ-TOOLS-120 (`background` outranks `session_id`).
- **Files**:
  - `packages/agent-tools/src/terminal/index.ts`: `execute`'s validation, l.372; the dispatch, l.380–384; `terminalSchema`.
  - `terminalDescription` (the description's text).
- **Ruling**: none for a description sentence, which is covered work under REQ-TOOLS-110. One would be needed for a
  different refusal text, or for letting a session action outrank `background`, since REQ-TOOLS-101 and REQ-TOOLS-120 fix
  both.

### Q2. The classifier is cut at its 12 s bound in 4 of 10 launches, and the one-file create lost its direct-work route
- **Proposed note:** none yet. This is an observation for PD-ORCH-011 revision 2's first-execution report, because its cause is
  not separable in this pack.
- **Class**: friction (observation). **Status**: new.
- **Evidence**:
  - Launch audits read `fallback: true` "timed out after 12 s" for edit, resume, faults-args and terminal (resume and
    terminal at `a68f121`).
  - The classifier system prompt grew 898 → 1,141 characters (PD-ORCH-011 revision 2's sentence).
  - The same prompts reasoned longer: faults-ladder 787 → 1,234 characters, faults-stall 786 → 2,114, frictions
    1,073 → 1,544. But requirements fell, 1,973 → 1,478.
  - faults-args was undecided at the cut, with 3,600 characters. Its reasoning never engages the categories ("There is no
    categories given").
  - The endpoint was slow in the same minutes: terminal's classifier received 0 bytes in 11,967 ms, and edit's received 201
    chunks.
- **Cost**: faults-args took 169.1 s against 43.3 s and 80 k tokens against 23 k, through a coordinator and a child, for a
  one-file create. Edit, resume and terminal each lost 12 s and their own category.
- **Spec**: PD-ORCH-011 revision 2, REQ-ORCH-006 and REQ-ORCH-010 (the fallback), and the classification bound.
- **Files**: `packages/engine/src/intent/classifier.ts` (the prompt and `CLASSIFICATION_TIMEOUT_MS`).
- **Ruling**: none now. A second pack on a quiet endpoint would separate the prompt's share from the endpoint's.

### Q3. Name `add_task` in the "names no todo item" refusal when the open items do not fit the work
- **Proposed note:** `docs/defects/the-no-todo-item-refusal-names-add-task-only-when-the-plan-holds-no-open-item.md` <!-- historical-path: docs/defects/the-no-todo-item-refusal-names-add-task-only-when-the-plan-holds-no-open-item.md -->
- **Class**: friction (cosmetic). **Status**: new.
- **Description:** `openItemsSentence` offers "add one with the todo tool (add_task)" only when the plan holds no open item.
  Otherwise it lists the open items, and none of them may be the work the delegation is for.
- **Evidence**: requirements `142ecafe` `#39` (the only open item listed is the verification item, `a3`), then `#40`
  `add_task` and `#41`. WARNING at 07:38:14.859.
- **Cost**: about 11.9 s and a 906-token brief typed twice. The model did not misname `a3`, but the text invites it.
- **Spec**: PD-TOOLS-006 revision 6 ("its reason naming the item, the holder where there is one, and the way forward").
- **Files**: `packages/engine/src/children/todo-item.ts` (`openItemsSentence`, l.43; the no-item reason, l.96).
- **Ruling**: none. The directive asks for the way forward, and adding `add_task` beside the list is within it.

## The NOTE lines

| NOTE | verdict |
|---|---|
| sign-in / shell: discovery did not run | Correct. |
| edit: writes the gate refused — none | Correct. |
| resume: children whose last entry offered no plain fragment — `bg_12b2c59e` | Correct. Its first request was cut by the pause with 5 output tokens and no text (t#3). |
| stream-stall abort / exit-trace gap not covered here | Correct. |
| faults-ladder: the dispatch layer alone (2 absorbed retries) | Correct (OQ-110). |
| faults-stall / faults-args: what the run settled as | Correct. faults-args reached its result through a child (Q2). |
| terminal: what the model attempted (×1 each, poll×2) | Correct, and iteration 1 alone this time. |
| terminal: the wedge did not reach the hard cap | Correct, `#10` soft-paused. |
| terminal: pipe-to-shell blocked | Correct, spec-faithful. |
| no ceiling — 2,201,603 tokens | Correct; it equals the store. |
| no `write_file` left out its operation for a path inside its fence | Correct. requirements `#18` was edit-shaped. |
| OQ-213 refused frictions #2 | Correct; about 5.4 s. |
| delegations refused for their todo item — requirements #39 | Correct; one, followed by a named delegation (Q3). |
| write scopes to a non-writing persona, unknown-tool child calls — 0 / 0 | Correct. |
| no `haet_edit` miss matched at level 2 or 3 | Correct; PD-TOOLS-014 was not reached. |

## Unverified (no finding drawn)

- The match level of each successful edit. Level 1 is inferred from verbatim line membership; the result text does not state
  the level.
- Whether PD-ORCH-011 revision 2's sentence lengthens classification on this model (Q2). Endpoint pace confounds it.
- `get_diagnostics_for_file` taking 8,100 ms and returning `{}` for `src/App.jsx` (requirements `#34`). It was the first call
  after the session's code-intelligence connect (07:37:13.596). Not judged.

## Defect notes and first executions

- **New, not recorded** (the brief made this examination read-only; CLAUDE.md's standing policy records such notes without
  asking): Q1 and Q3 as defect notes. Q2 belongs in PD-ORCH-011 revision 2's first-execution report.
- **First live executions this pack evidences**, owed to the record in place plus one `first-executions.md` row each:
  - PD-TOOLS-006 revisions 6, 7 and 8, PD-TOOLS-008 revision 2, OQ-228/229, PD-TOOLS-012 revision 2 and the `iteration_end`
    entries: all PASS.
  - PD-ORCH-011 revision 2: NOTE (Q2).
  - Found nothing, because not reached: PD-ORCH-015, PD-ORCH-009 revision 2, PD-TOOLS-013 revisions 1 and 2, PD-TOOLS-006
    revision 5, PD-TOOLS-014/015/016, PD-ORCH-016, the loop-classification cap, PD-CONFIG-003 revision 3, XE1/OQ-245 and
    PD-LIBRARY-002 revision 2.
  - The harness repairs for P6 and P7 hold.

**Highest-cost finding: none of the three exceeds 12 s.** Q2's reroute of faults-args (about 126 s) is the largest single
cost, but its cause is shared with the endpoint. Q1 and Q3 are ready to be recorded in `docs/defects/` on a go-ahead.
