## A retrospective is refused as an unloadable configuration when confinement is requested

A retrospective prepares its configuration with `prepareRun` (`leasedSetup`, `apps/desktop/src/run-host/launch.ts`), the run
start's own preparation, and that preparation runs ADR-0022's start-time confinement gate before anything else: with
`runtime.sandbox_mode` anything but `off`, it refuses (`code: 'confinement'`) unless the run host's confinement verdict reads
available. The retrospective path never settles that verdict — a run start does (`settleConfinement` in `launchSession`), and so does a
`confinement.status` request (Settings) — so before either has happened in the run host's life `confinement.peek()` is `null` and
the gate refuses even where confinement is available; where it is unavailable it refuses too. `leasedSetup` turns every refusal but `no-model` into `{ kind: 'unconfigured' }`,
and `retrospective.capture` answers that with `retrospective.no-configuration`, "The workspace configuration could not be loaded",
the real reason logged at `warn` only; `improvement.analyze` ends a queued retrospective "The captured improvement job is no longer
available" (`improvement.expired`). A retrospective executes no tool and starts no shell: nothing it does needs confinement, and
the configuration loaded.

The same mapping also says "could not be loaded" for the other refusals `prepareRun` makes of a configuration that loaded — a
`default_persona` naming no role this build knows, and referential errors with no one present (REQ-CONFIG-246); whether those should
refuse a retrospective at all is the same question.

Read from the code on 2026-10-15 by fin47 (`fin47-notice-and-retro`) while repairing
[`fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-the-entry-role-has-no-usable-model.md`](fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-the-entry-role-has-no-usable-model.md),
whose task named the entry role's model alone; not seen in the built app. Recorded, not repaired.

## Specs

- `PD-LIBRARY-002` (with ADR-0065 decision 5) — the retrospective is an analysis pass over the workspace's history, run on its own
  model; ADR-0022's gate (REQ-SANDBOX-094/095/097) is a run start's, protecting the shell a run would open.
- `REQ-NOTIFY-254` — a refusal carries the reason worded by the layer that determined it; "The workspace configuration could not be
  loaded" names a load that succeeded.

## Relevant files

- `apps/desktop/src/run-host/configuration.ts` — `prepareRun`'s confinement gate (`effectiveSandboxMode`, `deps.confinement`).
- `apps/desktop/src/run-host/launch.ts` — `leasedSetup`, which maps the refusal to `unconfigured`; `launchSession`, the only caller of
  `settleConfinement`.
- `apps/desktop/src/run-host/host.ts` — `settleConfinement`, `confinement: () => confinement.peek()`.
- `apps/desktop/src/run-host/dispatch.ts` — `retrospective.capture`'s `retrospective.no-configuration`, `improvement.analyze`'s
  `improvement.expired`.
