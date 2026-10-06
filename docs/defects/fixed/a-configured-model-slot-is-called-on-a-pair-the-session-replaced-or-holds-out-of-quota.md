## A configured model slot is called on a pair the session replaced or holds out of quota

The run's auxiliary calls take their models from configured slots and are not carried through the session's resilience
memory the way an agent's ladder cell is: the intent classifier and the pre-flight (`classifierSlotsOf`, REQ-ORCH-114's
small → default-summary → summariser order), the loop classifier of the circuit breaker (its `circuit_breaker.model`, else
those slots), the compressor when `compressor.model` names one (`compressorOf`; its default is the `small_model` alias, so in
the built app it is nearly always configured), and the post-run analyst (`improvementCollectorOf`). None reads a session-wide
override (REQ-ORCH-091 d) and none reads the out-of-quota exclusion (REQ-MONITOR-194). The summariser follows overrides since
2026-10-02 (`SummariserDeps.resolve`, ADR-0027's seventh execution) but not the exclusion either. So after the session records
`alpha` out of quota — with or without an override replacing it — those calls still go to `alpha`.

Seen 2026-10-03 (fin10, quota-exclusions-and-choices) in the built app: `compression-proof`'s `after-a-move` scenario (the
root moved from alpha, refused on quota, to beta) sent its compression pass to `scripted/alpha`, the configured compressor
(and, on the build before that bundle's compression repair, its loop classifier to `scripted/alpha` as well);
`resilience-proof`'s `next-run-choice` relaunch, with alpha held out of quota and the root moved to beta before calling,
logged the intent classifier and the post-run analyst (named `child` by the scripted client) on `scripted/alpha`; and the
`two-waits` relaunch records both on alpha after an override to gamma (the fin10 first-executions row for the waiting pairs).
Recorded as the sixth triage asked (the intent classifier and the analyst), with the compressor and the loop classifier found
beside them. Not repaired: size **M** — five call sites in three packages (`apps/desktop/src/run-host/configuration.ts` and
`host.ts`, `packages/engine/src/run/run.ts`, the analyst's and classifiers' own modules) — and what such a call does when its
configured pair is excluded and nothing replaces it is not settled by the specification: raised as "What does a configured
model slot call when the session holds its pair out of quota or has replaced it?" in `docs/architecture/open-questions.md`.

## Specs

- REQ-MONITOR-194 — an excluded pair "is neither retried automatically nor offered as an automatic fallback candidate";
  spec resolution 21 reads that as governing automatic behaviour. These are automatic calls of the pair.
- REQ-ORCH-091 (d) — a manual model change "persists the override in session state for the rest of the session".
- REQ-MONITOR-080 — a configured compression model is used; where none is configured, the agent's own. It does not say
  what happens when the configured one is excluded.
- REQ-ORCH-114 — the classifier's slot order, which names no exclusion or override.

## Relevant files

- `apps/desktop/src/run-host/configuration.ts` — `classifierSlotsOf`, `compressorOf`, `summariserOf`,
  `improvementCollectorOf`: each resolves a configured slot to a model reference once per run.
- `apps/desktop/src/run-host/host.ts` — the loop classifier's and the pre-flight's slots, the analyst's collector.
- `packages/engine/src/run/run.ts` — `compressionFor` (a configured `compressor.model` wins over the cell) and
  `summariserDeps` (overrides followed, the exclusion not read).
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory`, which none of these calls consults for the exclusion.

## Outcome — 2026-10-06 (plan fin21, under [R-071](../../product/requests.md#r-071)): ruled and repaired

OQ-189 was ruled by the owner as recommended ([`PD-MONITOR-008`](../../product/directives.md#pd-monitor-008)): every helper
call follows the session's model override, and where its pair is held out of quota with nothing replacing it, a compression
runs on the calling agent's model and the classifiers and the analyst make no call; the summariser, read beside compression,
summarises the child on the model the child ran on.

- **One reader.** `helperChoiceOf` (`packages/engine/src/run/resilience.ts`) resolves a configured choice through the
  session's memory — the overrides followed, not `ok` with the reason where the pair reached is excluded — and `Run.helperModel`
  reads it at each call.
- **In the run.** `Run.compressionFor`'s `compressing`: a configured `compressor.model` followed through the overrides, else
  the agent's own model; `withheld` reads whichever the pass would call. `Run.summariserDeps`' `resolve` takes the child's
  model (`ReportInput.agentModel`, `children/orchestration.ts`) and answers `withheld` where both are excluded, and
  `produceReport` then writes the fallback report with the reason.
- **In the run host.** `Sessions` hands the reader through `PreflightContext.helperModel` (`classifyIntent`: no request, the
  fallback intent with the reason), the `supervisor` factory's fourth argument (`createLoopClassifier`: read at each
  classification, no request on an excluded pair) and `onRunResult`'s third (`postRunAnalystOf`: the analysis skipped with a
  log line; a captured job keeps the model resolved at capture, its artifact naming the override's key).

Pinned by `packages/engine/src/run/ladder.test.ts` (four cases: the configured compressor after a move and after an
override, the summariser on the child's model, the reader itself — each red on `37f7a98`),
`packages/engine/src/intent/intent.test.ts`, `apps/desktop/src/run-host/loop.test.ts` and
`apps/desktop/src/run-host/configuration.test.ts` (red before: no reader). Shown by `compression-proof`'s `after-a-move` (the
pass on beta) and `resilience-proof`'s `same-tier` (the analyst skipped; the relaunch calling nothing on alpha) and
`two-waits` (the relaunch's classifier and analyst on gamma) on the built app (2026-10-06).
