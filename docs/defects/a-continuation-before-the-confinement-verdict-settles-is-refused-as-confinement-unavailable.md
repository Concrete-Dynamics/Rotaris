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
[`fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md`](fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md),
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
