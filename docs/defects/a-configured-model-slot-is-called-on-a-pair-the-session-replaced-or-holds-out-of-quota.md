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
