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

## Repaired 2026-09-28 under [R-062](../../product/requests.md#r-062)

The note's second candidate repair was taken, because the first only narrows the window. The pass is now two steps on
the one connection (`packages/platform/src/instance.ts`; ADR-0055's restart section, *Amended 2026-09-28*):

1. the successor announces itself and waits at most the hand-over interval, as before, for the predecessor's answer;
2. the predecessor checks what it checked before (`acceptSuccessor`, the record still names it) and answers
   `{"record":"offered"}`. This is an offer, not the pass, and it deliberately carries no `ok:true`;
3. the successor acknowledges with `{"ack":true}`, which proves it is still waiting;
4. the predecessor waits for that acknowledgement at most the hand-over interval, **on the timer port**
   (`deps.timers`). It re-reads the record, replaces it atomically, answers `{"ok":true,"record":"passed"}`, and only
   then reports `onRecordPassed`, after which main closes its windows.

A successor that closed before acknowledging — the case this note describes, its announcement read late after its own
bound — or whose acknowledgement does not arrive within the interval, leaves the record exactly as it was.
`onRecordPassFailed` then fires with the reason, main's wait (`updater/successor.ts`) rejects, and the restart takes
REQ-STARTUP-121's failure branch: `Update not installed`, nothing closes. Once the successor has acknowledged, it waits
for the last word with no bound of its own, because from that moment the record may name it. If the connection ends
with no last word, the successor reads the record: it becomes the instance if and only if the record names it. The
ordinary hand-over of a second launch is unchanged (REQ-STARTUP-162). No change was needed in `main/index.ts` or in the
updater. `successor.ts`'s header now names the new refusals.

**Pinned by** `packages/platform/src/instance.test.ts`, 8 new cases over real sockets, with a `FakeClock` where the
bound is the subject:

- the record is offered and left untouched until the acknowledgement, which rewrites it and reports the pass;
- a successor that closed before answering is not passed the record, the record is byte-for-byte intact, and the
  restart fails;
- an acknowledgement missing at 4,999 ms of a 5,000 ms interval changes nothing, the refusal comes at 5,000 ms, and a
  late one passes nothing;
- **a predecessor whose loop is blocked (600 ms, `Atomics.wait`) past a real successor's 200 ms bound** refuses the
  buffered announcement, and a third launch is then handed to the predecessor. Run against the one-step `instance.ts`
  this case is red, the record passed to the successor that had ended;
- the successor waits past its own bound once it has acknowledged;
- a refusal after the acknowledgement carries its reason;
- the successor reads the record when the predecessor ends without a last word;
- the ordinary hand-over line gets `{"ok":true}` and no offer.

Against the one-step code, 7 of the 8 are red; the eighth, the ordinary hand-over, is green on both, as it should be.
**Not shown here:** the restart between two real processes on a Windows host, owed to the next `pnpm package` (IC-3).
