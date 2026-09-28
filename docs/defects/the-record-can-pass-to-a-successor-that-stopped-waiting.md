## The instance record can pass to an update successor that has stopped waiting for it

`Restart now` (REQ-STARTUP-121, ADR-0055) starts the successor, which announces itself on the predecessor's hand-over
endpoint and waits at most the 5 s hand-over interval for the answer (`inheritInstance` → `tryHandOver` in
`packages/platform/src/instance.ts`). If that bound expires, the successor closes its endpoint and ends quietly. But if
the predecessor's event loop was blocked for longer than 5 s at that moment — a long synchronous step in main, a
debugger, a machine under load — the announcement stays buffered on the predecessor's accepted socket. When the loop
runs again, `passRecord` reads the line and, because the restart is still waiting (`acceptSuccessor`), replaces the
record with the successor's fields. It then calls `onRecordPassed`, and main destroys its windows and quits. The answer
is written to a socket whose peer has already closed, and nothing checks whether it arrived. The record names a
process that has exited, and no instance is running. A later launch reclaims the dead pid's record under
REQ-STARTUP-164 (3), so nothing is stranded. The user is still left with no window at the moment they asked for a
restart, and they are not told why.

Found by the second verification of the updater item (R-062, 2026-09-28). It is not repaired: the item's repair fixed
the pass the predecessor itself refuses (`onRecordPassFailed`). One candidate repair is to re-probe the successor's pid
(`isLockLive`) after the replacement and before `onRecordPassed`, and on a dead pid restore the predecessor's own
record and fail the restart. Another is to have the successor acknowledge the answer before the predecessor closes. A
probe only narrows the window, because the successor may exit between the probe and the close. The first execution on
a Windows host will show how wide the window is.

## Specs

REQ-STARTUP-121: the predecessor closes "only after the successor has started", and when the successor cannot take
over, "nothing SHALL close" and the failure surfaces through `Update not installed`. REQ-STARTUP-161: one instance per
user account, which here drops to none. ADR-0055 ("The update restart is a hand-over of the record") assumes the
successor is alive when the record is rewritten.

## Relevant files

- `packages/platform/src/instance.ts`: `listen` (the successor branch answers after `passRecord` settles, without
  checking the peer), `passRecord` (replaces the record, then reports it passed), and `inheritInstance` / `tryHandOver`
  (the successor's 5 s bound).
- `apps/desktop/src/main/index.ts`: `claimDeps.onRecordPassed`, which settles `successorWait`, and `startSuccessor`.
- `apps/desktop/src/main/updater/successor.ts`: the wait that resolves on `passed()`, after which the updater closes
  the windows.
