## A summary check that throws leaves no check in the live run's results

`preserveRun` in `apps/desktop/scripts/live-run.mjs` copies each kept session's `summary.md` into the pack and checks it
against REQ-SESSION-140 (`checkSummary`). Where no file exists it records a failed check. Where one exists but
`assertNoCredential` refuses its text, the write fails, or `checkSummary` throws (its store read, or `summaryReading`), the
`catch` only pushes the error to the scenario's `failed` list: no check is recorded, so that scenario's summary check
disappears from `results.json` and the console's tally, and a run whose summaries could not be judged reads green.

Found by fin23's verifier (plan fin23, landed at `d653d89`).

## Specs

None contradicted by the product: this is the harness. It bears on the verification of REQ-SESSION-140 (the summary's
sections) and REQ-SESSION-136 (its Tool errors line).

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `preserveRun`'s summary block, `checkSummary`.
- `apps/desktop/scripts/lib/summary-sections.mjs` — `summaryReading`.
