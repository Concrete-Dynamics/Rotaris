## The intent classifier's rungs give `single_file_change` different meanings

`CLASSIFIER_SYSTEM_PROMPT` (`packages/engine/src/intent/classifier.ts`), which every rung sends, says only that
`explicit_trivial` and `single_file_change` are "the two smallest edits". Only the json_object rung's instruction carries an
example, `{"intent":"single_file_change",…,"reason":"one file, one edit"}`, which teaches a one-file meaning; the
json_schema and text rungs carry none. So what the category means to the model depends on which structured output the
provider accepts, which the user can neither see nor control. finacc3 A2-03's miss — "Add a --json flag … with a unit test
for it." classified `single_file_change` (0.82) — came through the json_schema rung. REQ-ORCH-014 shows that identifier on
screen, and under PD-ORCH-006 it grants the coordinator the direct-work bundle, so a feature and its test can be worked
without delegation, and the same prompt runs directly in one launch and delegated in the next. `slice-proof` already judged
the product by a one-file meaning nothing in the record stated (`apps/desktop/scripts/lib/live-answers.mjs`).

Recorded 2026-10-13 from the R-072 consortium's ruling on OQ-227, whose two advocates both found it.

## Specs

- REQ-ORCH-006's taxonomy, which fixes no meaning for `single_file_change`; PD-ORCH-011 revision 1, "the two smallest
  edits"; OQ-227.
- `PD-ORCH-011` revision 2 (OQ-227): the meaning, stated on every rung.

## Relevant files

- `packages/engine/src/intent/classifier.ts` — `CLASSIFIER_SYSTEM_PROMPT` and the rung instructions.
- `apps/desktop/scripts/lib/live-answers.mjs` — `INTENTS[2].why` and `intentOutcome`'s comment.

## Outcome

Repaired 2026-10-13 (plan fin34) under `PD-ORCH-011` revision 2, the ruling of
[OQ-227](../../architecture/open-questions.md) under [R-072](../../product/requests.md#r-072): `CLASSIFIER_SYSTEM_PROMPT`,
which every rung sends, carries "single_file_change means a small edit confined to one file, as the request states or
implies; a change requested together with a test of it, or one naming several files to change, is outside it unless the
request places all of it in one file." The json_object rung's example agrees and is kept. `live-answers.mjs` cites the
revision for the micro group's exclusion; its accepted sets and single retry are unchanged. Pinned by
`packages/engine/src/intent/intent.test.ts`'s OQ-227 case, which asserts the sentence on the json_schema, json_object and
text rungs and was red before. Not measured: a live `pnpm slice-proof`, the orchestrator's to run.
