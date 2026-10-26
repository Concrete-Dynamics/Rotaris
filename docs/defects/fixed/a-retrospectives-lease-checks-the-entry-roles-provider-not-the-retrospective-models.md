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
model's provider. `PD-LIBRARY-002` revision 5 ([OQ-300](../../architecture/open-questions/61-spikes-and-later-questions-28.md#oq-300)) gives the refusal "a
retrospective whose lease leaves its entry provider unresolved" its wording; which provider is the retrospective's "entry
provider" is the question this note records.

## Relevant files

- `apps/desktop/src/run-host/launch.ts` — `leaseOver`, the refusal on `prepared.entryAuthProvider`; `leasedSetup`, the
  retrospective's lease.
- `apps/desktop/src/run-host/configuration.ts` — `prepareRun` (line 629, `entryAuthProvider` from the entry role's model) and
  `retrospectiveOf` (line 447, the retrospective's own slot then `medium_model`).
- `apps/desktop/src/run-host/dispatch.ts` — `retrospective.capture` and `improvement.analyze`, which lease first and resolve the
  collector from the leased setup afterwards.

## Outcome — repaired 2026-10-14 (fin46, `fin46-accept1-11`)

**The reading built.** "A retrospective authenticates exactly as a run does": a run's lease refuses on the provider its own first
request needs, its entry model's; a retrospective's only request goes to its own model (`retrospectiveOf`: `retrospective_model`,
then `medium_model`, REQ-LIBRARY-040's ladder), so revision 5's "its entry provider" is that model's sign-in provider. No
requirement or directive text changes.

**What changed.** `prepareRun` (`apps/desktop/src/run-host/configuration.ts`) also answers `retrospectiveAuthProvider`, the
`auth_provider` of the model `retrospectiveOf` resolves — null where none resolves, the model names no sign-in provider, or the
model is the scripted client's. `leaseOver` (`apps/desktop/src/run-host/launch.ts`) takes the provider it requires from its caller:
`leaseForContinuation` passes the entry role's (`entryAuthProvider`, unchanged), and `leasedSetup` — the retrospective's lease at
`retrospective.capture` and again at `improvement.analyze` — passes the retrospective model's. The lease still asks main for every
provider the configuration names, and the refusal keeps revision 5's code, headline and sentence. So a retrospective whose own
provider is signed in runs although the entry role's is signed out, and one whose own provider is signed out is refused at the
gesture ("Provider authentication required", with "Open Models settings") instead of failing at its model call with
`PD-LIBRARY-005`'s warning.

**Pinned** by `apps/desktop/src/run-host/launch.test.ts`, "leasedSetup refuses on the retrospective model's provider, not the entry
role's" — five cases, each red against the old lease: own provider signed in and the entry role's signed out, configured on the
bearer it leased (through `retrospective_model`, and through `medium_model`); own provider signed out and the entry role's signed
in, refused with the retrospective's sentence (both ways); a retrospective model naming no sign-in provider needing none — and a
continuation still refusing on the entry role's provider. OQ-300's case keeps its sentence, its fixture now putting its one model
on the medium tier so the retrospective resolves to it.

**Not shown in the built app.** Every proof configures the scripted provider, whose lease names no provider, and a two-provider
sign-in cannot be set up without a provider's own sign-in; `pnpm retrospective-proof` was re-run as the regression of the
retrospective's path. The live run's `ask-retrospective-unauth` withholds the one provider every slot names, so it reads the same
before and after.
