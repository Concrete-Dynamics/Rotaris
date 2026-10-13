# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered)

> **In the record since 2026-10-13** (fin41, `fin41-comments-and-evidence`). Written on 2026-10-13 in the orchestrator's
> session scratchpad by a read-only examination of the duress live pack `2026-10-13T08-12-41-551Z` at `552d346`, and copied here unchanged so the record that
> cites it does not depend on the container. Only two things were added: this note, and an HTML comment on each line
> that names a defect note at the path it was proposed under (every such note now sits in `docs/defects/fixed/`).
> Paths under `scratchpad/` and `/home/user/Rotaris-crw-wt-live/.live-run/` name the orchestrator's container: the
> packs are git-ignored and are not carried into the repository. No host, URL, key or token is quoted. The index is
> [`README.md`](README.md).

- **Pack:** `/home/user/Rotaris-crw-wt-live/.live-run/runs/2026-10-13T08-12-41-551Z/` (`sign-in/`, `duress/`, `workspace.db`,
  `results.json`, `agents.yaml`). I copied it to `scratchpad/552d/pack/` and read only the copy (store opened `mode=ro`). The
  sandbox workspace no longer exists, so the delivered files are known from the store, the logs and the traffic only.
- **Console:** `scratchpad/live-552d346-duress.log`. `--only=duress`, per-agent timeout 2,700 s, 08:12–09:07 UTC.
  **`live-run PASSED`: 30 PASS, 9 NOTE, 0 FAIL.**
- **Code and record:** `/home/user/Rotaris-crw-wt-live`, detached at `552d346`. Nothing was built, launched or run there but
  the read-only reader `apps/desktop/scripts/autopsy.mjs` (`/opt/node24/bin/node`) against the copied store; its output
  equals the pack's `duress/autopsy.txt` but for the store path and one trailing blank line. Everything else was `python3 -I`
  reads of the copied store and traffic (`scratchpad/552d-scripts/`). No live run was launched and the repository was not
  edited.
- **Method:** `.agents/skills/run-autopsy/SKILL.md`, steps 1 to 6. Sources: `sessions`, `iterations`, `children` (each
  `report`), `tool_calls`, `issues`, `timeline`, `events`, `transcript_rows`, `artifacts`, `permission_audit`,
  `launch_audits`, `ring_state`; all 199 records of `duress/model-traffic.jsonl` (system prompt, brief, timing, record-level
  `usage`, reasoning, text, emitted calls, offered tools); both `app.log`s, `session.log`, `summary.md`, `results.json`,
  `duress.early.png`, `duress.png`. Record: `docs/defects/` (7 open notes, 604 fixed), OQ-214, OQ-250,
  PD-CONFIG-003, PD-TOOLS-006, REQ-TOOLS-152/154, REQ-ORCH-060, `packages/engine/src/run/supervisor.ts`,
  `packages/engine/src/children/{notify,orchestration,cut-off}.ts`.
- **Comparisons:** `live-a68f121-duress-autopsy.md` (D1–D9) and `live-552d346-default-autopsy.md` (Q1–Q3, same build).
- **Conventions:** `#N` is a `tool_calls.ordinal`; "req N" the 0-based line of `duress/model-traffic.jsonl`; "row N" a
  `transcript_rows.row_index`; children by short name: a, b, c (wave 1), d, e1 (`architect`), e2 (wave 2), f1 (`verifier`),
  f2 (wave 3). The model key is written `openai-compatible--<endpoint>/qwen3.8-flash-next`; no host, URL, key or token is
  quoted. New findings are numbered **V1–V3**.

## Verdict

**The product carried a 54-minute, 8-child delegating run to `tasks_complete` with every child `succeeded`, and its record
is coherent.** `sessions.tool_calls` 303 equals the rows and `root_tool_calls` 63 + the children's 240 (23, 12, 23, 36, 32,
42, 27, 45); `ring_state` holds 303 / 10 / 301 with 0 dropped; the store's 5,800,296 in / 307,187 out (232,400 reasoning)
equals the traffic's `usage` to the token; 301 permission decisions (300 allow, 1 deny) are the 303 calls less the 2 refused
at the gate; summary.md's Tool errors 5 equals its `tool_error` issues 5; cost reads "n/a (price not established)". The
harness's "product with nothing in flight" fell from 35 s at `a68f121` to 3 s.

**Nothing timed out, nothing failed, so most of what this pack was meant to read for the first time was not reached.** Two
items were reached and show something new:

- **V1 (new, needs a ruling).** The hand-off `PD-TOOLS-006` revision 8 prescribes — ask the route's persona "for its answer and
  hand that answer to one that has it, through depends_on or inherited_context" — **delivered 14 % of the architect's answer
  and 20 % of the verifier's.** The inherited-context block reuses REQ-ORCH-060's 4,000-character report block: e1's
  28,330-character analysis reached e2 with "… [24330 characters omitted]", and f1's 20,195-character report reached f2 with
  "… [16195 characters omitted]". No channel a child holds carries the rest (`artifact_read` of a child report returns
  summary, findings and commands). e2 wrote 7 of `docs/decisions.md`'s 8 file sections from its own reading, the opposite of
  its brief, and the user's answer credits them to the architect.
- **D3 recurs (OQ-250's reopening condition met).** With the routing sentence in 41 of 41 coordinator requests, req 59 still
  gave `architect` a `write_scope` (#92), refused in 5 ms. The sentence then worked as recovery, not prevention.

**The 2,700 s per-agent timeout mattered once (D2):** f1 lived 1,253.2 s, 53.2 s past the product's 1,200 s default, and
succeeded; at the default its final step would have landed 21.5 s after the ceiling and the child would have ended `failed`.

**React #185 (D8): 0 lines** in either `app.log`, across 525 s of two or more children streaming at once.

| item | verdict | session / call / row |
|---|---|---|
| **D1** code-intelligence EDIT writes counted | **NOT REACHED** | 0 EDIT-tier calls. Only the tester b held the tier (app.log `surface for tester`), and it wrote through `write_file` #60 and `haet_edit` #61. Every child's `edited_files` equals its successful `write_file`/`haet_edit` paths (a 1, b 1, c 1, d 2, e2 1, f2 3; e1 and f1 0). |
| **D2** 45-minute per-agent timeout | **PASS; tag NOT REACHED** | `child_timeout=2700 s` in `duress/app.log` lines 13 and 31; `childTimeoutS: 2700`; `duress/agents.yaml` in the pack. No child cut off. f1 (verifier) 1,253.2 s, the only life past 1,200 s; 0 compressions inside a child (largest child prompt 55,449, f2); 0 parent resumes; condition a′ not applicable. |
| **D3** routing sentence vs architect write scope | **FAIL against OQ-250's target of 0 (reopening condition, first limb)** | #92 (req 59, row 168); refused 08:18:58.750; re-briefed by req 65 (30.0 s, rows 173/179) as e1 without a scope (#111) plus e2 with `inherited_context` (#163). See D3 below and V1. |
| **D5** PD-TOOLS-014/015/016 | **NOT REACHED** | 13 `haet_edit` and 5 `write_file` edits (d #143, #148, #149, #150, #159), all applied first time; 0 near-miss, 0 "shifted", 0 refusal; LF fixture. Harness NOTE agrees. |
| **D6** PD-ORCH-016 raw-count fallback | **NOTE: reached, held, not discriminating** | One activation: the orchestrator's 60th call (#300, 09:06:51.839). Classifier req 194 cut at 1,994 ms; fallback found no evidence (last four calls #297 `read_file`, #298 `read_file`, #299 `read_file`, #300 `grep`), so `continue`; no timeline entry. The pre-ruling same-name limb would not have fired either: `grep` is last. |
| **D9** failed child's summary opening | **NOT REACHED** | 0 failed children. |
| **PD-TOOLS-013 rev 2** cut calls read `interrupted` | **NOT REACHED** | No call cut in flight; `run_end` 09:07:21.284 came before the capture's quit (09:07:25.7); 0 `interrupted` rows. Only the analyst request (req 198, 4.4 s) was cut, as at every pack (REQ-LIBRARY-127). |
| **PD-ORCH-015** plan correction | **NOT REACHED** | All 8 plan items closed by `update` (#302 the last) before the answer (req 197, row 557); 0 requests carry the correction or a held answer. |
| **PD-TOOLS-006 rev 7 / PD-TOOLS-008 rev 2** | **PASS** | 6 admissions naming a PENDING item answered "is now IN_PROGRESS" (#15, #16, #17, #91, #163, #214); after #17 three items read `[IN_PROGRESS]` at once with no refusal. #247 named an item f1 already held IN_PROGRESS (no line, correct). **`todo` replaces restoring COMPLETED items IN_PROGRESS: 0** — 1 replace in the run (#14, the opening write) and 9 updates; **cost 0 s.** 4e69b00's path stays latent. |
| **XE1** cross-file edit paths | **NOT REACHED** | 0 `replace_in_files`, `rename_symbol` or other cross-file EDIT calls. |
| **Loop-classification cap** | **PASS** | req 194 dispatched 8 ms after #300 started, aborted at 1,994 ms; the next orchestrator request at 09:06:53.859, 2.02 s after #300. Within the 2,000 ms activation budget; the 6 ms between "what remains" and "the whole bound" is below this pack's resolution. |
| **CN1** timed-out tag | **NOT REACHED** | No child timed out; `duress.png` shows every agent `done`. |
| **D8** React #185 / "Maximum update depth" | **0 lines** | 0 `renderer console` lines in `duress/app.log`, `duress/app.filtered.log`, `sign-in/app.log`, `sign-in/app.filtered.log`; the relay is live (`apps/desktop/src/main/capture/index.ts:30`). Concurrent child streams: 08:14:11–08:16:11 (119 s; a, b, c) and 08:19:28–08:26:16 (407 s; d and e1), including d's 138.1 s req 80 overlapping e1's reqs 78, 79 and 81 by 40.7, 49.7 and 45.5 s, the shape of the `a68f121` errors. |

## Sizing

| item | value |
|---|---|
| run (`run_started_at` → `run_end`) | 08:12:57.577 → 09:07:21.284, **3,263.7 s**; the harness's 3,273 s counts from launch |
| iterations / tool calls / children | 1 / 303 / 8 (orchestrator 63) |
| requests | 199: orchestrator 41, children 147 (a 15, b 12, c 12, d 19, e1 15, e2 24, f1 18, f2 32), report summariser 8, intent classifier 1, loop classifier 1, analyst 1. 196 completed; 3 aborted (intent at 11,975 ms, loop at 1,994 ms, analyst at the quit). 5 responses were cut by the recorder at 1 MB (reqs 80, 96, 144, 145, 149); their record-level `usage` is intact. |
| tokens | 5,800,296 in / 307,187 out (232,400 reasoning, 75.7 %); orchestrator 1,873,382 / 23,895 |
| failures | 9 `failed` + 1 `blocked`: `todo` with no operation (#13, gate), `edit_memory` without its fields (#288, gate), `delegate` write-scope refusal (#92), `read_file` of `node_modules` (#136) and `.rotaris/artifacts` (#197), 4 terminal exits ≠ 0 (#31, #67, #222, #232), 1 permission deny (#63, `starter:deny-recursive-delete`) |
| issues | 10: `tool_error` 5, `terminal_shell_failure` 4, `permission_denied` 1 |
| waits | `wait_for_tasks` ×5 held 2,867.0 s, 87.8 % of the run |
| largest prompt | 88,720 (req 197, the answer), 34 % of 262,144; 0 compressions |
| endpoint pace | median 78.7 output tokens/s over 98 requests of ≥ 500 output tokens (47.1–97.3); no slow tail |

| child | persona | life | requests | generation | output (reasoning) | calls | first write | steps > 45 s | summariser |
|---|---|---|---|---|---|---|---|---|---|
| a: docs/api.md | docs-writer | 208.5 s | 15 | 194.0 s | 13,267 (50 %) | 23 | +134 s | 1, 79.3 s | 14.1 s |
| b: test/extra.test.js | tester | 150.2 s | 12 | 115.5 s | 6,270 (33 %) | 12 | +55 s | 0 | 30.6 s |
| c: docs/overview.md | docs-writer | 123.0 s | 12 | 95.7 s | 5,384 (39 %) | 23 | +79 s | 0 | 26.9 s |
| d: reconcile | docs-writer | 449.2 s | 19 | 436.8 s | 33,561 (86 %) | 36 | +241 s | 3, 250.6 s | 11.7 s |
| e1: design analysis | architect | 547.9 s | 15 | 521.2 s | 33,854 (73 %) | 32 | — | 5, 422.4 s | 26.4 s |
| e2: docs/decisions.md | docs-writer | 389.9 s | 24 | 372.1 s | 29,404 (66 %) | 42 | +307 s | 1, 90.6 s | 16.9 s |
| **f1: verify** | verifier | **1,253.2 s** | 18 | 1,217.2 s | 109,457 (91 %) | 27 | — | **10, 1,150.0 s** | 31.7 s |
| f2: docs/verification.md + fixes | docs-writer | 515.3 s | 32 | 495.5 s | 40,665 (75 %) | 45 | +301 s | 2, 136.6 s | 18.6 s |

**Critical path** (sums to the 3,263.7 s run):

| segment | span | what held it |
|---|---|---|
| launch → wave 1 wait | 84.0 s | intent classifier cut at 12 s (Q2); `list_memories` #2 3.2 s on the code-intelligence connect; #13 refused and re-sent (req 8, 5.5 s); a three-`delegate` step (req 9, 27.1 s) |
| wave 1 wait (#24) | 198.7 s | a, then its summariser (14.1 s) |
| orchestrator | 115.9 s | 10 reads, 4 closes, d and the refused #92 (req 59, 32.7 s), the re-brief (req 65, 30.0 s) |
| wave 2a wait (#116) | 540.5 s | e1 (its last step, req 96, 198.3 s), then its summariser (26.4 s); d ended at 08:26:27.9 |
| orchestrator | 21.8 s | req 98 (17.6 s) briefed e2 |
| wave 2b wait (#166) | 385.7 s | e2 |
| orchestrator | 56.9 s | 4 reads, 3 closes, briefed f1 (req 130, 18.8 s) |
| wave 3a wait (#219) | 1,243.8 s | f1 |
| orchestrator | 75.6 s | retrieving f1's report (#243–#246, about 19 s) and the 7,123-character brief (req 155, 39.4 s) |
| wave 3b wait (#252) | 498.2 s | f2 |
| answer | 42.5 s | 5 reads, a `grep`, the loop classification (2.0 s), a memory, `todo` #302, `write_memory` #303, the answer (req 197, 11.4 s) |

Summariser passes on the critical path: 107.7 s (a, e1, e2, f1, f2); all 8 passes 176.9 s (OQ-114, kept).

## The items, read

### D2 — the 45-minute per-agent timeout (OQ-214's second ruling, PD-CONFIG-003)

- **The harness change's first execution holds** as OQ-214's "Not yet measured" asks: `child_timeout=2700 s` (app.log lines 13
  and 31), `results.json` `childTimeoutS: 2700` with the NOTE, `duress/agents.yaml` in the pack (the workspace copy differs only
  by that key).
- **No child was cut off.** Lives: a 208.5, b 150.2, c 123.0, d 449.2, e1 547.9, e2 389.9, **f1 1,253.2**, f2 515.3 s. f1 used
  46 % of the raised limit.
- **f1 is the case the raise was for.** It spent 1,217.2 s of its 1,253.2 s generating, 91 % reasoning, ten steps over 45 s
  (reqs 139–149: 85.7, 113.3, 112.9, 98.3, 141.9, 128.9, 116.6, 91.4, 104.3, 156.7 s), auditing the citations its brief
  asked for (#214: "Re-read every file they touched … CHECKS TO PERFORM"). Its final step (req 149, the 20,195-character report)
  ran from +1,064.8 s to +1,221.5 s. Under the 1,200 s default the ceiling falls inside that step: `orchestration.ts:1363` sets
  `timedOut` at the ceiling and `:1557` records the child `failed` with "Child timed out after 1200s" whatever the landing step
  brings, and the step would have landed at +21.5 s, inside `CHILD_LANDING_GRACE` (30 s). **So at the default the verifier
  would have been the third duress verifier to end `failed`** (`c2a9444`'s at 1,087 s succeeded; `a68f121`'s two failed).
- **The relief is measured, but only as a file edit.** The harness writes `runtime.child_timeout` into `agents.yaml`; the
  Settings control itself was driven at PD-CONFIG-003's first execution, not here.
- **The tag's "45 minutes" reading (CN1, PD-CONFIG-003 revision 3): NOT REACHED.**

### D3 — the architect write-scope refusal at #92, despite the routing sentence

- **The sentence was present.** `ROUTING_WORK_SENTENCE` closes the routing table in 41 of 41 coordinator requests, and
  `delegate`'s brief clause is in 41 of 41 `delegate` descriptions. The catalogue reads "architect (reads workspace files)".
- **Why it happened.** Req 59's reasoning (row 168) assigns the scope by habit and never weighs the facets: "(e)
  docs/decisions.md — write scope docs/decisions.md. These are non-overlapping scopes". The route chosen is "design →
  architect", which the table lists ahead of the sentence, and the user's wave-2 item reads "one design decision it embodies".
  The decision to write a scope was made about scope overlap, not about the persona.
- **The sentence worked only after the refusal.** Req 65 (row 173) quotes it: "Per the orchestrator guidance: 'Where the route's
  persona lacks what the work needs, ask it for its answer and hand that answer to one that has it'", and splits e into e1
  (architect, no scope, #111) and e2 (docs-writer, `inherited_context: ["bg_0afe2a2a"]`, #163) — exactly the hand-off OQ-250's
  "What a live run then shows" names. Wave 3 went the same way unprompted: f1 (verifier, "You cannot write files — your REPORT
  is the deliverable") then f2 (docs-writer).
- **The enforced bounds held.** Refused before any record ("The delegation was not started", issue 5); 0 unknown-tool calls; 0
  stray files; 0 briefs offering a command to a persona without one (the docs-writer briefs #15, #17, #91, #163, #247 say what
  not to run); the answer claims no command a persona could not run. Missing-shell asides: 5 of 117 requests of the
  non-commanding personas (c 1, d 1, e1 1, f2 2), against 16 of 117 at `a68f121`.
- **Cost.** The refusal itself: the 5 ms call, issue 5, a 1,837-character brief discarded, and req 65 (30.0 s, 1,594 output
  tokens), which started e1 30 s later on the wave's critical path. The split it led to is the ruled route and no slower than
  `a68f121`'s single docs-writer (e1 + req 98 + e2 = 955.5 s against 1,059.7 s), but it lost most of e1's 548 s of work (V1).
- **OQ-250's reopening condition, first limb, is met:** "if a later duress run shows any `write_scope` refused for a non-writer
  … A's computed per-route clause is weighed as the next `PD-TOOLS-006` revision." The second limb (an enforced bound broken)
  is not.

### D6 and the loop-classification cap

- The supervisor activated once, at the orchestrator's 60th tool call (#300 `grep`, 09:06:51.839; `toolThreshold: 60`). No
  child reached 60 calls (f2's 45 was the most).
- The classifier (req 194, system "You classify an agent conversation for a repeated-work loop") was dispatched at
  09:06:51.847 and aborted at 1,994 ms; the bound is `min(classificationTimeoutMs, LOOP_ACTIVATION_BUDGET_MS − elapsed)`
  (`supervisor.ts:251-252`), both 2,000 ms. The run lost 2.02 s.
- `rawFallbackHasEvidence` found nothing: the last three non-empty messages differ, and the last four tool fingerprints are
  three `read_file` calls on three windows plus a `grep`. `continue`, no injection, no timeline entry.
- **Not discriminating for PD-ORCH-016:** #296–#299 were four `read_file` calls, which the name-only limb would have counted,
  but the trigger fell one call later, on the `grep`.

### D8

0 occurrences, under conditions comparable to the `a68f121` errors (two children streaming long reasoning in parallel; a
929 kB transcript). An absence in one pack does not discharge the open note
`the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`; its "What a live run should show" is
answered here with a count of 0. The NOTE line the note says is owed (a count of #185 lines in the harness output) is still
not in the harness.

## Run autopsy — 18a9d22d-5a5a-403c-808e-57e0c942982b (duress, v1-89d793e5bbd827d8adddaac9922a2a8f, 3,263.7 s, 5,800,296 in / 307,187 out)

The run completed `tasks_complete` in three waves. Wave 1: a, b, c in parallel. Wave 2: d, and e split into e1 (architect)
and e2 (docs-writer) after #92 was refused. Wave 3: f1 (verifier), then f2 (docs-writer). The coordinator closed all 8
plan items and answered at 09:07:14 (row 557); the analyst was cut at the quit (req 198).

### V1. Carry the whole of a sibling's answer through the hand-off the routing sentence prescribes, not REQ-ORCH-060's 4,000-character report block
- **Class**: bug (spec tension)
- **Status**: new. No note in `docs/defects/` or `fixed/` covers it.
  `fixed/the-inherited-context-reports-never-reach-the-child.md` repaired the block's absence (2026-09-28) and built it from
  `reportBlock`, which is where the cap came from.
- **Proposed note:** `docs/defects/an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md` <!-- historical-path: docs/defects/an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md -->
- **Description:** `inheritedContextBlock` (`notify.ts:113-115`) renders each inherited sibling with `reportBlock`, whose
  result text is capped at `REPORT_BLOCK_CAP = 4_000` (`notify.ts:12`, `:32-35`), the cap REQ-ORCH-060 fixes for the resume
  message's report blocks. REQ-TOOLS-152 says `inherited_context` carries "reports" and names no cap; `depends_on` carries
  "summary and key findings" only; `attach_artifacts` carries an artifact's full body, but a child report's artifact holds
  summary, findings, commands and files, not the final response. So no channel a child can read carries a sibling's answer
  past 4,000 characters, and the child is told nothing of the limit until it meets the marker. Only the coordinator's
  `background_output detail_level: verbatim` returns the whole (#246, 41,752 characters). `PD-TOOLS-006` revision 8's
  sentence sends exactly the long answers (a design analysis, a verification report) through `depends_on` or
  `inherited_context`.
- **Evidence**:
  - e1's `final_response` is 28,330 characters; e2's payload (req 99) ends the block "**(c)** `src/todos.js:9` — `/** The next
    fr … [24330 characters omitted]`". f1's is 20,195; f2's payload (req 156) carries "… [16195 characters omitted]". The
    coordinator's own waits were cut the same way (#116 at 4,122 characters, #219 at 4,113).
  - e2, rows 301–352: "The inherited context truncated the architect's full report (24330 characters omitted)". It
    hunted with 7 calls: `artifact_read` with sections #167, `artifact_list` #169, `glob **/*e1*` #173, `read_file .` #181,
    `.rotaris` #183, `.rotaris/agents.yaml` #187, `.rotaris/artifacts` #197 (failed, issue 7). 12 of its 24 steps reason about
    the cut.
  - e2's report: "I only received its summary and first ~2.4k characters … the per-file sections beyond `todos.js`/`nextId`
    were written from my own reading of the files". Its brief (#163): "the analytical judgement … is already made — do not
    substitute your own."
  - The coordinator saw it at row 370 ("That's acceptable") and again at row 438 ("the architect's artifact got truncated when
    passed to e2 — that's a risk"). For wave 3 it spent #243–#246 and a 7,123-character brief re-typing f1's findings into
    f2's task ("in that case use what you have and do NOT invent the missing parts"). f2 still met the cut: 9 of its 32 steps
    reason about it, and req 168 says "the detailed branch walk text was omitted … I must not invent evidence".
  - Req 98 (row 293) believed "The architect didn't publish an artifact" (it had, `art_cmzbxo05`); the wait results carry no
    artifact id.
- **Cost**:
  - 7 of `docs/decisions.md`'s 8 file sections (App.jsx, main.jsx, styles.css, index.html, both test files, package.json) are a
    docs-writer's judgement, not the architect's. 86 % of e1's 547.9 s analysis never reached the document.
  - The disclosure reached neither e2's summary ("based on the inherited analysis"), timeline 51, nor the user: the answer (row
    557) says "the architect's read-only design analysis … produced `docs/decisions.md`".
  - `docs/verification.md` was written from the coordinator's paraphrase and the first 4,000 characters of the verifier's
    report.
  - About 19 s and 4 calls on the critical path for the coordinator's retrieval, plus req 155's 39.4 s brief; 7 hunting calls and
    1 issue in e2; reasoning in 12 + 9 child steps.
  - Every harness check passes over it.
- **Spec**: PD-TOOLS-006 revision 8 (OQ-250, the routing sentence and its hand-off); REQ-TOOLS-152 (`inherited_context`,
  `depends_on`, `attach_artifacts`); REQ-TOOLS-154 item (5); REQ-ORCH-032; REQ-ORCH-060 (the 4,000 cap, written for the
  resume message); REQ-ORCH-047 (the prior-agent-context block).
- **Files**: `packages/engine/src/children/notify.ts:12`, `:32-35` (`cap`), `:42` (`reportBlock`), `:113-115`
  (`inheritedContextBlock`); `packages/engine/src/children/ledger.ts:372`; `packages/engine/src/children/orchestration.ts:511`,
  `:1295` (`childPayload`); `packages/engine/src/children/personas.ts:288` (`ROUTING_WORK_SENTENCE`);
  `packages/agent-tools/src/tools/delegation.ts` (`delegate`'s parameters carry no description of what each channel carries).
- **Ruling needed: yes.** The cap is faithful to REQ-ORCH-060 where that requirement applies, and REQ-TOOLS-152 does not say
  whether the inherited report is the whole final response. The ruling decides which channel carries an answer whole (the
  inherited block uncapped or with a larger cap, a child report's artifact holding its final response, or the sentence naming
  a channel that does), and whether the child is told a block was cut.

### V2. Weigh OQ-250's per-route clause: the routing sentence did not keep the coordinator from giving `architect` a write scope
- **Class**: friction (owner question)
- **Status**: recurrence of D3 (`a68f121`), L4, N3, ruled by OQ-250 as `PD-TOOLS-006` revision 8 and built
  (`fixed/the-routing-table-leads-the-coordinator-past-delegates-catalogue.md`). This is the ruling's first duress measurement.
- **Proposed note:** `docs/defects/the-routing-sentence-did-not-stop-a-write-scope-for-architect.md` <!-- historical-path: docs/defects/the-routing-sentence-did-not-stop-a-write-scope-for-architect.md -->
- **Description:** with the sentence and the catalogue in every coordinator request, the coordinator routed "design →
  architect" and gave the scope, then followed the sentence only once the refusal named the writers.
- **Evidence**: #92 (req 59, row 168), refused at 08:18:58.750 (issue 5); req 65 (rows 173, 179) quotes the sentence and
  re-routes. The harness NOTE: "1 write-scope refusal(s) (duress #92: architect); 0 unknown-tool call(s) by a child".
- **Cost**: 30.0 s on the wave's critical path, one refused call and issue, one discarded brief. Far below `a68f121` (19.4 s
  plus an impossible brief and a gate refusal), and no longer on a failed child's path.
- **Spec**: PD-TOOLS-006 revisions 3, 4 and 8; OQ-250's reopening condition; OQ-216's target of zero; REQ-ORCH-028.
- **Files**: `packages/engine/src/children/personas.ts:288-289` (`ROUTING_WORK_SENTENCE`, `ROUTING`),
  `packages/agent-tools/src/tools/delegation.ts` (the catalogue and the write-scope refusal), `apps/desktop/scripts/lib/routing-misses.mjs`.
- **Ruling needed: yes**, by OQ-250's own terms: weigh Advocate A's computed per-route clause as the next revision. V1 bears on
  it: the route the sentence prescribes currently loses the answer it hands on.

### V3. The intent classifier is cut at 12 s on the duress prompt after it had decided, while it reasons about the object's field names
- **Class**: friction (observation)
- **Status**: recurrence of the default autopsy's **Q2** (same build; "cause not separable"). This pack adds a candidate cause.
- **Proposed note:** none yet. This is evidence for Q2 and PD-ORCH-011 revision 2's first-execution report.
- **Evidence**:
  - req 0 aborted at 11,975 ms; the launch audit reads `fallback: true`, "the classification call timed out after 12 s", so the
    run was `moderate_feature`. At `a68f121` the same prompt read `whole_project` 0.999 in 9.3 s.
  - The endpoint was not slow (median 78.7 tokens/s; this response streamed 94,743 bytes).
  - The reasoning (4,068 characters) settled early on "whole_project", then spent the rest on the output's shape: "Which key?
    … I can't know … `{"classification":"whole_project"}`". The request's text ends "Reply with the classification object
    only." and names none of its fields (`intent`, `confidence`, `reason` appear only in `response_format`'s schema).
- **Cost**: 12.0 s on the critical path and the run's category. No visible change in the run's shape followed.
- **Spec**: PD-ORCH-011 revision 2; REQ-ORCH-006 and REQ-ORCH-010 (the fallback).
- **Files**: `packages/engine/src/intent/classifier.ts:110` (`SCHEMA_INSTRUCTION`), `CLASSIFICATION_TIMEOUT_MS`.
- **Ruling needed: no, not yet.** Whether the request text should name the object's fields is a question for Q2's report.

### Model behaviour meeting spec-faithful gates (no finding)

| call | what | recovery |
|---|---|---|
| #13 `todo` | sent without `operation` → `invalid_request` (issue 1), as the default pack's requirements #10 | #14 one step later, 5.5 s |
| #288 `edit_memory` | used as an overwrite (`content`, `memory_name`); refused at the gate naming `needle`, `repl`, `mode` (issue 10) | `write_memory` #291, under another name |
| #63 `terminal` | `rm -rf /tmp/mutcheck …` denied by `starter:deny-recursive-delete` (issue 3) | `mktemp -d` #65, 7.5 s later |
| #67 `terminal` | `${PIPESTATUS[0]}` under `/bin/sh` ("Bad substitution"); the description warns of exactly this | #68 rewritten |
| #31, #222, #232 | probes whose last command exited ≠ 0 (`ls test`, `grep -c` = 0, a missing lockfile), filed `terminal_shell_failure` at `error` | none needed |
| #136, #197 | `read_file` of a missing directory; the refusal lists the parent's contents, ignore components hidden | — |

## Recurrences and repairs that held

| item | here |
|---|---|
| `a68f121` D1 (EDIT writes) | not reached (above) |
| `a68f121` D4 (marker directory) | **holds.** 0 file-tool results list `.serena`; the only deliverable mention is c's faithful quote of the user's `.gitignore` line `.rotaris/` (#64); f1's `find` excluded both directories itself (#226, #234); 0 memories mention them. e2's three reads into `.rotaris` were a search for V1's missing text. |
| `a68f121` D5 (whitespace misses) | not reached (0 misses) |
| `a68f121` D7 (single-active refusal) | **holds** (PD-TOOLS-008 rev 2, above) |
| `a68f121` D8 | 0 (above) |
| default Q1 (`send_signal`) | not exercised (no session actions) |
| default Q2 (classifier cut) | **recurs** (V3) |
| default Q3 (no-item refusal) | not reached (0 todo-item refusals; e1 named no item and, as a non-writer, owed none) |
| L2/N1 (long argument stream read as a stall) | holds: 0 `stall` issues, 0 WARNING lines in `session.log` |
| G4 / OQ-114 fixed figures | summariser 107.7 s on the critical path; loop classification 2.0 s; analyst cut at the quit after 4.4 s ("Reviewing run for improvements…" in `duress.png`) |

## Log triage

- `duress/app.log` (314 lines): 305 `info` main lines, of which 199 are "model request POST" and 29 are REQ-MONITOR-118's
  `waiting_on_tools` for the waiting orchestrator (91–1,173 s, info, as specified). No `warn`, no `error` from the app, no double
  emission, no child stderr. Chromium noise per launch: 7 D-Bus lines and one `LatencyInfo vector size … is too big`.
- `sign-in/app.log`: the three known `info` quit lines and one `atom_cache` line.
- `session.log`: INFO only (coordinator-only tool removals, `waiting_on_tools`, "run ended completed").

## The NOTE lines

| NOTE | verdict |
|---|---|
| sign-in: discovery did not run | Correct. |
| the long run's per-agent timeout, 2,700 s | Correct; see D2. |
| what the long run commissioned | Correct as counted. It does not say that e1/e2 and f1/f2 are hand-offs, nor that the hand-offs were cut (V1). |
| the long run never compressed its context | Correct: 88,720 (34 %) against 157,286. |
| how long the long run was | Correct: 3,273 s from launch, 303 calls, 8 children, 0 compressions. |
| no ceiling was imposed | Correct: 6,107,483 = the store. |
| no `write_file` left out its operation | Correct (0 inferred creates). |
| write scopes to a non-writer: 1 (#92) | Correct; V2. |
| no `haet_edit` miss at level 2 or 3 | Correct; PD-TOOLS-014 not reached. |

No check reads a child's payload for a truncation marker (V1), and none counts renderer console errors (D8's owed NOTE).

## Unverified (no finding drawn)

- **The match level of each successful edit.** The results do not state it, and the sandbox files are gone.
- **What the 2,700 s raise cost elsewhere.** Only f1 crossed 1,200 s, so this pack cannot show a child that uses the raised limit
  on off-task work.
- **Whether e2's reconstructed sections differ from e1's.** e1's full analysis is in its stored report, but the delivered
  `docs/decisions.md` is not in the pack (only e2's `write_file` content and three edits). A section-by-section comparison
  was not made.

## Defect notes and first executions

- **New, not recorded** (the brief made this examination read-only; CLAUDE.md's standing policy records such notes without
  asking):
  - **V1**, a product defect needing a ruling: proposed note
    `an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md`.
  - **V2**, OQ-250's reopening condition met; this needs a ruling. Proposed note:
    `the-routing-sentence-did-not-stop-a-write-scope-for-architect.md`.
  - **V3**, evidence for Q2; no note yet.
- **First executions this pack reports, each owed in place plus a `first-executions.md` row:**
  - **OQ-214's second ruling / PD-CONFIG-003's raised limit:** PASS, with f1 at 1,253.2 s in one life. The tag (revision 3) was
    NOT REACHED.
  - **PD-TOOLS-006 revision 8 / OQ-250:** 1 refusal against a target of 0, so the reopening condition is met. The enforced
    bounds held. The prescribed hand-off ran twice and lost 86 % and 80 % of the answer (V1).
  - **PD-TOOLS-008 revision 2 and PD-TOOLS-006 revision 7 under duress:** PASS. 0 restored-COMPLETED replaces, 0 s.
  - **PD-ORCH-016 and the loop-classification cap:** reached once and held. Not discriminating.
  - **PD-TOOLS-012 (OQ-215) duress measurement:** file tools clean, no marker files in the deliverables.
  - **D8 note:** 0 lines.
  - **Found nothing because not reached:** the D1 repair, XE1/OQ-245, PD-TOOLS-013 revision 2, PD-ORCH-015,
    PD-TOOLS-014/015/016, PD-CONFIG-003 revision 3 (CN1), and the D9 repair.

**Highest-cost finding: V1.** The route the routing sentence prescribes handed the writer 14 % of the architect's
548-second analysis and 20 % of the verifier's report. As a result, `docs/decisions.md` is mostly the writer's own judgement,
and the user's answer says otherwise. V1 and V2 are ready to be recorded in `docs/defects/` on a go-ahead, and both need a
ruling.
