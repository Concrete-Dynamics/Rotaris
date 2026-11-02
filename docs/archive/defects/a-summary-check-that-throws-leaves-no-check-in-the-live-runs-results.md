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

## Outcome

Repaired 2026-10-06 by fin25 (bundle `fin25-harness-and-record`). The summary step is `preserveSummary` in
`apps/desktop/scripts/lib/summary-sections.mjs`, its effects passed in by `preserveRun` (read, keep — the credential
refusal and the write — and judge, `checkSummary` now recording through the check it is given). Whatever stops the step,
the scenario's summary check is recorded once: a failed check where no file was written (as before), where the file could
not be kept ("it could not be kept: …"), or where the judge threw before its own check ("it could not be judged: …"); a
judge that threw after recording its check adds none. The pack's `failed` entry is kept as before.

Pinned by `apps/desktop/scripts/lib/summary-sections.test.ts` ("preserveSummary"): a judged file keeps its one check; no
file, a refused or failed keep, a judge that throws, and a read that throws each record one failed check; a judge that
threw after its check records no second. The step had no unit before, so the cases were red for want of it rather than
against the old branch; the old branch's behaviour is the defect above. The live run itself is the orchestrator's: its
next run should show one summary check per kept session in `results.json`, as before when nothing throws.
