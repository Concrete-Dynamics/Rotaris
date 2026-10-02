## Model calls made outside an agent's turn report no usage

Three model calls the run makes are not part of any agent's turn, and each passes a sink whose `usage` is
`() => undefined`: context compression (`packages/engine/src/run/compression.ts:116`), the child report
summariser (`packages/engine/src/children/report.ts:241`) and the intent classifier
(`packages/engine/src/intent/classifier.ts:225`). The tokens those requests spend, and any cost the provider
reports for them, reach neither the session's totals nor a `usage.update`. A configured per-token price
(PD-MONITOR-001 revision 2) cannot price them either, because it is applied where a request's usage is observed.

Noticed 2026-09-23 while repairing
[`a-delegated-childs-provider-requests-never-reach-the-runs-totals.md`](a-delegated-childs-provider-requests-never-reach-the-runs-totals.md),
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

## Repaired 2026-09-27 ([R-054](../../product/requests.md#r-054))

There were four such calls, one more than the note named: the loop supervisor's classifier
(`apps/desktop/src/run-host/loop.ts`) passed the same empty sink. All four are now counted through one mechanism.
`meteredBackend` (`packages/engine/src/run/metered.ts`) decorates the `AgentBackend` port: after each `runTurn` it
hands the report's usage and the request's model to a counter, for a failed request too, and counts nothing for a
call that throws. The counter is the new `Run.countUsage`, which prices the request at that model's catalogue rates
(`priceRequest`, as the ladder does) and passes it to `onRequestUsage`, so these requests reach `Aggregates`, the
cost qualifier and `usage.update` exactly as an agent's do. None of the four callers changed.

Where each is wrapped: `Sessions` wraps the compressor's and the summariser's backends at both run-construction
sites; the run host wraps the intent classifier's backend from `PreflightContext.countUsage`, and the loop
classifier's from the third argument the `supervisor` factory now receives.

The improvement analyst (`packages/engine/src/improvements/analyst.ts`) also passes an empty sink, and stays as it
is: it runs after the run has ended, when `session.end` has already carried the final totals, so it has no run
totals to join. No requirement asks for its usage.

Evidence: `run/metered.test.ts` covers the decorator (a completed request counted once with its model, a failed
one counted, a thrown call not counted). `children.test.ts` — *the child-report summariser's request counts against
the run like any agent's* — reads `tokens_input` 162, `cost` `0.0139` and four `usage.update` events. The earlier
child case had the summariser answer with the scripted default of 10 and 5 tokens and expected them missing, so it
had pinned this defect; its summariser now reports nothing, which keeps that case about the child.
`run/preflight.test.ts` — *the pre-flight is handed the run's counter* — reads `tokens_input` 50 and `cost` `0.0014`.
With the `sessions.ts` wiring reverted, both of those end-to-end tests fail.
