## The summarising pass can raise a failed child's report status

`shape` (`packages/engine/src/children/report.ts`) takes the report's status from the summarising pass's JSON when it
carries a `status` key, and falls back to the runner's only when it does not:
`normaliseReportStatus(str(o['status']) || input.status)`. A pass answering `"status": "succeeded"` for a child the runner
settled `failed` (a timeout, a model failure, no activity) stores a report with status `succeeded`. The child's ledger
state stays `failed` (orchestration reads its own status for the transition), so the two disagree: the timeline reads
"reported succeeded", and the `child_completed` hook payload and the artifact carry `succeeded` beside a failed state.

The ask never requests a `status` key, so a pass rarely returns one; it was not observed in the duress runs of
2026-10-06. Found by reading, by the R-072 consortium's advocate B on [OQ-217](../../architecture/open-questions.md).

## Specs

- `REQ-ORCH-088` — on a child's timeout the run records the child failed.
- `REQ-ORCH-112` — the report status maps to the child's terminal state; a raised status breaks that mapping for a child
  the run settled failed. A pass may still lower a succeeded child's status (`partial`), as REQ-ORCH-112 allows.

## Relevant files

- `packages/engine/src/children/report.ts` — `shape`, the status line.
- `packages/engine/src/children/orchestration.ts` — the terminal transition and the hook payload, which read
  `report.status`.

## Repaired — 2026-10-07, under OQ-217's ruling (R-072)

`shape` keeps `input.status` for a child the runner settled other than `succeeded`, whatever `status` key the pass returns;
a succeeded child's status is still normalised from the pass, so a pass may lower it to `partial` as REQ-ORCH-112 allows.
Pinned by "a pass answering status succeeded or partial for a failed child stores failed; partial for a succeeded child
still stores partial" in `packages/engine/src/children/report.test.ts`, red on the code before for both answers.
