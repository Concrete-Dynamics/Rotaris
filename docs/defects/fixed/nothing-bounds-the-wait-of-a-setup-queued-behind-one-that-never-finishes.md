## Nothing bounds the wait of a setup queued behind one that never finishes

`InitializationCoordinator` runs its `code-intelligence-setup`s one at a time (`setupTurn`): a run's setup starts once the
setup before it has ended, and "ended" is `followSetup` seeing a pushed `mcp.setupStatus` whose state is `finished`. No
time bounds that wait. If a setup's finished status never arrives — the run host exits or is lost mid-setup, or a push is
dropped — the follow never resolves, its turn is never released, and every later workspace's setup in the same process
waits behind it for the rest of the process's life, showing a run in progress that never ends. Today main never re-forks
the run host (`apps/desktop/src/main/index.ts`), and the run host's own stage budgets (300 / 1800 / 120 s) end every
setup it runs, so the case needs the run host itself to fail; but nothing in the coordinator would notice. Noticed by the
verification of the repair of the setup overlap on 2026-09-30 (an optional finding) and recorded under R-067; not
reproduced, and not repaired here.

## Specs

- REQ-WORKSPACE-109: an initialization run reaches its conclusion, cancelled or not, and its progress is reported as
  it goes; a follow that never ends reports neither.
- REQ-WORKSPACE-084: every attempted task is given exactly one recorded outcome.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `setupTurn`, `turnReached`, and `followSetup`, which resolves only on a
  `finished` status.
- `apps/desktop/src/main/index.ts` — the run host's single fork, and `onSetupStatus`'s routing of `mcp.setupStatus`.

## Outcome — repaired 2026-10-01 (R-067)

A follow now ends without its `finished` status in two ways, each a retryable failure in REQ-WORKSPACE-093's summary
that releases the next setup's turn of `setupTurn`. Main tells the coordinator when the run host exits
(`InitializationCoordinator.onRunHostExit`, from `runHostChild`'s `exit` in `apps/desktop/src/main/index.ts`): the error
reads "{the running stage's reason}: the run host exited before the setup finished.". And a follow still open 2235 s
after it began — every stage's budget (REQ-WORKSPACE-091) plus REQ-WORKSPACE-092's 5 s for each, `SETUP_FOLLOW_BOUND_MS`
— ends with "…: no outcome arrived within the setup's time budgets.", for a push that was lost. The details, the bound,
and what is not done on it (no cancellation is sent) are the build's, raised as
[OQ-168](../../architecture/open-questions.md); nothing is recorded, so the task stays pending.

Pinned by `apps/desktop/src/main/initialization.test.ts`, "a setup whose finished status never arrives": the run host's
exit ends the follow under the stage that was running and the queued workspace's setup then starts; the bound ends it
at 2235 s and not 1 ms before (red on the code before: no outcome at 2235 s, the queued setup never started); and a
follow that ended in time is untouched by either. Shown by `workspace-proof`'s new scenario 8d (the run host killed by
SIGKILL while the first project's setup holds `create` and a second window's setup waits behind it): on the build before,
it failed — neither run ended within 40 s of the kill; on the repair it passed (42 passed, 0 failed, 2 skipped; as root
under Xvfb, Node 24, `--skip-build` after `pnpm build`, load average about 9 from the other plan's agents), the first run
ending 101 ms after the kill with "Code intelligence could not create this project's configuration: the run host exited
before the setup finished." and the queued run attempted and ending 15 s later. **Found besides:** that queued run's start,
sent to the run host that is gone, is reported as a task with no outcome rather than in REQ-WORKSPACE-093's words
([`a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md`](../a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md),
recorded, not repaired).
