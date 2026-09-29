## A skip can move a completed task into skipped

`InitializationCoordinator.skip` records every id it is given except one the live run is attempting. `recordSkip` →
`recordPatch` (`packages/config/src/init/state.ts`) then **moves** each id: it takes the id out of `completed` and puts
it in `skipped`. The ids come from the dialog's list, which is the pending list of the last state the window drew. If
the background task finishes and is recorded completed between that draw and the skip reaching main, the skip names a
task that is no longer pending. The coordinator then moves it from completed to skipped, and a finished setup reads as
skipped. The window is a few milliseconds wide. It opens only when a skip lands just after a background run
ends, while its publish is still on the way. No run has shown it. It was found by reading the skip path while
repairing `the-setup-dialog-takes-a-background-run-as-its-own.md`, and it is recorded, not repaired, since no measured
red needs it.

## Specs

- **REQ-WORKSPACE-086**: "Skipping SHALL record every given **pending** task id as skipped". A completed id is not
  pending.
- **REQ-WORKSPACE-084**: a task that succeeded "is recorded as completed". A skip afterwards overwrites that outcome.

## Relevant files

- `apps/desktop/src/main/initialization.ts`: `skip`, which filters only `attempting`.
- `packages/config/src/init/execute.ts`: `recordSkip`.
- `packages/config/src/init/state.ts`: `recordPatch`, which moves an id between the two lists.
