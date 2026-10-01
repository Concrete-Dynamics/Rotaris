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
[`a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md`](a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md).
Not repaired when noticed; acceptance round 1 found it on merged `main` as A14.

## Outcome

**Repaired 2026-09-29 under R-067** (acceptance finding A14). Confirmed on the branch first: three cases written
against the code before the repair failed — the safety checkpoint and the restore's outcome were written with no lock
row, a live holder in another process did not refuse them, and the repair of a loaded session wrote with a dead local
holder's row in place.

`withWriter`'s live branch now claims the lock through `claimHold`, the one claim of a live session's lock outside a load
that the continue (`holdForContinue`) and the at-rest cancel (`lockForWrite`) share. A lock this process holds is kept
(a session loaded here, a run under way). Otherwise the lock is taken through `claimLockReaping`, REQ-SESSION-047's one
reap, and given back after the write. While another live process holds it, the write is refused `lock-held`, naming the
holder's pid and machine, as the not-loaded branch's `SessionWriter.open` already refused it, and nothing is written. A
store that could not be read or written to take it refuses `store`. All three callers go through it, so `repairOne`
(the browser's Repair and REQ-GIT-094's open-time repair), `recordSafetyCheckpoint` and `recordRestore` are covered.

Pinned by the three cases "a write through a loaded session outside a run holds the lock (ADR-0005, REQ-EVENTS-098)" in
`packages/engine/src/session-resume.test.ts`:

- the safety checkpoint and the restore outcome are each written under this process's lock, and it is given back;
- a live local holder and a foreign holder refuse both, and nothing is written;
- the repair of a loaded session reaps a dead local holder once, writes under its own lock and gives it back.

All three failed on the code before the repair.

Shown in the built app by `checkpoint-proof`'s new `loaded-restore` launch. That launch resumes and runs a session, so
the session stays loaded after its run releases the lock. Once the run has ended, the proof plants a lock naming another
machine, then drives a restore. With the repair, the restore stopped at gate 5 ("Could not persist the safety
checkpoint on the session: Session … is held by pid 4242 on …"), the hand edit stayed, and the planted lock was kept.
On the code before the repair, the same launch restored the file under the other holder's lock, and the proof failed.

The same shape remains at two other writes through a loaded session's writer outside a run. They are recorded in
[`../a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md`](../a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md).

## Specs

ADR-0005 ("the run host must not … write a session's rows without holding its lock"; the 2026-09-06 first execution's
reading that REQ-SESSION-060's entry is written under the lock). REQ-EVENTS-098 (the right to write a session's history
is the right to hold its lock).

## Relevant files

- `packages/engine/src/sessions.ts` — `withWriter`, its live branch; its callers `repairOne`, `recordSafetyCheckpoint`,
  `recordRestore`; `claimHold`, the claim a continue and the at-rest cancel share, which a repair would reuse (kept when
  this process holds the lock, taken and given back otherwise, a live foreign holder refused).
- `packages/engine/src/run/run.ts` — the teardown's `writer.release`, which leaves the loaded entry without a lock.
