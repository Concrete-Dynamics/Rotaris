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
- `packages/config/src/init/execute.ts`: `executeTasks`' recording, which built its patch from a read taken outside the
  write order (`reread`, now `commit`).

## Outcome

Repaired 2026-09-29 under R-062. `InitializationCoordinator.skip` (`apps/desktop/src/main/initialization.ts`) now:

- waits only for the open's automatic resolution when one is made or under way (`await e.automatic`), and reads
  nothing more. It performs the resolution itself only when none has begun (OQ-122). The status round trip after the
  resolution, and the window it opened, are gone.
- leaves out, beside an id the live run is attempting, every id already recorded **completed** in the coordinator's
  state, and logs it. The filter runs in the same turn as the last await. A run clears `attempting` only after its
  outcome is in the state, so the two describe the same moment. This covers the resolution's own last view read,
  which a skip performed before the resolution still waits behind.

*(Corrected 2026-09-29, the fix round's fourth verifier.)* The second bullet's reason, "A run clears `attempting` only
after its outcome is in the state, so the two describe the same moment", held for the coordinator's in-memory state and
not for the file. `e.state` reaches the run's outcome only once the run's marker write has returned, one round trip to
the workspace service after the write was sent, and the skip built its patch from `e.state`. Both patches replace the
two lists whole (REQ-CONFIG-050), so whichever landed second erased the other. The verifier showed both orders with a
harness whose marker writes land in the order sent: (A) a skip while the run's completion write was in flight left the
id to the run, but wrote `completed: []` after the run's `completed: [code-intelligence-setup]`, so the file ended with
nothing completed (REQ-WORKSPACE-084); (B) a skip whose write was in flight when the task finished was read past by the
run's `reread`, which the run then wrote over, so the file ended with nothing skipped and the prompt would return on the
next open (REQ-WORKSPACE-111, REQ-WORKSPACE-086). The branch had made both reachable by keeping Skip and Escape live for
the whole background run. **Repaired the same day:** the coordinator makes every marker write through one queue
(`InitializationCoordinator.marker`), one at a time in the order asked, and each turn is handed the file as the previous
write left it. The skip decides what it leaves out and builds its patch inside its turn, each of a run's recordings is
built inside its own (`ExecuteDeps.commit`, which replaces `reread`), and so is the silent stamp. The coordinator's
harness now applies marker writes in the order sent and can hold them, and two more cases pin the two orders: "keeps
the run's completed outcome when a skip arrives while the completion write is in flight" and "keeps a skip whose write
is in flight when the background run records its outcome". Both fail on the code before the queue. Under the ordered
harness the first case below fails on that code too, by order (B).
The queue was then made one per workspace root (ADR-0064, "Fifth round"), so a workspace just opened does not wait
behind the last marker write of the one it replaced (REQ-WORKSPACE-013); within a root the order above is unchanged.

It does not drop an id that is no longer applicable. Knowing that needs the applicability read the repair removes, and
recording such an id as skipped changes nothing the user can see: the view filters both lists to applicable tasks.

Two cases in `apps/desktop/src/main/initialization.test.ts` pin it, and both fail on the code before the repair:

- "leaves a background task completed when its run ends while a skip after the resolution is in flight": the
  verifier's order.
- "… while the resolution a skip performs first is still reading": the second case also fails with only the first
  change, so it pins the completed filter.

`init-proof` passed three runs in a row on the repaired build (ADR-0064, "Third round").
