# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — The items, read

Part 3 of 9 of [the autopsy](../live-552d346-duress-autopsy.md), which indexes every part.

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
