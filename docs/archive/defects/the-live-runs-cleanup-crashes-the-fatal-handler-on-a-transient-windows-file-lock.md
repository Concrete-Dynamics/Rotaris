## The live run's cleanup crashes the fatal handler on a transient Windows file lock

`finish()` ends with `cleanup(has('keep'))`: the credential store is deleted first (`dropCredentials`), then the
sandbox with `rmSync(…, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })`. On Windows a lock —
an antivirus reading the freshly written store, a process still closing — can outlast those retries, and the throw
then runs straight into the `uncaughtException` handler, which calls `cleanup(false)` again: the second throw
becomes Node's "Internal Exception Handler Run-Time Failure" and the process ends at exit 7, replacing whatever
verdict `finish` was about to return.

Observed 2026-10-19 after the evidence manifest's first pack was complete (win32 arm64): `results.json` and
`evidence-manifest.json` were written, the credentials were already deleted, and `EPERM: Permission denied` on the
sandbox directory ended the run at `[ELIFECYCLE] Command failed with exit code 7`, the stack over `cleanup` and
`finish`. The directory removed cleanly by hand minutes later, the transient-lock class this host is known for.

## Specs

None; harness robustness. The script's guarantee that "the credential directory is deleted on every exit path there
is" held — `dropCredentials` runs before the removal that failed.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `cleanup` and the signal and fatal handlers that call it.

## Outcome

Repaired in the harness, 2026-10-19: the removal is wrapped, so a lock prints a warning — naming that the
credentials are already deleted and that the next run's sweep removes the unmarked leftover
(`lib/sandbox-sweep.mjs` does) — and the run keeps its verdict exit code. No throw leaves `cleanup` for the fatal
handler's second attempt.

Shown by the re-run at the same head (`pnpm live-run --confirm --only=shell --skip-build`, pack
`.live-run/runs/2026-10-19T06-17-49-457Z`): exit 0, its sandbox removed with no warning and no leftover under the
sandbox root, its own manifest verifying at 12 files. The lock itself is intermittent and was not re-induced.
