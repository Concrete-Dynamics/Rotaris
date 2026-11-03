## The run host and the workspace service have no last-resort exception handler and end without a word

Main installs `process.on('uncaughtException')` and `process.on('unhandledRejection')` and logs both
(`apps/desktop/src/main/index.ts`). Neither utility process does: `apps/desktop/src/run-host/index.ts` and
`apps/desktop/src/workspace-service/index.ts` answer a malformed or failing request through the protocol, but a throw
that escapes `dispatch()` or a rejection nothing awaits ends the Node process with Node's default report to a stderr
nobody reads in a packaged build. Main sees only the `exit` event ("run host exited (1); NOT re-forked"), the sessions the
run host held settle through stale detection, and the user sees nothing until the list marks them stale. Neither child
listens for its parent port closing either, which is the mechanism behind
[the run host outliving a killed main on Windows](../../defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md).
Found 2026-11-01 by the read-only survey for [R-091](../../product/requests.md#r-091).

## Specs

None states a last-resort handler. ADR-0002 bounds every request and says a lost run host is not re-forked;
REQ-SESSION-066 states what the user must be able to observe afterwards (a stale marking and a refused restore), and the
build meets that. What is missing is the line that says why the child ended, written where PD-MONITOR-002's log can carry
it, and an end that follows the parent's. Whether the user is told at the moment it happens is
[OQ-462](../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-462).

## Relevant files

- `apps/desktop/src/run-host/index.ts` — the entry; `dispatch().then(…, err)` is the only error path.
- `apps/desktop/src/workspace-service/index.ts` — the same shape.
- `apps/desktop/src/main/index.ts` — `runHostChild.on('exit', …)` and the workspace service's exit handler; the `ready`
  event after `utilityProcess.fork` is not bounded.
- `apps/desktop/src/main/exit.ts` — `ChildrenEndedByMain`, which tells a child main ended from one that was lost.

## Outcome — repaired 2026-11-03 (R-091, hardening §3.2 row 1)

Both entries install `superviseUtilityProcess` (`packages/platform/src/utility-process.ts`) before anything else they
start: on an `uncaughtException` or an `unhandledRejection` the child posts ONE `error` `log` event to main naming the
event and carrying the stack ("an uncaught exception reached the run host's last-resort handler; ending with status 70
(R-091, ADR-0002): …"), and exits with status 70; nothing more is written to the store, so the sessions a run host held
are repaired by the engine's crash path on the next open. Main forwards the line (its run-host `log` listener moved to
the fork, so a line written before the handshake is kept) and reads the status through `childExitReading`
(`apps/desktop/src/main/exit.ts`): "run host exited (70), its last-resort handler: …". A line posted and followed at once by
`process.exit(70)` reached main before the exit event in 18 of 18 scratch launches. The parent-port end is
[the orphaned run host's outcome](../../defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md). Pinned
by `utility-process.test.ts`, `exit.test.ts` and `exit-trace-proof`'s two `last-resort` launches (the seam
`ROTARIS_CAPTURE_CHILD_FAULT`, compiled out of a packaged build). The bounded `ready` and the notice of OQ-462 are §3.2
rows 2 and 3, built by the same bundle's second task.
