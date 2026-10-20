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
[`a-retrospective-is-refused-as-an-unloadable-configuration-when-the-entry-role-has-no-usable-model.md`](a-retrospective-is-refused-as-an-unloadable-configuration-when-the-entry-role-has-no-usable-model.md),
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

## Outcome

*Repaired 2026-10-15 by fin47 (`fin47-accept1-4`, acceptance finding A3).* Confirmed first on the base `7c9182c`: four new cases in
`apps/desktop/src/run-host/launch.test.ts` received `{ kind: 'unconfigured' }` — `sandbox_mode: workspace-write` with the verdict
not yet settled and with it settled unavailable, a `default_persona` naming no role this build knows, and the same with no one
present (REQ-CONFIG-246) — and `retrospective-proof`'s new launch 12 (`confinement-requested`: `sandbox_mode: workspace-write`, the
launch's PATH holding every launcher but `bwrap`, so the run host logged "confinement: unavailable — … `bwrap` was not found on
PATH") went red on three checks in the built app: the gesture raised "The retrospective could not be started — The workspace
configuration could not be loaded", no pass ran and nothing was stored. **Seen in the built app**, then, where the note had it from
the code alone: on a host whose confinement is unavailable — every Windows host, a Linux host without `bwrap` — a retrospective was
refused whenever confinement was requested, not only before the verdict settled.

- `prepareRun` (`apps/desktop/src/run-host/configuration.ts`) does not apply ADR-0022's start-time gate to a retrospective's setup
  (`PrepareOptions.retrospective`, which `leasedSetup` passes): neither the unrecognised-mode refusal nor the availability check,
  and the configured mode is kept as the file states it. A run start and a continuation keep the gate unchanged.
- `ConfigureRefusal` gains the code `unloaded` for the two refusals of a configuration that did not load or did not apply over the
  current settings. `leasedSetup` answers `unconfigured` for those alone; every other refusal of a configuration that loaded comes
  back as `refused` with code `retrospective.configuration`, headline "The workspace configuration refused the retrospective" and
  `prepareRun`'s own reason as the detail (REQ-NOTIFY-254), which main posts as "The retrospective could not be started" with that
  detail, and the analysis carries inside PD-LIBRARY-002 (c)'s failure warning.
- `retrospective.capture` now carries the loader's reason as the detail of `retrospective.no-configuration`, and `improvement.analyze`
  answers an unloadable configuration as `improvement.no-configuration` with that reason, where it ended the job as
  `improvement.expired` ("The captured improvement job is no longer available").

Pinned by `launch.test.ts` (seven cases: the three verdicts — unsettled, unavailable, available — configured over the leased bearer
with the mode kept; the run start still refused as `confinement` on the same configuration; the persona and REQ-CONFIG-246 refusals
said with their own reasons; an unloadable configuration still `unconfigured`), by a `dispatch.test.ts` case on the capture's
detail and the analysis's answer (red on the code before), and by `retrospective-proof` launch 12, green after: the verdict line
read unavailable, the pass ran and stored its `retrospective` artifact, no refusal notice was raised, and a prompt submitted in
the same launch was still refused "The run was refused before it started" with bubblewrap's reason (REQ-SANDBOX-095). The
whole `retrospective-proof` read 78 of 78 after the repair (2026-10-15, 13:25 to 13:35 UTC, load average 3.5 to 9 with other
lanes running).

**Left open, not ruled here:** whether a `default_persona` naming no role this build knows, or referential errors with no one
present, should refuse a retrospective at all — the retrospective sends nothing to the entry role — raised as
[OQ-363](../../architecture/open-questions.md#oq-363). Until a ruling they refuse it, worded truthfully.
*Ruled 2026-10-20 under [R-072](../../product/requests.md#r-072) and built the same day by loc1 (`loc1-confinement-retro`): neither refuses the pass ([OQ-363](../../architecture/open-questions.md#oq-363), (b) refined; `PD-LIBRARY-002` revision 6). An unknown `default_persona` leaves the setup completed on the retrospective's own model, referential errors are its warnings whatever the presenter, written to the log at the capture, and `retrospective.configuration` is reached by no current refusal; `launch.test.ts` and `retrospective-proof` launch 13 (`unknown-persona`) pin it.*
