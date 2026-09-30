## A closed workspace's initialization run can clear the setup listener of the run that replaced it

`InitializationCoordinator` holds one `setupListener` for the whole coordinator — the step sink of the live
`code-intelligence-setup` — and a run's `finally` sets it to `null` unconditionally. When a workspace is closed while
its run is live (`close` aborts the run and drops the entry) and the same workspace, or another, is opened and starts a
run before the old run has returned, the new run's `followSetup` installs its own sink; the old run's `finally`, landing
later, then clears that sink. The run host's later `mcp.setupStatus` pushes reach no one, so the new run's steps are
never reported (REQ-WORKSPACE-109) and its promise never resolves, which leaves `running` set and the task never
recorded (REQ-WORKSPACE-084). The same shared sink also means the old run's abort (`setup.cancel`) status can be taken
by the new run's sink as its own finish. Found by reading, during the fix-proofs-b5 verification round of 2026-09-29;
not reproduced in a test or the built app. Pre-existing on `main`; the branch did not introduce it.

Added 2026-09-29: main never calls `close`
([a-workspace-switch-never-cancels-the-outgoing-initialization-run.md](fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md)),
so the path reachable today is a workspace switch. The incoming root's run installs its own `setupListener` over the
outgoing run's, which is never aborted. The outgoing run's `followSetup` promise may then never resolve, and its entry
stays `running`. A repair of that note that starts calling `close` opens the path described above, so the two are
repaired together.

## Specs

- REQ-WORKSPACE-109: each step of the running task is reported the moment it finishes, and the task reaches its own
  conclusion; a cleared sink reports nothing and concludes nothing.
- REQ-WORKSPACE-084: every attempted task receives exactly one recorded outcome.
- REQ-WORKSPACE-013: a workspace switch resolves without waiting on the outgoing cancellation, which is what lets the
  two runs overlap.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `setupListener` (the one coordinator-wide sink), `followSetup` (installs
  it and clears it on finish), `run`'s `finally` (clears it unconditionally), `close` (aborts and drops the entry
  without waiting for the run).
