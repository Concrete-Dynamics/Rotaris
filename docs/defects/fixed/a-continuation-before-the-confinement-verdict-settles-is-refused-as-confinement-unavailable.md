## A continuation before the confinement verdict settles is refused as confinement unavailable

A continuation (`session.continue`, `session.prompt`, `session.planDecision`, the restart of REQ-NOTIFY-070) sets its run up through
the run host's `configure` → `configureRun` → `prepareRun` (`apps/desktop/src/run-host/host.ts`, `configuration.ts`), whose
ADR-0022 start-time gate reads the run host's cached verdict synchronously (`confinement: () => confinement.peek()`). Only a run
start (`launchSession` awaits `settleConfinement`) and a `confinement.status` request settle that verdict; no continuation path
does. `ConfigureDeps.confinement`'s comment says "a continuation reads what that launch settled", which holds only when a launch of
this run host's life came first. With `runtime.sandbox_mode` anything but `off`, a continuation that runs before the verdict has
settled — after an application restart, the main window's own `confinement.status` read (`useConfinement`, at mount) still in
flight (the probe is bounded at 5.0 s), or in a run host no window has asked — reads `peek()` as `null`, which the gate treats as
unavailable, and the continuation is refused with "No OS-level confinement can be used on this host." (`renderUnavailability`
of a placeholder verdict with no reason), even on a host where confinement is available — a sentence that is false there and
names no remediation. `leaseForContinuation` meets the same gate and, its preparation refused, leases nothing.

Read from the code on 2026-10-15 by fin47 (`fin47-accept1-4`) while repairing
[`a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md`](a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md),
whose task was the retrospective's path alone; not seen in the built app (the main window's startup read normally settles the
verdict within a second on a Linux host with `bwrap`). Recorded, not repaired.

## Specs

- REQ-SANDBOX-097 — "the availability decision is settled before the run does anything else": a continuation launches a run, and
  its decision is read unsettled rather than settled.
- REQ-SANDBOX-095 / REQ-SANDBOX-071 — a refusal reports the availability reason and remediation; a placeholder verdict carries
  neither, and its fallback sentence says no confinement can be used on a host that has it.
- REQ-SANDBOX-067 / -068 — one cached verdict, `null` read fail-closed; the fail-closed reading is right, settling first is what is
  missing.

## Relevant files

- `apps/desktop/src/run-host/dispatch.ts` — `session.continue`, `session.prompt`, `session.planDecision` and the restart path: none
  awaits `settleConfinement` before the engine's `configure`.
- `apps/desktop/src/run-host/host.ts` — `settleConfinement`; `configure` (the engine's per-run setup) and
  `confinement: () => confinement.peek()`.
- `apps/desktop/src/run-host/configuration.ts` — `prepareRun`'s gate; `ConfigureDeps.confinement`'s comment.
- `apps/desktop/src/run-host/launch.ts` — `launchSession`, the one path that settles first; `leaseForContinuation`.

## Outcome

*Repaired 2026-10-20 by loc1 (`loc1-confinement-retro`, task 1).* Confirmed first on the base `0d89e971`: fourteen new cases went
red there. In `apps/desktop/src/run-host/dispatch.test.ts` ("a continuation settles the confinement verdict before the engine
configures its run"), each of `session.continue`, `session.prompt`, `session.planDecision`, `session.retry`,
`session.restartOnFallback` (REQ-NOTIFY-070) and `session.authRestart` meets a stand-in engine whose continuation runs the real
`configureRun` over `runtime.sandbox_mode: workspace-write`, with a verdict that answers only after a delay (`peek()` null until
then). With the verdict settling available, every path was refused on the base and proceeds now; with it settling unavailable, every
refusal read "No OS-level confinement can be used on this host." on the base and now carries the backend's reason and remediation,
under `session.confinement`. In `apps/desktop/src/run-host/launch.test.ts` ("the continuation lease settles the confinement
verdict before it prepares the run"), `leaseForContinuation` leased nothing on the base with a verdict settling available, and the
run's preparation afterwards still read the placeholder with one settling unavailable.

- `dispatch.ts`: every run-launching continuation goes through `settledContinuationLease`, which awaits `settleConfinement()` (the
  one cached probe, bounded at 5.0 s, its first verdict logged once) before the continuation lease and so before the engine's
  `configure`, as `launchSession` settles it for a run start (REQ-SANDBOX-097).
- `launch.ts`: `leaseForContinuation` settles too (`ContinuationLeaseDeps.settleConfinement`, guarded as in `launchSession`), and
  `host.ts`'s `leaseDepsFor` hands it the run host's `settleConfinement`. `leasedSetup` takes the same deps and does not settle: a
  retrospective meets no gate.
- `configuration.ts`: `ConfigureDeps.confinement`'s comment says which paths settle before it is read; its falsified sentence ("a
  continuation reads what that launch settled") is kept beside the replacement.
- ADR-0022 carries the report-back ("Reported back 2026-10-20"); `docs/architecture/views/03-runtime-view.md`'s continuation lease
  paragraph states the order (settle, lease, configure).

Not reproduced in the built app: the main window's own `confinement.status` read at mount settles the verdict before a person can
continue a session, and no proof drives a continuation inside that window. The proof suites `pnpm verify:plan` names for the diff
were run on the bundle's head as regression evidence (the bundle's report gives the counts and the load).
