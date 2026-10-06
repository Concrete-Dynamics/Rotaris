## The Continue action classifies the intent again and changes the resumed root's tools in the middle of its iteration

Every continue runs REQ-ORCH-005's pre-flight again (`launchContinuation`). That includes the Continue action, which
brings no message of its own, so it classifies the session's last user prompt a second time. Whatever that
classification returns governs the resumed run: its playbook, its budget clamp and the entry role's grant, through
REQ-ORCH-016's intent-to-tools mapping. PD-ORCH-005 clause 4 resumes "the iteration where it stood", yet the
coordinator's tools can change in the middle of that iteration. REQ-ORCH-013's carry-over applies only when the fresh
classification is unusable. A launch that fell back on a timeout and a continue whose classification succeeds can
therefore produce different intents.

In the default live run's `resume` scenario the launch's classification timed out at 12 s and fell back to
`moderate_feature`, so the orchestrator ran coordination-only with 24 tools. The user paused and pressed Continue
2.7 s later. The Continue's classification of the same prompt took 6,596 ms and returned `explicit_trivial` (0.92).
The resumed orchestrator was then offered 29 tools, in the middle of its iteration: the direct-work bundle added
`fetch`, `haet`, `haet_edit`, `terminal` and `write_file`. Clause 14's fingerprint then raised a
`resumed_under_changed_instructions` warning, although no persona had been edited and the user had made no change. The
header kept showing the launch's intent ("Intent: moderate_feature (fallback: the classification call timed out after
12 s)"), because `intentStatusOf` reads only the launch audit. The coordinator used none of the tools it gained.

Live-run finding: a71-3

OQ-105's reading already covers the warning half ("every continue runs the pre-flight again"). Whether the Continue
action classifies at all, and whether the grant may change mid-iteration, are raised as
[OQ-162](../../architecture/open-questions.md). Recorded, not repaired.

## Specs

- `PD-ORCH-005` clause 4: "Continuing resumes the iteration where it stood … each carries on from its last message."
- `PD-ORCH-005` clause 14: "A resumed agent runs with its persona's current instructions and tools". Here the persona
  did not change; the run's classification did.
- `REQ-ORCH-005`: the classified intent "MUST be in effect before the first iteration so that intent-dependent behavior
  (capability gating, …) applies from iteration 1". A resumed iteration is not a first iteration.
- `REQ-ORCH-013`: the prior intent is inherited only "when (a) the fresh classification is unusable".
- `REQ-ORCH-016`: the intent-to-tools mapping "MUST gate the entry role's tool set".
- `REQ-ORCH-014`: the status conveys "the classified intent". After the continue the header shows the launch's intent,
  not the one the resumed run used.

## Evidence

- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/` (the `accept` worktree; git-ignored), session `390a39f0`:
  - `resume/model-traffic.jsonl` #0 is the launch classification (11,958 ms). The launch audit records
    `moderate_feature`, fallback "the classification call timed out after 12 s", `intent_grant: none`. #2 is the
    orchestrator's request with 24 tools.
  - Timeline #4 to #7: the pause, from 02:47:19.071. #5 in the traffic is the Continue's classification (6,596 ms →
    `explicit_trivial`). Timeline #10, `run_continuation_intent`, carries `intent_grant: direct-work`, and transcript row
    13 reads "Intent classified: explicit_trivial".
  - Traffic #8: the resumed orchestrator's request with 29 tools.
  - Issue 1 and row 14, at 02:47:28.464: "Agent orchestrator (bg_ffdd425f) resumed under changed instructions: its
    system instructions and tool definitions differ from the ones it started with."
  - `resume/resume.png`: the header band reads "Intent: moderate_feature (fallback: the classification call timed out
    after 12 s)".

## Relevant files

- `packages/engine/src/sessions.ts:2050-2055` — the Continue action (`continueSessionHeld`): the last user prompt is
  handed to `launchContinuation` as the prompt to classify.
- `packages/engine/src/sessions.ts:1509` — the continuation's pre-flight, given `previousIntent` and
  `hasUnfinishedWork: true`. Its grant becomes `decided.grant` for the run's tool ports.
- `packages/engine/src/sessions.ts:464-471` — `previousIntent`: the launch audit's category, whether or not it was a
  fallback.
- `packages/engine/src/intent/classifier.ts:259-263` — `carryOver` (REQ-ORCH-013): only an unusable fresh result
  inherits the prior intent.
- `packages/engine/src/run/run.ts:785-791` — the pre-flight before the resumed iteration, and the "Intent classified"
  row.
- ~~`packages/engine/src/sessions.ts:849-858` — `intentStatusOf`, which reads the launch audit only.~~ Repaired
  2026-10-01: see below.

## Partly repaired: the header (2026-10-01)

The header half is repaired; the rest stays open under [OQ-162](../../architecture/open-questions.md), the owner's.

- **Repaired.** The record's intent status (REQ-ORCH-014) is the intent in effect: the newest `run_continuation_intent`
  entry's payload, else the launch audit's (`intentPayloadOf` in `packages/engine/src/sessions.ts`, read by both
  `readSession`s, over `StoreDal.latestTimelineEntry` in `packages/store/src/dal.ts`). After the live run's Continue the
  header would read the continuation's `explicit_trivial`, not the launch's fallback `moderate_feature`. Pinned by
  `packages/engine/src/run/preflight.test.ts`, "REQ-ORCH-014 (OQ-162, live-run finding a71-3): after the Continue action
  the status is the intent the continuation classified, not the launch's" (the launch falls back to `moderate_feature`,
  the Continue classifies `explicit_trivial`, the last published record reads `explicit_trivial`; it fails with the
  `readSession`s reading the launch audit alone), and "… the status reads the newest continuation intent over the launch
  audit …"; the DAL read's query plan by `packages/store/src/store.test.ts`. OQ-162's built reading is changed in place.
- **Repaired, the transient status.** While a continuation's pre-flight classification is in flight, the status reads
  `classifying` (REQ-ORCH-014's first clause), not the previous run's intent, and the result replaces it in place: the
  live run's pre-flight sets `Run.intentClassifying` before the save that publishes `starting` and clears it when the
  call returns or raises, and `intentStatusOf` reads it first. Before this, a continue by the Continue action showed the
  launch's fallback for the whole classification call (6.6 s in the live run, up to the 12 s bound). Pinned by
  `preflight.test.ts`, "REQ-ORCH-014 (OQ-162): while a continue classifies, the status reads `classifying`, and the new
  intent replaces it in place" (the continuation's classifier is held; every published `starting` record reads
  `classifying`; it fails without the flag), and the unit case "classifying while starting with no audit …".
- **Open, the owner's (OQ-162).** The Continue action still classifies the last user prompt again; a successful fresh
  classification still replaces a fallback launch intent; the new grant still reaches the resumed root in the middle of
  its iteration (24 tools to 29 in the live run), and clause 14's fingerprint still raises
  `resumed_under_changed_instructions` although no persona changed; the classification still adds its time (6.6 s in
  the live run) to the Continue. Whether any of this changes is the ruling's.
- **Shown in the built app** by the live run's `resume` scenario at this repair (pack `.live-run/runs/2026-10-01T15-19-31-213Z/`
  of the `fin1-stallandinte` worktree, git-ignored; the self-hosted `katalyst` endpoint): the launch's classification
  timed out and fell back (`moderate_feature`, "the classification call timed out after 12 s"); the Continue's was
  unusable too and carried the launch's intent over (timeline #12, `carried_over: true`); and `resume/resume.png`'s header
  reads "Intent: moderate_feature (continued from the previous run)", the continuation's status, where it read the
  launch's fallback before. The categories did not diverge this time, so the grant did not change and no warning was
  raised; the case where they diverge is the test's.
- **Run again after the transient status** (pack `.live-run/runs/2026-10-01T16-06-59-097Z/`, same worktree and endpoint,
  `live-run PASSED`): the launch classified `small_feature` (0.72) and the Continue classified `small_feature` again
  (0.86, timeline #12, written just before the resumed run's `run_start` #13); `resume/resume.png`'s header reads
  "Intent: small_feature". The harness takes no screenshot while the Continue's classification is in flight, so the
  `classifying` status in that window is shown by the test alone, not in the built app.


Observed again at origin/main 1763f7f (live run 2026-10-03), in the `resume` scenario of the default pack
(`.live-run/runs/2026-10-03T05-56-27-364Z/` of the `accept` worktree, git-ignored; the self-hosted `katalyst` endpoint),
session `0aa37938`: the launch's classification (traffic #0, 11,964 ms) and the Continue's (traffic #5, from
06:01:36.629, 11,996 ms) each ran to the 12 s bound and were aborted; timeline #10 (06:01:48.629) records
`carried_over: true`, `moderate_feature`, and the resumed iteration began at 06:01:48.644, so the classification added
12.0 s to the Continue's critical path. The widening half was not exercised: 24 tools before (traffic #2) and 24 after
(traffic #8), and no `resumed_under_changed_instructions` issue. The header half holds: `resume.png` reads "Intent:
moderate_feature (continued from the previous run)". No code changed: the note waits on the owner's ruling.

Observed again at origin/main `27a5127` (live run 2026-10-06, finding G1 of its autopsy), in a new shape: the playbook
changed mid-iteration, not the grant. Default pack `.live-run/runs/2026-10-06T01-30-08-282Z/` of the `live` worktree
(git-ignored; the self-hosted endpoint), session `4b497643`:

- The launch's classification fell back at the 12 s bound: `resume/model-traffic.jsonl` #0 was cut at 11,980 ms with
  3,837 reasoning characters and no answer, and the launch ran on the fallback `moderate_feature`.
- The Continue classified the same prompt again and succeeded: traffic #5, from 01:34:27.211, 8,598 ms →
  `small_feature` (0.82); timeline #10 `run_continuation_intent`; transcript row 14 "Intent classified: small_feature".
  The fresh result replaced the launch's fallback, as REQ-ORCH-013's carry-over allows.
- The resumed orchestrator's system prompt (traffic #8) differs from the one it started under (traffic #4) in exactly
  three playbook lines: CHUNKING "Divide the work into milestones…" → "Work in small steps…", VERIFY "Prove the change:
  run the full verification…" → "Run the checks that cover what you changed…", ARTIFACT "Leave a short written
  summary…" → "Produce no artifact beyond your report." The grant did not change: 24 tools before and after.
- Issue 1 (01:34:35.942, warning) `resumed_under_changed_instructions`, metadata `instructions_changed: true,
  tools_changed: false`, although no persona was edited and the user changed nothing. The children's prompts did not
  change (traffic #2/#6 and #3/#7 identical).
- The header's intent half holds: the status reads the continuation's intent (`resume/resume.png`).
- Cost: 8.6 s of classification on the Continue's critical path (20.6 s with the launch's 12.0 s, in an 87.7 s
  session), and a coordinator told in the middle of its iteration to verify and report less than it started under.

No code changed: the note stays open and waits on the owner's ruling of
[OQ-162](../../architecture/open-questions.md) ("Does continuing a paused iteration classify the intent again, and may the
resumed root's grant change with it?"). (The same scenario's run timing, which started after this classification,
is a separate defect: `docs/defects/fixed/a-continuations-run-timing-starts-after-its-pre-flight-where-a-launchs-counts-it.md`.)

## Repaired: ruled and built (2026-10-06)

The owner ruled [OQ-162](../../architecture/open-questions.md) and OQ-105 as recommended on 2026-10-06
([R-071](../../product/requests.md#r-071)), by [`PD-ORCH-005`](../../product/directives.md#pd-orch-005) revision 7 (clauses 14
and 40; built as revision 6, clauses 14 and 23, and renumbered before landing), and the ruling is built on branch `fin20-continue-and-continuation`:

- **The Continue action classifies nothing.** It, and the message-limit resolution, carry the intent in effect (the newest
  continuation's, else the launch's) into the pre-flight (`PreflightContext.intent`), which resolves the grant, the
  playbooks and the clamp for it with no classification call (`runPreflight` in `apps/desktop/src/run-host/intent.ts`). The
  classification's 6.6 s to 12 s no longer sits on the Continue's critical path, and the record reads the carried intent
  ("Intent classified: moderate_feature (continued from previous run)").
- **A resumed iteration keeps the intent and tools it started with.** A continue by message classifies its message for the
  run, and the iteration it resumes runs under the carried pre-flight (`RunDeps.resumedPreflight`, `Run.preflightInEffect`);
  the message's classification takes effect from the run's next iteration, once the resumed one has closed
  (`Run.nextIntentInEffect`). The coordinator's tools and playbook no longer change in the middle of its iteration.
- **No warning nobody caused.** Clause 14's fingerprint is taken of the persona's own definition (its instructions and its
  tool declaration), not of the whole request, and a change is stated once (`ConversationRecord.fingerprint`). A changed
  playbook, skill, MCP section or listing no longer warns.
- REQ-ORCH-013's prior intent is the intent in effect (`previousIntent`), so a second continue whose classification is
  unusable carries over what the status showed.

Pinned by `packages/engine/src/run/preflight.test.ts` ("OQ-162 as ruled: a continue resumes the paused iteration with the
intent and tools it started with": the Continue action classifies nothing and the resumed root keeps the launch's grant and
playbook with no warning — the live run's a71-3 and G1 shape; a continue by message's classification governs from the next
iteration; the prior intent is the intent in effect — each red on the code before the repair), by
`apps/desktop/src/run-host/intent.test.ts` (a carried intent makes no classification call), and by
`packages/engine/src/run/record.test.ts`'s clause 14 describe ("a resume whose playbook, skills, MCP section or tool listing
changed, with no persona edited, states nothing"; a change stated once). A live run's `resume` scenario should now show the
Continue with no classification request in `resume/model-traffic.jsonl` between the pause and the resumed orchestrator's
request, the same tool count and system prompt before and after, a `run_continuation_intent` entry with `carried_over: true`,
and no `resumed_under_changed_instructions` issue.
