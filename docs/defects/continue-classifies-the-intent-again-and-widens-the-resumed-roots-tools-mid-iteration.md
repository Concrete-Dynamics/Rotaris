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
[OQ-162](../architecture/open-questions.md). Recorded, not repaired.

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

The header half is repaired; the rest stays open under [OQ-162](../architecture/open-questions.md), the owner's.

- **Repaired.** The record's intent status (REQ-ORCH-014) is the intent in effect: the newest `run_continuation_intent`
  entry's payload, else the launch audit's (`intentPayloadOf` in `packages/engine/src/sessions.ts`, read by both
  `readSession`s, over `StoreDal.latestTimelineEntry` in `packages/store/src/dal.ts`). After the live run's Continue the
  header would read the continuation's `explicit_trivial`, not the launch's fallback `moderate_feature`. Pinned by
  `packages/engine/src/run/preflight.test.ts`, "REQ-ORCH-014 (OQ-162, live-run finding a71-3): after the Continue action
  the status is the intent the continuation classified, not the launch's" (the launch falls back to `moderate_feature`,
  the Continue classifies `explicit_trivial`, the last published record reads `explicit_trivial`; it fails with the
  `readSession`s reading the launch audit alone), and "… the status reads the newest continuation intent over the launch
  audit …"; the DAL read's query plan by `packages/store/src/store.test.ts`. OQ-162's built reading is changed in place.
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

