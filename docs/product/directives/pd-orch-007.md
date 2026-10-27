[Product directives](../directives.md) › PD-ORCH-007

<a id="pd-orch-007"></a>

### PD-ORCH-007 — the report summariser reads the child's whole task

The report-producing pass of REQ-ORCH-110 keeps the child's task as given as the start of the transcript it reads (OQ-111's
ruling). That task SHALL be exempt from REQ-ORCH-110's 2,000 characters for any one event: it is kept whole, within the
12,000 characters in total. A task that alone fills the total keeps its head, cut and marked, and every later event is marked
omitted. Every other event, and the start where no task is given, keeps the 2,000.

**Why, and what it costs.** The task is the one event the summary is judged against, and a delegation's task carries its
closing sections — what must not be done, the expected outcome — last. Under the per-event cut a task longer than 2,000
characters lost them ([OQ-119](../../architecture/open-questions.md)): six of the twelve delegations of the duress run of
2026-09-29 carried longer tasks, up to 3,447 characters. The cost is room: a long task leaves less of the 12,000 for the most
recent part of the transcript, which the report's deterministic facts (OQ-111) partly make up for.

> **Narrows:** REQ-ORCH-110

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), which ruled OQ-119 as recommended.*

> **First execution, 2026-10-06 (fin20).** `reportTranscript` (`packages/engine/src/children/report.ts`) no longer cuts the
> start it builds from the task; the two-part assembly cuts a start that leaves no room for the most recent part. **What was
> measured.** Two cases in `children/report.test.ts`, both red on the code before: a 3,000-character task kept whole with its
> closing section, and a task past 12,000 characters held within the total. **What was not measured.** No built-app proof
> delegates a task that long; the orchestrator's duress live run's summarising requests should each begin with the whole task.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: the duress measure.
> All 8 summarising requests of the duress run carried their child's task whole at the start of the transcript, after the
> marker for the payload ahead of it: tasks of 2,091 to 7,123 characters, every one longer than the 2,000 the per-event cut
> allowed. The default packs agree: 10 of 10 at `552d346` (929 to 8,608 characters) and 9 of 9 at `0bc3eee` (940 to 2,868).
> Read from each summariser request's text in `model-traffic.jsonl` against `children.task`. Held as written. Evidence:
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
