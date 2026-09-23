## Model calls made outside an agent's turn report no usage

Three model calls the run makes are not part of any agent's turn, and each passes a sink whose `usage` is
`() => undefined`: context compression (`packages/engine/src/run/compression.ts:116`), the child report
summariser (`packages/engine/src/children/report.ts:241`) and the intent classifier
(`packages/engine/src/intent/classifier.ts:225`). The tokens those requests spend, and any cost the provider
reports for them, reach neither the session's totals nor a `usage.update`. A configured per-token price
(PD-MONITOR-001 revision 2) cannot price them either, because it is applied where a request's usage is observed.

Noticed 2026-09-23 while repairing
[`a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`](fixed/a-delegated-childs-provider-requests-never-reach-the-runs-totals.md),
which fixed the same gap for a child's own turn. Established by reading the call sites; not measured on a live
run.

## Specs

- `REQ-EVENTS-053`: one `usage.update` per completed provider request that contributes usage to the run-to-date
  totals. These three are completed provider requests of the run and produce none.
- `PD-MONITOR-001`: a run's cost total is the exact decimal sum of its requests' figures; these requests are
  missing from it.

## Relevant files

- `packages/engine/src/run/compression.ts`: the summarisation call, sink with no usage.
- `packages/engine/src/children/report.ts`: the report summariser call, sink with no usage.
- `packages/engine/src/intent/classifier.ts`: the intent classification call, sink with no usage.
- `packages/engine/src/run/run.ts`: `onRequestUsage`, where a request's usage joins the aggregates.
