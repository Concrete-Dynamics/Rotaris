## A retrospective is refused as an unloadable configuration when the entry role has no usable model

A retrospective prepares its configuration with `prepareRun` (`leasedSetup`, `apps/desktop/src/run-host/launch.ts`), the run
start's own preparation, which refuses with code `no-model` when the **entry role's** model does not resolve — `default_persona`
names no model, a model that is not configured, or one with no `base_url` whose provider the build knows no endpoint for
("No usable model is configured for the entry role, so the run was refused before it started: …"). `leasedSetup` turns every
`prepareRun` refusal into `{ kind: 'unconfigured' }`, and `dispatch`'s `retrospective.capture` answers that with
`retrospective.no-configuration`, headline "The workspace configuration could not be loaded", logging the real reason at `warn`
only. So a workspace whose configuration loads, whose `retrospective_model` (or `medium_model`) resolves to a usable, signed-in
model, but whose entry role has no usable model, is told its configuration could not be loaded, and no retrospective runs,
although nothing the retrospective sends goes to the entry role's model. At `improvement.analyze` the same shape makes the queued
job end "The captured improvement job is no longer available" (`improvement.expired`).

Read from the code on 2026-10-14 by fin46 (`fin46-accept1-11`) while repairing
[`fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`](fixed/a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md),
which made the retrospective's lease refuse on its own model's provider; not seen in the built app. Recorded and not repaired.

## Specs

`PD-LIBRARY-002` (with ADR-0030 and REQ-PROVIDER-066: "a retrospective authenticates exactly as a run does" — on its own model,
`retrospective_model` then `medium_model`, REQ-LIBRARY-040's ladder; and "A workspace with no resolvable retrospective model
captures no pass", with its own notice) — the pass's refusal is decided by the entry role's model, which the pass never calls, and
its wording names a configuration that loaded. REQ-WORKSPACE-137 and REQ-EVENTS-021 word the run start's refusals, not the
retrospective's.

## Relevant files

- `apps/desktop/src/run-host/launch.ts` — `leasedSetup`, which maps every `prepareRun` refusal to `unconfigured`.
- `apps/desktop/src/run-host/configuration.ts` — `prepareRun`'s `no-model` refusal on the entry role's model; `retrospectiveOf`.
- `apps/desktop/src/run-host/dispatch.ts` — `retrospective.capture`'s `retrospective.no-configuration` answer and
  `improvement.analyze`'s `improvement.expired`.
