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
[`a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md`](a-retrospectives-lease-checks-the-entry-roles-provider-not-the-retrospective-models.md),
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

## Outcome

*Repaired 2026-10-15 by fin47 (`fin47-notice-and-retro`).* Confirmed first on the base `3c03287`: three new cases in
`apps/desktop/src/run-host/launch.test.ts` (an entry model on a provider with no endpoint, the retrospective on
`retrospective_model` and on `medium_model`, and neither resolving) received `{ kind: 'unconfigured', reason: "No usable model is
configured for the entry role, …" }`; and `retrospective-proof`'s new launch 11 (`entry-no-model`: `large_model`, the shipped entry
role's tier, naming nothing configured while `medium_model` resolves) went red on four checks in the built app — the gesture raised
"The retrospective could not be started — The workspace configuration could not be loaded", no pass ran and nothing was stored.

`prepareRun` takes a `retrospective` option (`PrepareOptions`, `apps/desktop/src/run-host/configuration.ts`), which `leasedSetup`
passes: an entry role with no usable model does not refuse that setup while `retrospectiveOf` resolves — the setup is completed
with the retrospective's model in the entry model's place, and the run host logs "configuration: the entry role <role> has no usable
model (<why>); a retrospective sends nothing to it, so its setup is completed on its own model '<key>' (PD-LIBRARY-002)". A run
start and a continuation are unchanged: they still refuse on the entry role's model (REQ-WORKSPACE-137). With neither model
resolving, `leasedSetup` answers a new `no-model` kind, which `retrospective.capture` says as `retrospective.no-model` ("No
retrospective analyst is configured", main's "The retrospective needs a model" notice with its Settings action) and
`improvement.analyze` as `improvement.no-model` — PD-LIBRARY-002's "no resolvable retrospective model" — never as an unloadable
configuration or an expired job.

Pinned by `launch.test.ts` (the three cases, green after; the run start's continuation lease still unaffected), by a
`dispatch.test.ts` case on the `no-model` answers, and by `retrospective-proof` launch 11, green after: the pass ran on `scripted`
(the medium model), stored its `retrospective` artifact, raised no refusal notice, and the log carried the stand-in line. The
whole `retrospective-proof` read 71 of 71 (load average about 1).

The other `prepareRun` refusals of a configuration that loaded — chiefly the confinement gate a retrospective never needs — still
read "could not be loaded"; recorded in
[`a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md`](a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md)
(repaired 2026-10-15, fin47 `fin47-accept1-4`).
