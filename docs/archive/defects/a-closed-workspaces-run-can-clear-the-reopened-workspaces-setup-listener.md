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
([a-workspace-switch-never-cancels-the-outgoing-initialization-run.md](a-workspace-switch-never-cancels-the-outgoing-initialization-run.md)),
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

## Outcome

Repaired 2026-09-30 under R-067, on the branch that also repaired the switch-time cancellation. Two changes in
`apps/desktop/src/main/initialization.ts`. (1) The sink is cleared only by the follow that installed it
(`if (this.setupListener === drain)`), and `run`'s `finally` no longer touches it: a run ending late cannot clear another
run's sink. (2) The coordinator's setups are one at a time (`setupTurn`): the run host holds one setup and pushes its
status with no workspace on it, so a run's `code-intelligence-setup` starts only once the setup before it has ended,
and the one sink always belongs to the setup the statuses describe. After a switch the replacement's resolution still
returns at once (REQ-WORKSPACE-013); the task waits inside the run, and logs that it waits. A run cancelled while it
waits starts nothing and fails as REQ-WORKSPACE-093 says, retryably, with the summary "Code intelligence setup did not
complete for this project. …" and the error "Code intelligence could not complete this project's setup: the setup was
cancelled before it started." (`CANCELLED_BEFORE_SETUP_ERROR`); the turn passes on only once the setup before it has
ended as well. (3) Found by the verification of this repair: the one-at-a-time order lets the next run's setup start
while the run before it is still recording its outcome, and that run's abort listener outlived its follow. The run
host's cancel is its one setup's, not a workspace's, so a close (PD-SHELL-001's second window, or a switch whose
outgoing close lands after the replacement's resolution) or a Cancel of the earlier run in that interval cancelled the
next workspace's setup. `followSetup` now removes its abort listener once its setup has finished, so a run's abort
reaches the run host only while its own setup is live.

Pinned by three cases under "one setup at a time across a workspace switch" in `initialization.test.ts`, which fail on
the coordinator before this repair; mutating the repair back one part at a time — the unconditional clear in `finally`,
no wait for the turn, a turn released before the setup ahead of it ended — fails at least one of them each time; and
by two cases, "leaves the next workspace's setup running when a workspace whose setup has ended is closed while its run
still records" and "… when the user cancels a run whose setup has ended while it still records", which fail (one
cancellation sent to the run host, where none is owed) without part (3). Shown
in the built app by `workspace-proof`'s scenario 8b, whose stand-in runtime now takes 2 s to end once asked to
terminate, so the outgoing setup is still ending when the replacement resolves: on the build with only the switch-time
cancellation, the replacement's start was refused and reported as "not a local launch" and its check failed; with this
repair the replacement's task logged that it waited, its setup started 2 ms after the outgoing one was cancelled, and its outcome
was recorded; all 39 checks passed (as root under Xvfb, Node 24, `--skip-build` after one `pnpm build`).
