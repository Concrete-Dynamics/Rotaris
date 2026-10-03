## slice-proof goes red on live-model answers that vary from run to run

Once the starter-configuration defect was repaired ([a-first-run-workspace-never-gets-the-starter-agents-yaml.md](fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md)),
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
