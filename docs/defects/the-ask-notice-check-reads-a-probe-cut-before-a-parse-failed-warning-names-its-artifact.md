## The ask notice check reads a probe cut before a parse-failed warning names its artifact

`live-run.mjs`'s `ask` scenario checks that the notice on screen is the one the post-run analysis outcome owes
(`passOutcome` in `apps/desktop/scripts/lib/analysis-reading.mjs`). For a `parse-failed` outcome it requires PD-LIBRARY-005's
warning "The completed run could not be reviewed for improvements" whose detail names the artifact ("<artifact id> holds no
proposals"). It reads the notice from the capture's `[data-testid="notice"]` probe, which keeps only the first 400 characters
of each match's text (`apps/desktop/src/main/capture/probe.ts`, `.slice(0, 400)`). The product's detail puts the recorded
reason before the artifact id (`apps/desktop/src/main/improvement-notice.ts`: `${passFailureDetail(…)} ${artifact_id} holds no
proposals.`), and a parse failure's reason is the parser's whole error, several hundred characters of JSON. The id is then past
the cut, and the check FAILS over a notice the product posted correctly.

Seen 2026-10-14 by fin46 (`fin46-accept1-4`) in its own `--only=ask` live run on this branch (pack
`2026-10-14T18-49-03-495Z`, `ask/app.log`'s probe line): the analyst's answer could not be read twice (`collector parse failed:`
an `unrecognized_keys` error on `proposals[0].proposed_verifier_section`), the probe's text stops inside that error, and the
check read "FAIL the notice on screen is the one the analysis outcome owes". The retrospective's `crashed` and `parse-failed`
readings share the same shape. Noticed while verifying finding L6; recorded, not repaired (outside this bundle's tasks).

## Specs

None contradicted by the product: PD-LIBRARY-005 (OQ-285) asks for the warning, the reason and the artifact's id, and all three
are posted. The harness's reading cuts the text it then searches. Whether the detail should bound a long parser error is a
separate question nobody has raised.

## Relevant files

- `apps/desktop/scripts/lib/analysis-reading.mjs` — `passOutcome`, the `named` pattern for `crashed` and `parse-failed`.
- `apps/desktop/src/main/capture/probe.ts` — `ROTARIS_CAPTURE_PROBE`'s reading, each match's text cut at 400 characters.
- `apps/desktop/src/main/improvement-notice.ts` — the failure warning's detail, the reason first and the artifact id last.
- `apps/desktop/scripts/live-run.mjs` — the `ask` scenario's notice check.
