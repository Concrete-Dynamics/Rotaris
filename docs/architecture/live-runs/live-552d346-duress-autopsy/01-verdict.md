# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Verdict

Part 1 of 9 of [the autopsy](../live-552d346-duress-autopsy.md), which indexes every part.

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
