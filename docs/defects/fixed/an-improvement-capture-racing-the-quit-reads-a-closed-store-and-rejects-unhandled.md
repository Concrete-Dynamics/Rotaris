## An improvement capture racing the quit reads a closed store and rejects unhandled

When a run ends as the application quits, the run host's `onRunResult` starts the post-run improvement capture in a
detached `async` closure: it first awaits the improvement history from main (`ask(…, 10 s)`), and only then calls
`captureImprovementJob(store.dal!, …)` on the store it located before the await. By then the quit has closed that store,
so `StoreDal.getSession` throws `TypeError: The database connection is not open`. Nothing awaits or catches the closure,
so Node prints `UnhandledPromiseRejectionWarning` in the run host's output as the application exits.

Seen 2026-09-30, once, in `fetch-proof`'s first launch with its bound cut to 4 s for a scratch run (an overrun ended by
SIGTERM, which the application answered with its ordinary quit path): the log reads `run … ended interrupted
(application_shutdown) → paused`, `run host exited (0)`, `quit: exiting with status 0`, and after them the rejection
with its stack (`StoreDal.getSession` ← `captureImprovementJob` ← `run-host.js`). The quit itself completed with status 0;
no store write is known to have been lost. Not reproduced on purpose, and not measured on a quit a person makes from the
window.

## Specs

REQ-ORCH-137 puts `application_shutdown` on the skip list, and REQ-LIBRARY-032 says capture then yields no job at all.
No job was produced here, so the outcome is the one those requirements name, but it is reached by a throw: the store
read that raises the `TypeError` comes before the check that would have skipped the run, and REQ-ORCH-137 also says any
failure of the pass yields an empty artifact "rather than an error". An unhandled rejection in the run host is an error
no one reads. Whether the closure should check the stop reason before any store read, or check that the store is still
open, is for the repair to decide.

## Relevant files

- `apps/desktop/src/run-host/host.ts`: `onRunResult`'s detached closure, which locates the store before `await ask(…)`
  and uses `store.dal!` after it without checking it is still open or catching the throw.
- `packages/engine/src/improvements/capture.ts`: `captureImprovementJob`, whose first store read is the one that throws.
- `apps/desktop/scripts/fetch-proof.mjs`: where it was seen (a scratch run with `spawnElectron`'s bound cut to 4 s).

Noticed 2026-09-30 while repairing `fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md` under
R-067. Not repaired: outside that task.

## Outcome

Repaired 2026-09-29 under R-067.

Confirmed on this branch first. The scratch run the note describes (`fetch-proof` with `spawnElectron`'s bound cut to a
few seconds, a copy of the script run once and not kept) was taken eleven times against the build of `origin/main`
7ae8072, at bounds from 3.0 to 6.0 s, as root under Xvfb: every run ended `interrupted (application_shutdown) → paused`
and quit with status 0, and one of the eleven (bound 5.0 s) printed `UnhandledPromiseRejectionWarning: TypeError: The
database connection is not open` at `StoreDal.getSession` ← `captureImprovementJob` ← `run-host.js`, as the note says.
It is a race: main answers the history ask after the run host's shutdown has closed its stores and before it exits.

The detached closure moved out of `onRunResult` into `captureAfterRun` (`apps/desktop/src/run-host/improvement-capture.ts`),
which never rejects. The repair takes both readings the note left open, and a third:

- a stop reason on REQ-ORCH-137's skip list — read from the run's result, the same token `captureImprovementJob` compares
  against the record — yields no job before main is asked and before the store is read, so a run the quit ended never
  reaches the store at all;
- the store is looked up again after the history's await (`stores.get(workspaceId)` still the same slot, its handle
  still open), and a store gone or closed by then is a run with no persisted record to draw the snapshot from —
  REQ-LIBRARY-032's last no-job condition — logged at `info`, not thrown;
- any other throw from the capture is caught, logged as a warning and yields no job, since REQ-ORCH-137 says a failure
  of the pass is never an error.

`captureImprovementJob` itself is unchanged: its own skip-list check against the record still decides every run that
reaches it.

Pinned by:
- `apps/desktop/src/run-host/improvement-capture.test.ts`: the first form's throw on a store closed across the await,
  reproduced; an `application_shutdown` run asks nothing and reads nothing; a store closed during the history ask, and
  a store the host has let go of, yield no job and resolve; a throwing capture yields no job with a warning; an open
  store still yields its job, and a rejected history ask reads as history unavailable. With the skip, the re-read and
  the catch taken out, three of its six cases fail.
- The same scratch run against this branch's build, twenty-one times at bounds from 3.5 to 6.0 s (nine at 5.0 s): no
  rejection in any log, every run `application_shutdown → paused` and `quit: exiting with status 0`. The race is timing,
  so twenty-one clean runs against one in eleven narrow it and do not prove it absent; the unit test is the pin.
- `fetch-proof` (exit 0) and `improvements-proof` ("PASSED — six launches") run green on this branch's build, and no
  log of either holds the new `no job` or `capture failed` lines.

Re-taken after `origin/main` moved (the branch fast-forwarded to adcea87 and rebuilt): the six cases pass, three of them
fail with the skip, the re-read and the catch taken out; `fetch-proof` exits 0 and `improvements-proof` passes; eight
more scratch runs at bounds from 3.5 to 6.0 s (three at 5.0 s) each ended `application_shutdown → paused` and
`quit: exiting with status 0` with no rejection in the log or the script's output — twenty-nine clean runs in all.

Not measured: a quit a person makes from the window, as before.
