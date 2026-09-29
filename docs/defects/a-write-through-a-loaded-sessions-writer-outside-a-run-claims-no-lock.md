## A write through a loaded session's writer outside a run claims no lock

`Sessions.withWriter` writes a session's rows from outside a run: `repairOne` (the session browser's Repair and
REQ-GIT-094's open-time repair), `recordSafetyCheckpoint` and `recordRestore`. For a session not live in this process it
opens a writer, which claims the lock (with ADR-0005's one reap), and releases it after the write. For a session that
IS live here it writes through the live entry's writer at once (`if (live) … fn(live.writer)`) and never looks at the
lock. A run's teardown releases the lock while the entry stays in `Sessions.live`, so after a process's first run on a
session those writes are made with no lock row — and a second instance on the same workspace may hold the lock and be
writing the same session's rows. The continue paths had the same shape and were repaired on 2026-09-29 (R-067,
`holdForContinue`); these three writes were outside that task and are not.

Noticed 2026-09-29 while repairing
[`a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md`](fixed/a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md).
Not repaired.

## Specs

ADR-0005 ("the run host must not … write a session's rows without holding its lock"; the 2026-09-06 first execution's
reading that REQ-SESSION-060's entry is written under the lock). REQ-EVENTS-098 (the right to write a session's history
is the right to hold its lock).

## Relevant files

- `packages/engine/src/sessions.ts` — `withWriter`, its live branch; its callers `repairOne`, `recordSafetyCheckpoint`,
  `recordRestore`; `claimHold`, the claim a continue and the at-rest cancel share, which a repair would reuse (kept when
  this process holds the lock, taken and given back otherwise, a live foreign holder refused).
- `packages/engine/src/run/run.ts` — the teardown's `writer.release`, which leaves the loaded entry without a lock.
