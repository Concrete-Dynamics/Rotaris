# Live-run autopsy — origin/main `0bc3eee`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered)

> **Written into the record directly, 2026-10-13** (fin41, `fin41-comments-and-evidence`), by a read-only examination of a
> copy of the pack. The pack's one FAIL was diagnosed separately, earlier the same day
> ([`live-0bc3eee-fail-diagnosis.md`](live-0bc3eee-fail-diagnosis.md)); this file reads the rest. The index is
> [`README.md`](README.md).

- **Pack:** `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-13T12-18-40-282Z/`, copied to the session scratchpad and
  read only there (the store opened `mode=ro`). The run took 12:18:41 to 12:40:37 UTC (`results.json`) and ended `live-run
  FAILED` on one check, "all 40 lines of output reached the agent", a harness defect repaired since
  ([`the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md`](../../defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md));
  180 PASS, 1 FAIL and 18 NOTE lines; the product failed none.
- **Code:** built at `0bc3eee`, the first live run of everything landed after `552d346`: OQ-258's keys sentence on the
  classifier's strict rung (`489a392`), `PD-TOOLS-006` revision 9, `PD-TOOLS-008` revision 3, and the Q1 and Q3 wording repairs.
  Nothing was built or launched for this reading. The only program run was the read-only reader
  `apps/desktop/scripts/autopsy.mjs`, from the `fin41-comments-and-evidence` tree (`1351ed1`), against the copied store: for all
  10 sessions its output equals the scenario's `autopsy.txt` but for the store path and one trailing line. Everything else was
  `python3 -I` reads of the copied store and of each scenario's `model-traffic.jsonl`.
- **Method:** `.agents/skills/run-autopsy/SKILL.md`, steps 1 to 6, over the 10 sessions and the 2 launch-only logs (sign-in,
  shell). Findings checked against `docs/defects/` and `docs/defects/fixed/` at `1351ed1`.
- **Conventions:** `#N` is a `tool_calls.ordinal`. The model key is written `openai-compatible--<endpoint>/qwen3.8-flash-next`;
  no host, URL, key or token is quoted. Figures in brackets are `552d346`'s
  ([`live-552d346-default-autopsy.md`](live-552d346-default-autopsy.md)).

## Verdict

**The product passed every check it was given, and the pack ran in 1,190.0 s of session wall against 1,608.3 s at
`552d346`.** Most of the saving is classification: the classifier answered on its strict rung in **9 of 10 launches** (6 of 10),
so edit, resume, faults-args and terminal kept their own categories and routes. One launch, requirements, was still cut at the
12 s bound, while deliberating between three feature sizes and with the endpoint streaming (91 kB received), so neither of
OQ-258's reopening limbs is met. No new finding: the failed and blocked calls are model behaviour meeting gates that answered
as specified.

What landed after `552d346`, read here for the first time:

- **OQ-258 (the keys sentence):** 10 of 10 classifier requests end with "… \"intent\" (one of the categories), \"confidence\" (a
  number from 0 to 1, or null), \"reason\" (a short sentence)."; 0 of 10 reasonings debate which key to write; 9 answered in
  2.3 to 9.8 s. HELD.
- **`PD-TOOLS-006` revision 9:** the write-scope sentence, the field's description and the hand-off sentence in 94 of 94
  `delegate` offers; 8 write scopes, all to writers (7 coding-agent, 1 docs-writer); 0 write-scope refusals; 0 unknown-tool calls.
  No delegation used `depends_on` or `inherited_context`, so the hand-off budget was **not reached** (the harness's "0 cut
  answers" does not discriminate).
- **`PD-TOOLS-008` revision 3:** **not reached.** All 5 `replace` calls were the opening write of a plan and every close was an
  `update`; `restoredOverClose` 0 and `namedRestores` 0, neither discriminating.
- **Q1 (the session-action sentence):** held, once. frictions' `send_signal` went out with `background: false` first time
  (#5) and stopped the session ("killed (exit -1)"); 0 refused session actions (2 at `552d346`).
- **Q3 (the no-item refusal naming `add_task`):** **not reached**: 0 todo-item refusals.

React #185: **0** relayed renderer console lines in 12 logs, with two children streaming at once in edit, resume and
requirements.

## Sizing

| scenario | session | wall | requests | in / out tokens | calls (failed / blocked) | intent |
|---|---|---|---|---|---|---|
| ask | `0e08105b` | 11.2 s (9.1) | 4 | 20,438 / 527 | 1 (0/0) | question 0.98 (2.3 s) |
| edit | `c691fa97` | 117.8 s (330.0) | 27 | 338,096 / 12,301 | 27 (0/0) | small_feature 0.92 (3.4 s) [fallback] |
| resume | `94274a46` | 70.0 s (168.8) | 29 | 343,363 / 9,640 | 20 (0/0) | small_feature 0.72 (9.8 s) [fallback] |
| requirements | `691a07e9` | 580.4 s (400.4) | 91 | 1,488,199 / 48,426 | 112 (9/2) | **fallback** at 11,973 ms [small_feature 0.90] |
| frictions | `652a40e8` | 25.9 s (30.6) | 9 | 86,310 / 1,438 | 8 (0/1) | explicit_trivial 0.90 (4.8 s) |
| frictions-cut | `134c7d92` | 7.6 s (10.8) | 4 | 24,703 / 424 | 1 (1/0) | explicit_trivial 0.98 (3.2 s) |
| faults-ladder | `a564a6f1` | 12.9 s (15.8) | 4 | 20,489 / 323 | 1 (0/0) | question 0.96 (3.2 s) |
| faults-stall | `051c245f` | 134.6 s (134.9) | 6 (stalled stream) | 20,518 / 645 | 2 (0/0) | question 0.95 (3.8 s) |
| faults-args | `ee8346c3` | 46.1 s (169.1) | 4 | 24,349 / 2,430 | 1 (0/0) | explicit_trivial 0.78 (9.1 s) [fallback] |
| terminal | `6f11bf67` | 183.5 s (338.8) | 37 | 924,874 / 7,512 | 34 (4/2) | explicit_trivial 0.92 (7.1 s) [fallback, 0 bytes] |
| **total** | 10 | **1,190.0 s** (1,608.3) | 215 | **3,291,339 / 83,666** | 207 (14/5) | |

- **Accounting is coherent.** In all 10 sessions `sessions.tool_calls` equals its rows and its `root_tool_calls` plus the
  children's (edit 11 + 16, resume 6 + 14, requirements 37 + 75). 3,291,339 + 83,666 = 3,375,005 is the console's "no ceiling"
  line. Cost 0, `cost_qualifier: unknown`; each summary.md reads "n/a (price not established)", and each Tool errors line
  equals its Issues line's `tool_error` count.
- **Children.** 9, all `succeeded`: 7 coding-agent, 1 docs-writer, 1 verifier. Requirements ran five (two in parallel,
  two more, then the verifier), its render child the longest at 268.5 s.
- **Endpoint pace.** Median output tokens/s over requests of at least 500 output tokens: 77.4 (edit), 72.6 (resume), 77.9
  (requirements), 92.5 (terminal). No slow tail like `552d346`'s.
- **Every `iteration_end` entry written:** 10 for 10 closed iterations.
- **Log triage.** 0 `warn` or `error` lines from the application beyond the specified ones: `git_commit`'s
  `executor_absent` removal (×4, ruled), the two REQ-ORCH-029 refusals (frictions #2, terminal #2), the faults-ladder
  dispatch retries (429, 500) and the faults-stall stall and transient warnings, all by design. The `error` lines are
  Chromium's D-Bus noise (24). No double emission, no child stderr.

## Run autopsy — 691a07e9-e2c3-429f-9265-2878865e9494 (requirements, worktree `rotaris-req-req-104-u1`, 580.4 s, 1,488,199 in / 48,426 out)

Classification was cut at 11,973 ms (`fallback: true`, `moderate_feature`). The reasoning (3,496 characters, 91 kB of stream)
was weighing `small_feature`, `moderate_feature` and `single_file_change` against the prompt's "when several categories are
plausible prefer moderate_feature" and never turned to the output's keys. The coordinator planned (#11), delegated the function
and the render in parallel (#14, #15, both IN_PROGRESS), then the layout (#64, naming `ui`, still IN_PROGRESS, so no line), the
docs (#65) and the verifier (#90, no item, owing none). Board → review → done; `node --test` green in the worktree.

### Model behaviour meeting gates that answered as specified (no finding)

| calls | what | recovery |
|---|---|---|
| #28, #39, #73, #77 `haet_edit` | each child's first `haet_edit` sent a `content_hash` no `haet_read` had returned (#73's is the SHA-256 of the empty string); refused with REQ-TOOLS-189's fixed text, "changed since the hash you hold was taken", which here describes a hash never issued rather than a change | one `haet_read` and the edit, every time |
| #44 `terminal` | `cd` to a mistyped worktree path (`rotaris-req-104-u1`) | #45 `pwd` |
| #46 `terminal` | the child's own throwaway assertion failed | rewritten (#49, #50) |
| #51 `terminal` | a compound command ending `rm -rf /tmp/verify104 …`, denied by `starter:deny-recursive-delete` | re-sent without the `cd` (#52, #53: run in `/tmp/verify104`, where #49 had left the shell), then whole (#54) |
| #23 `read_file` | a guessed requirement path; the refusal listed the directory | — |
| #106 `terminal` | the verifier's `rm -rf /tmp/req104-verify`, denied by the same rule | — |

**Cost:** 11 calls and 9 issues, a few seconds each. The 180 s over `552d346` are the plan's extra two children and the
render child's own exploration, not the product.

## Run autopsy — 6f11bf67-7e24-457d-b04f-beee048277db (terminal, 183.5 s, 924,874 in / 7,512 out)

Classified `explicit_trivial` (0.92, 7.1 s) where `552d346`'s launch received 0 bytes and fell back, so the coordinator ran the
14 shapes itself with the direct-work bundle (PD-ORCH-006) instead of through a child: 183.5 s against 338.8 s. Its #2 was
refused by the REQ-ORCH-029 gate before it ran, it wrote its list (#3) and re-sent the command (#5), which returned all 40
lines. The harness's FAIL read #2 (the diagnosis above). Every other shape answered as the harness expects, including the
designed failures (#9 and #13 the shell replaced and ended, #11 `Bad substitution`, #21 the interrupted command, #33
`starter:deny-pipe-to-shell`). No finding.

## Run autopsy — c691fa97-0318-4eca-8636-82b578d7ce17 (edit, 117.8 s, 338,096 in / 12,301 out)

`small_feature` 0.92 in 3.4 s. Plan (#5), two write-scoped coding-agents in one step (#6, #7, both IN_PROGRESS), one wait
(70.3 s), two `update` closes. `node --test` green; 2 files changed, +30 −1. No finding.

## Run autopsy — 94274a46-012a-4358-9c70-b915aef21285 (resume, 70.0 s, 343,363 in / 9,640 out)

`small_feature` 0.72 in 9.8 s; the Continue carried it, "(continued from previous run)". Pause with both children running, 2
held, both resumed under their own task ids and completed; both notes written; plan closed by `update`. No call was cut before
it started this time. No finding.

## Run autopsy — frictions, frictions-cut, faults-ladder, faults-stall, faults-args, ask (no finding)

- **frictions** (`652a40e8`, 25.9 s): the first coordinator request went straight to `write_file` and a background `terminal`
  (4,530 ms, 240 output tokens, no reasoning about what a coordinator may do); #2 was refused by the REQ-ORCH-029 gate, the list
  written (#3), the start re-sent (#4), the signal sent with `background: false` (#5) and the session read killed (#6).
- **frictions-cut** (`134c7d92`, 7.6 s): #1 exited 3; its record is cut to 2,000 characters with REQ-SESSION-194's marker.
- **faults-ladder** (`a564a6f1`, 12.9 s): 429 and 500 absorbed by the dispatch layer (2,003 ms, 4,003 ms), 0 issues.
- **faults-stall** (`051c245f`, 134.6 s): the stall issue at 94 s, the retry at 120 s, the run completed.
- **faults-args** (`ee8346c3`, 46.1 s): `explicit_trivial` 0.78 in 9.1 s, the one-file create written by the coordinator itself
  (#1), 221 argument pieces over 26.6 s against `child_stall_timeout: 10` and 0 `stall` issues. `PD-ORCH-011` revision 2 defines
  this prompt as `single_file_change`; the classifier chose the other direct-work category, so the route is the one the
  revision wants and the label is not.
- **ask** (`0e08105b`, 11.2 s): one `read_file`; the six exports named.

## Launch-only logs — sign-in and shell

The starter `agents.yaml` was bootstrapped and the sign-in notice reads "Added …; discovered 1 model.". Overview lists 4
sessions and the repository card reads "no base → main". No finding.

## Records under test, read from this pack

| record | verdict | evidence |
|---|---|---|
| **OQ-258** / ADR-0026's third execution / `PD-ORCH-011` revision 2 | **HELD; reopening limbs not met** | keys sentence 10 of 10; 9 of 10 on `json_schema`; 1 cut (requirements, category deliberation, bytes received); faults-args direct in 46.1 s as `explicit_trivial` |
| `PD-TOOLS-006` revision 9 | **HELD where reached; hand-off not reached** | sentences 94 of 94; 8 scopes to writers; 0 refusals; 0 hand-offs |
| `PD-TOOLS-008` revision 3 | **NOT REACHED** | 5 replaces, all opening writes; 0 `restoredOverClose`, 0 `namedRestores` |
| `PD-TOOLS-008` revision 2, `PD-TOOLS-006` revision 7 | **PASS** | parallel delegations in edit, resume, requirements with no refusal; 7 of 7 admissions naming a PENDING item read IN_PROGRESS |
| `PD-TOOLS-006` revision 6 | **PASS** | 8 of 8 implementation delegations after a list named their item; 0 refusals |
| Q1, Q3 | **HELD once; not reached** | frictions #5; 0 todo-item refusals |
| `PD-ORCH-006` revision 1 | **PASS** | frictions' first request, 4,530 ms, 240 output tokens, straight to the work |
| `PD-ORCH-007` | **PASS** | 9 of 9 summariser requests carry the child's whole task (940 to 2,868 characters, 7 of them over REQ-ORCH-110's 2,000) at the start of their transcript, after the payload marker |
| `PD-MCP-001` | **PASS** | the manual offered in 188 of 188 agent requests with the product's text, called 0 times |
| `PD-TOOLS-012` revision 2 | **PASS** | the statement in 188 of 188 agent requests |
| `PD-ORCH-015`, `PD-ORCH-009` revision 2, `PD-TOOLS-013`, `PD-TOOLS-014/015/016`, `PD-ORCH-016`, `PD-CONFIG-003` revision 3, XE1 | **NOT REACHED** | 0 correction, held-answer or re-prompt texts in 215 requests; 0 calls cut in flight; 21 edits, 0 near misses or shifts; most calls by one agent 37 (threshold 60); longest child 268.5 s; 0 EDIT-tier calls |

## Unverified (no finding drawn)

- The match level of each successful edit; the results do not state it and the sandbox is gone.
- Why each child sent a `content_hash` it had not been given. The briefs do not carry one; the model's reasoning was not read for
  each of the four.

## First executions this pack reports

Each is reported in place in the record that decided it, with one row in `first-executions.md` for the pack: OQ-258 and
ADR-0026's correction, `PD-ORCH-011` revision 2, `PD-TOOLS-006` revision 9, `PD-TOOLS-008` revision 3 (not reached), the Q1
and Q3 notes. Not covered here: fin40's terminal-shape repair, which landed after `0bc3eee` and waits for the next live
terminal run.

**Highest-cost finding: none.** The pack's one FAIL is the harness's, already repaired.
