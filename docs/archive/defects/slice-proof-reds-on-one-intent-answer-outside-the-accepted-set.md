## slice-proof reds on one intent answer outside the accepted set

Final acceptance finacc3, round 2 (at `d12f1f2`), finding A2-03. In `slice-proof`'s r1 (load 7.9 to 8.9) the intents-3 prompt
"Add a --json flag to the CLI that prints the effective configuration as JSON, with a unit test for it." was classified
`single_file_change (0.82, via json_schema)`; the accepted set is `small_feature`, `moderate_feature` and `large_feature`
(`lib/live-answers.mjs`, `INTENTS`). The lone re-run classified it within the set at 0.95 and passed every scenario. This
is the class [`fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`](slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md)
called repaired: the proof now accepts a set, and the model still landed outside it once. The proof gives an answerless
run a second chance (PD-ORCH-009, OQ-199) but goes red on the first out-of-set intent.

Evidence: `/home/user/Rotaris-crw-wt-accept/.proof/slice-proof-reds/2026-10-07T04-08-56-948Z-intents/red.json` and
`intents-3.log`; the sweep's `slice-proof.r1.log` (red) and `.r2.log` (green).

## Specs

None contradicted on this evidence. REQ-ORCH-006 fixes the taxonomy and the meanings of `problem_resolution`,
`exploration` and the tie-break, and no meaning for `single_file_change`; PD-ORCH-011 narrows it only so far as to make
`explicit_trivial` and `single_file_change` the two smallest edits. So the classifier's instructions are what the
specification says, and a sampled model's one answer outside the set the proof reads from those texts is the model's
call until it repeats. Whether the classifier should be told that `single_file_change` means one file — under
PD-ORCH-006 that category grants the direct-work bundle, so a feature and its test would be worked by the coordinator
alone — is a product question the specification leaves open, raised as OQ-227, not decided here.

## Relevant files

- `apps/desktop/scripts/lib/live-answers.mjs` — `INTENTS` and `intentVerdict`, which make any out-of-set answer final.
- `apps/desktop/scripts/slice-proof.mjs` — scenario 3b, one launch per prompt.
- `packages/engine/src/intent/classifier.ts` — `CLASSIFIER_SYSTEM_PROMPT`, the taxonomy's texts as the model reads them.

## Outcome — repaired 2026-10-07 (fin30), the proof's lever

Of the two levers the finding names, the specification decides for the proof's: the classifier's instructions already
carry every meaning REQ-ORCH-006 and PD-ORCH-011 fix, and giving `single_file_change` a one-file meaning would be a product
change with no requirement text behind it — raised as OQ-227 instead. Scenario 3b now asks a prompt once more on one
answer outside its accepted set, as scenario 3 already does for an answerless run: the first launch's log and picture are
kept as `intents-<n>.attempt-1.*`, the second launch is held to the same set, and a second answer outside it is the red,
naming both (`intentOutcome`, `lib/live-answers.mjs`). A fallback (REQ-ORCH-007) and a missing intent line stay reds at once,
as the fixed note's class requires. The accepted sets themselves are unchanged.

Pinned by `apps/desktop/scripts/lib/live-answers.test.ts`, "scenario 3b asks once more on one answer outside the accepted
set, and only then" (r1's own line, `single_file_change (0.82)`, asks again; a second out-of-set answer is a red naming
both; a fallback and a missing line are reds at once) and the proof-reading case that `slice-proof.mjs` goes through
`intentOutcome`; red before the change (`intentOutcome` absent). Not run against the endpoint by this bundle: a live
`pnpm slice-proof` should show each intents prompt classified within its set, and where one is not, the line "slice-proof:
intents-<n> classified … Asking once more" with `intents-<n>.attempt-1.log` kept beside a green or a red that names both
answers.
