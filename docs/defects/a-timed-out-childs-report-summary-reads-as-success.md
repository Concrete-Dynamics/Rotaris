## A timed-out child's report summary reads as success

A child the runner settles `failed` gets a summary that says it completed its task. In the duress live runs of
2026-10-06, 2 of the 5 timed-out children got such a summary: "The agent completed the requested documentation task"
(`c2fdd6a`, finding L5) and "The agent reconciled documentation …" (`c2a9444`, finding N5), each beneath status `failed`.

The summarising pass is never told how the child ended. `produceReport` gives it the task, the most recent part of the
transcript and OQ-111's facts (edited files, commands and exit codes); the run's status and its end reason ("Child timed
out after 1200s", a model failure's headline, `no_activity`, PD-ORCH-004's cut-off statement) are in `ReportInput` and
reach no part of the request. Both autopsies found none of "timed out", "timeout", "failed" or "1200" in the summarising
requests. A transcript cut off partway through the work reads as work under way, and the pass wrote a plausible success.

The sentence then travels: the Library document reads `failed` above it and gives no cause (the artifact copies status,
summary, findings, commands and files, not the errors or `cut_off`), and the timeline ("reported failed: The agent
completed …"), the `child_completed` hook payload and the sibling index given to later children all carry it.

Live-run findings: L5 (`c2fdd6a` duress autopsy), N5 (`c2a9444` duress autopsy).

## Specs

- `REQ-ORCH-108` — the report condenses what already happened; a summary claiming completion over a child the run
  recorded as failed misstates it. `REQ-ORCH-110` fixes the pass's bounds and is silent on what it is given; the ruling
  of [OQ-217](../architecture/open-questions.md) fills that silence, as OQ-111's did.

## Relevant files

- `packages/engine/src/children/report.ts` — `reportFacts` and the ask in `produceReport`, which carry no status or end
  reason.
- `packages/engine/src/children/orchestration.ts` — where the status, the errors and the cut-off are decided before the
  report is produced, and `reportInput` built.
