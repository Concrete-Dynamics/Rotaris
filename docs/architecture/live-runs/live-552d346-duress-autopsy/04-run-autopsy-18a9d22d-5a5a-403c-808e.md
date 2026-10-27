# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Run autopsy — 18a9d22d-5a5a-403c-808e-57e0c942982b (duress, v1-89d793e5bbd827d8adddaac9922a2a8f, 3,263.7 s, 5,800,296 in / 307,187 out)

Part 4 of 9 of [the autopsy](../live-552d346-duress-autopsy.md), which indexes every part.

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
