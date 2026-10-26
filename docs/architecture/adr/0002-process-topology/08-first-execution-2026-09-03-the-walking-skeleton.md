# ADR-0002 — Process topology — First execution — 2026-09-03, the walking skeleton

Part 8 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10: a mechanism's first execution reports back into the record that decided it,
including when it found nothing.*

**Built and run:** `apps/desktop/src/{main,run-host,workspace-service}` — main forks one run host at
`app.ready` and one workspace service per opened directory, keyed by canonical path, over
`utilityProcess` with the process protocol in `@rotaris/contracts`. `hello` round-trips answered; a
workspace directory carried by a second launch was resolved by the service (identifier minted once,
store opened and migrated to schema v1) and the **resolved path** handed to the run host, which opened
it and acknowledged. The run host is not re-forked on exit; the log says so and nothing else happens.

**Found: nothing in this record.** Two things beside it, both in the build and stated in ADR-0056's
note. **Not exercised:** a run-host crash with runs in flight (nothing runs yet); the quit choreography
beyond one bounded `shutdown` request; two windows on one workspace sharing a service.
