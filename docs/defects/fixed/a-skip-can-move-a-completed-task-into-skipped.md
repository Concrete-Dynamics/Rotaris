## A skip can move a completed task into skipped

`InitializationCoordinator.skip` records every id it is given except one the live run is attempting. `recordSkip` →
`recordPatch` (`packages/config/src/init/state.ts`) then **moves** each id: it takes the id out of `completed` and puts
it in `skipped`. The ids come from the dialog's list, which is the pending list of the last state the window drew. If
the background task finishes and is recorded completed between that draw and the skip reaching main, the skip names a
task that is no longer pending. The coordinator then moves it from completed to skipped, and a finished setup reads as
skipped. It was found by reading the skip path while repairing `the-setup-dialog-takes-a-background-run-as-its-own.md`,
and was first recorded, not repaired, since no measured red needed it.

*(Corrected 2026-09-29, the fix round's verifier.)* The note first said the window "is a few milliseconds wide" and
"opens only when a skip lands just after a background run ends". That was not true of the branch that recorded it, and
the note did not say the branch had made the path reachable. On `main` the dialog drew the background run as its own
and Skip and Escape were inert for the whole run, so a skip could not overlap the run's end. The branch's repair of the
dialog keeps it in its prompt state, Skip and Escape live, for the whole background run. And `skip` awaited
`resolve(true)` before it filtered, which on an open already resolved is `viewFor` → `deriveSets` → `setup.status()`, a
round trip to the run host that the branch notes can last up to 15 s. A background run that ended inside that read
cleared `attempting` and was recorded completed; `recordSkip` then moved the id into `skipped`. The verifier reproduced
it with a copy of the coordinator's harness: resolve, run live, skip both listed ids while the status read is held,
finish the run, release. The file read `completed: [code-intelligence-setup]` before the release and `completed: [],
skipped: [code-intelligence-setup, verification-consent]` after it.

## Specs

- **REQ-WORKSPACE-086**: "Skipping SHALL record every given **pending** task id as skipped". A completed id is not
  pending.
- **REQ-WORKSPACE-084**: a task that succeeded "is recorded as completed". A skip afterwards overwrites that outcome.

## Relevant files

- `apps/desktop/src/main/initialization.ts`: `skip`, which filters only `attempting`.
- `packages/config/src/init/execute.ts`: `recordSkip`.
- `packages/config/src/init/state.ts`: `recordPatch`, which moves an id between the two lists.

## Outcome

Repaired 2026-09-29 under R-062. `InitializationCoordinator.skip` (`apps/desktop/src/main/initialization.ts`) now:

- waits only for the open's automatic resolution when one is made or under way (`await e.automatic`), and reads
  nothing more. It performs the resolution itself only when none has begun (OQ-122). The status round trip after the
  resolution, and the window it opened, are gone.
- leaves out, beside an id the live run is attempting, every id already recorded **completed** in the coordinator's
  state, and logs it. The filter runs in the same turn as the last await. A run clears `attempting` only after its
  outcome is in the state, so the two describe the same moment. This covers the resolution's own last view read,
  which a skip performed before the resolution still waits behind.

It does not drop an id that is no longer applicable. Knowing that needs the applicability read the repair removes, and
recording such an id as skipped changes nothing the user can see: the view filters both lists to applicable tasks.

Two cases in `apps/desktop/src/main/initialization.test.ts` pin it, and both fail on the code before the repair:

- "leaves a background task completed when its run ends while a skip after the resolution is in flight": the
  verifier's order.
- "… while the resolution a skip performs first is still reading": the second case also fails with only the first
  change, so it pins the completed filter.

`init-proof` passed three runs in a row on the repaired build (ADR-0064, "Third round").
