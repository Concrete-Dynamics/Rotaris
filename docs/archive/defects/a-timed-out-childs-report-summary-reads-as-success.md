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
  of [OQ-217](../../architecture/open-questions.md) fills that silence, as OQ-111's did.

## Relevant files

- `packages/engine/src/children/report.ts` — `reportFacts` and the ask in `produceReport`, which carry no status or end
  reason.
- `packages/engine/src/children/orchestration.ts` — where the status, the errors and the cut-off are decided before the
  report is produced, and `reportInput` built.

## Repaired — 2026-10-07, under OQ-217's ruling (R-072)

For a child the runner settles other than `succeeded`, `reportFacts` (`packages/engine/src/children/report.ts`) opens the facts
with an Outcome line (`outcomeLine`): the status, the end reasons as the run recorded them, joined by "; " (`no_activity` in
its issue's words, "ended with no activity after one re-prompt"), and for a child cut off while making progress PD-ORCH-004's
statement, which `orchestration.ts` now hands on as `ReportInput.cutOffStatement` — "Outcome: failed — Child timed out after
1200s. Cut off while making progress: …". It stands at the head of the block, so OQ-120's head-keeping cut keeps it. The ask
then says the line is the run's record of how the agent ended, that the summary's first sentence states it and its reason,
then condenses what the agent did and what the transcript shows remained, and that it never describes the task as completed
or finished nor claims more was left undone than the transcript shows. A succeeded child's request is byte for byte as it
was, and the no-model fallback is unchanged (REQ-ORCH-110).

Pinned by the OQ-217 cases in `packages/engine/src/children/report.test.ts` (the Outcome line and the instruction, the
reasons' words, the head kept past the 12,000-character bound, each red on the code before) and by the two PD-ORCH-004
cut-off cases in `children.test.ts`, whose summarising requests now carry the line with and without the statement (the
first red without the orchestration change). Whether the model follows the instruction is the next duress live run's to
show.
