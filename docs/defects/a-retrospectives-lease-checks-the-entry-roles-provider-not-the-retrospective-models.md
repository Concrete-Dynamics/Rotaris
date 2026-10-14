## A retrospective's lease checks the entry role's provider, not the retrospective model's

A retrospective takes its lease through `leasedSetup` → `leaseOver` (`apps/desktop/src/run-host/launch.ts`), which refuses when
the configuration's `entryAuthProvider` is not among the bearers main answered. That provider is the **entry role's**
(`prepareRun`, `apps/desktop/src/run-host/configuration.ts:629`: `entry?.auth_provider` of the model `default_persona` names),
the provider a run's first request goes to. The retrospective does not analyse on that model: `dispatch`'s `retrospective.capture`
and `improvement.analyze` resolve its collector with `retrospectiveOf` (`configuration.ts:447`), the `retrospective_model` slot
and then `medium_model`, which may name a model of another provider. So:

- a retrospective whose own provider is signed in is refused "Provider authentication required" when the entry role's provider
  is signed out, although nothing it would send needs that credential;
- a retrospective whose own provider is signed out passes the lease when the entry role's provider is signed in, is captured
  and queued, and fails later at its model call, posting `PD-LIBRARY-005`'s "The retrospective could not be completed" warning
  for a crashed collector instead of the refusal at the gesture.

Read from the code on 2026-10-14 by fin45 (`fin45-retro-and-record`) while building OQ-300's ruling, which words that refusal
and does not repair which provider it checks; not seen in the built app. Recorded and not repaired.

## Specs

`PD-LIBRARY-002` (with ADR-0030 and REQ-PROVIDER-066): "a retrospective authenticates exactly as a run does" — a run's lease
refuses on the provider its own first request needs; the retrospective's first and only request goes to the retrospective
model's provider. `PD-LIBRARY-002` revision 5 ([OQ-300](../architecture/open-questions.md#oq-300)) gives the refusal "a
retrospective whose lease leaves its entry provider unresolved" its wording; which provider is the retrospective's "entry
provider" is the question this note records.

## Relevant files

- `apps/desktop/src/run-host/launch.ts` — `leaseOver`, the refusal on `prepared.entryAuthProvider`; `leasedSetup`, the
  retrospective's lease.
- `apps/desktop/src/run-host/configuration.ts` — `prepareRun` (line 629, `entryAuthProvider` from the entry role's model) and
  `retrospectiveOf` (line 447, the retrospective's own slot then `medium_model`).
- `apps/desktop/src/run-host/dispatch.ts` — `retrospective.capture` and `improvement.analyze`, which lease first and resolve the
  collector from the leased setup afterwards.
