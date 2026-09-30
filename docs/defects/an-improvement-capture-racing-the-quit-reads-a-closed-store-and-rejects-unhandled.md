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
