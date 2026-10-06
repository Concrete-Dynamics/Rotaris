## slice-proof goes red on live-model answers that vary from run to run

Once the starter-configuration defect was repaired ([a-first-run-workspace-never-gets-the-starter-agents-yaml.md](a-first-run-workspace-never-gets-the-starter-agents-yaml.md)),
`pnpm slice-proof` against the registered `katalyst` endpoint (self-hosted, unmetered, model `qwen3.8-flash-next`) was
run five times on branch `finacc-accept1-3` with the code-intelligence bundle present (runs 2 and 3 on build `41af3a1`,
runs 4 to 6 on `f9365cd`). Two were green and three went red, each at a scenario after the first, on what the model
answered or how long the endpoint took, not on anything the starter repair touches:

- **Run 2, scenario 3 (`run`)**: "no agent row with text: kinds user,thinking,tool,thinking,tool,thinking,system". The
  session completed (`completed`, `tasks_complete`), with two settled tool rows (`read_file README.md`, `glob **/*`), and
  ended without the model writing an answer. Its reasoning rows addressed requests this run never made (a request to
  list the installed skills; a test suite under `src/core/parser.ts` to fix) rather than the README prompt. Load 2.5.
- **Run 4, scenario 3b (`intents-1`)**: "What is the first heading of README.md?" classified `explicit_trivial (0.99)
  via json_schema`, where the proof expects only `question`. The classifier did not fall back, which is the property the
  scenario's header says it guards (Part L: "the classifier's answer is a category from the small slot, never the
  fallback"). Load 1.5.
- **Run 5, scenario 3b (`intents-3`)**: "the classifier fell back: … intent: moderate_feature (fallback: the
  classification call timed out after 12 s)". Load 0.7 on this host. The endpoint was shared then: the acceptance
  live run in `Rotaris-crw-wt-accept` (started 05:56:26 UTC) ran from before run 4 until after run 5.

Runs 3 and 6 passed all seven scenarios, `intents-1` both times as `question` (run 6 while another live run, in
`Rotaris-crw-wt-live`, shared the endpoint; run 1 also passed all seven, but without the bundle, so setup failed). The
classifier's timeout is a product bound meeting a shared endpoint's latency. Whether 12 s is right for a self-hosted
endpoint under load is a question for its own requirement, and this note does not settle it. Each red is the proof asserting one fixed
answer from a sampled model. For the intents, REQ-ORCH-006's category semantics leave a one-line factual question about
a file arguably in reach of both `question` and `explicit_trivial`, and REQ-ORCH-021 resolves those two to different
groups (answer, micro). So a red there may be the model's call and not a product fault.

Recorded, not repaired. Deciding what the proof should accept from a live model is the proof owner's: a set of
categories, a retry, or a prompt the taxonomy leaves no doubt about. So is deciding whether a run that completes without the
model writing an answer is a product question or model behaviour.

## Specs

- REQ-ORCH-006 / REQ-ORCH-021: the taxonomy and groups the intents scenario reads; the product's answer was a category
  of that taxonomy, not the fallback.
- None contradicted by the product on the evidence here. The proof's fixed expectations are not a requirement.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs`: `INTENTS` (each prompt's accepted categories), scenario 3's agent-row check,
  scenario 3b's category check.
- `packages/engine/src/intent/classifier.ts`: the classification call's 12 s bound and its fallback.
- Evidence, outside the repository: the session scratchpad's `a13-slice-proof-r2/` (run 2: `run.log`, `results.json`),
  `a13-slice-proof-r4/` (run 4: `intents-1.log`) and `a13-slice-proof-r5/` (run 5: `intents-3.log`), beside
  `a13-slice-proof.r<N>.log`.

## Outcome (2026-10-04, fin15, bundle `fin15-slice-proof-live-answers`)

Repaired in the proof; no product code changed. Each of the three reds now meets what a requirement fixes, and nothing
past it:

- **The intents (run 4).** `INTENTS` moved to `apps/desktop/scripts/lib/live-answers.mjs`, beside the reason for each
  prompt's accepted categories, read from REQ-ORCH-006 (its two fixed meanings and its tie-break), REQ-ORCH-021 (the
  groups) and REQ-ORCH-008 (the classifier sees the prompt alone). The README question accepts `question`,
  `exploration` and `explicit_trivial`; the one-line append the micro group; the flag and its test the three feature
  sizes. `intentVerdict` keeps every fallback a red (Part L; REQ-ORCH-007), whatever its category, and a category outside
  the accepted set. Whether `explicit_trivial` is meant for edits alone, and whether the tie-break may reach outside the
  plausible set, are the owner's: **OQ-198 — Does `explicit_trivial` reach a request that changes nothing, and may the
  tie-break choose `moderate_feature` where no build is plausible?**
- **The 12 s bound (run 5).** Still a red: a classification at REQ-ORCH-008's bound takes REQ-ORCH-007's fallback, and the
  red now names **OQ-114 — Do the specification's fixed figures still hold when the model on the critical path reasons
  before it answers?**, which already asks whether that bound should change for such an endpoint; this case (an endpoint
  shared by concurrent runs) was added to it. `results.json` records the host's load at every launch (`loads`).
- **The answerless run (run 2).** Not a product defect on the requirements: REQ-ORCH-069 stops the run at
  `tasks_complete`, REQ-ORCH-115 skips the completion classifier for the coordinator's report, REQ-TOOLS-180 is silent on
  a turn with neither text nor a tool call, and REQ-ORCH-095 (a delegated child's assessment) would count the two reads
  as `work_performed`. Scenario 3 reports such a run as the model's, keeps it as `run.attempt-1.log`, `.png` and `.json`
  (also copied, with an `answerless.json`, into `.proof/slice-proof-answerless/<stamp>-run/`, which the next run's clearing
  does not reach, whichever way the second run goes) and runs once more; a second answerless run is a red naming both. Whether such a run should complete is the owner's:
  **OQ-199 — May a run complete when its entry role ended without writing an answer?**
- **Every red's evidence is kept.** A red copies the output directory into `.proof/slice-proof-reds/<stamp>-<scenario>/`
  beside a `red.json` (scenario, redacted error, commit, load, results so far; `apps/desktop/scripts/lib/proof-reds.mjs`),
  which the next run's clearing of `.proof/slice-proof/` does not reach.

Pinned by `apps/desktop/scripts/lib/live-answers.test.ts` (run 4's and run 5's log lines, run 2's row kinds; with the
README question's old `['question']` two of its cases fail) and `apps/desktop/scripts/lib/proof-reds.test.ts`.

Shown against `katalyst` with the repaired proof (run 1 on `81a2102`, the others on `8769e04`, whose merge of `main` added
only skill and process documents). No other live-run or slice-proof process ran on this host when run 2 started; a run by
another host on the shared endpoint cannot be seen from here:

| Run | Started (UTC) | Load at the launches (1 min) | Outcome |
|---|---|---|---|
| 1 | 12:10:02 | 3.89 at the start | green, all seven scenarios; intents `question` 0.99, `explicit_trivial` 0.99, `small_feature` 0.92 |
| 2 | 13:08:42 | 0.43 to 2.60 | green, all seven; the run answered; intents `question` 1, `explicit_trivial` 1, `small_feature` 0.78 |
| red | 13:15:51 | 2.10 to 2.33 | `--resume --from=sign-out` after run 2 (the provider already signed out): red at `sign-out`, its 16 files and `red.json` kept in `.proof/slice-proof-reds/2026-10-04T13-15-58-333Z-sign-out/`, still there after run 3 cleared `.proof/slice-proof/` |
| 3 | 13:16:09 | 2.07 to 2.86 | green, all seven; the run answered; intents `question` 0.99, `explicit_trivial` 1, `small_feature` 0.88 |
| 4 | 14:10:32 | 4.12 at the start, 2.16 at `intents-3` | repair round 1, build `0de4a7c`: red at `intents` (`intents-3`: "the classifier fell back … timed out after 12 s", naming OQ-114), the run having answered and `intents-1`/`-2` classified `question` 1 and `explicit_trivial` 0.99. Its 13 files and `red.json` kept in `.proof/slice-proof-reds/2026-10-04T14-17-02-811Z-intents/`. No other live run or slice-proof on this host (a `git-proof`, which calls no endpoint, started at 14:16) |
| 5 | 14:17:32 | 0.52 to 1.71 | green, all seven; the run answered; intents `question` 0.99, `explicit_trivial` 1, `moderate_feature` 0.68 (a feature size, accepted; not a fallback) |
| 6 | 2026-10-06 00:46:42 | 2.41 at the start, 0.74 at `intents-3`, 0.20 at the end | repair round 2 (resumed after a restart), build `58b45b7`, the branch's head with origin/main merged: green, all seven; the run answered ("# Slice proof workspace"); intents `question` 0.99, `explicit_trivial` 1, `moderate_feature` 0.86. No other live run or slice-proof on this host; the two kept reds above were still in `.proof/slice-proof-reds/` after it |

Run 4 met the bound live: the fallback stayed a red, named OQ-114, and its evidence outlived run 5's clearing of
`.proof/slice-proof/`. The 12 s figure itself is the owner's (OQ-114, whose 2026-10-04 addendum records run 4). No run met
an answerless completion, so the re-run was exercised by the unit tests alone. The live-run scenario that would show the same classifier and run on the full product is
`pnpm live-run`'s default set (the orchestrator's to launch).
