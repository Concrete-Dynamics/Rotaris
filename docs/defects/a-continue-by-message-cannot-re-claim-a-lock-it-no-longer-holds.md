## A continue by message cannot re-claim a lock it no longer holds

`Sessions.prompt` checks the session's lock before it continues. When the lock is absent, or names another process, it
calls `this.resume(...)` to re-claim it. But `prompt` has already found the session live in this process, and `resume`
returns early for a live entry (`if (existing) return ok({ sessionId })`) without opening a writer, and a writer's
opening is how `resume` claims a lock (`SessionWriter.open` → `claimLockReaping` → `dal.claimLock`). So the branch
re-claims nothing, and the continuation runs and
writes the session's rows with no lock of its own. That can happen when another process repaired the session: its
`withWriter` opens a writer, then releases the lock. Nothing tests the branch. Found 2026-09-28 while building
`PD-ORCH-005` clause 18 (R-065). `continueSession` was to mirror the branch for a session a crash left, and a probe that
threw inside it was never reached by any crash-left path, so it was not mirrored. Not repaired.

The same root cause — a continue in a process that already holds the live entry claims no lock — is seen from the run's
teardown in [`a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md`](a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md).
One repair answers both, and moves both notes.

## Specs

ADR-0005 (the lock is the capability that authorises writing the session's rows) and REQ-SESSION-083/112/118 (load,
validate, claim). A continuation that writes without the lock contradicts ADR-0005. No requirement names the re-claim
itself.

## Relevant files

- `packages/engine/src/sessions.ts` — `Sessions.prompt`, the lock check and its `this.resume(...)` call; `Sessions.resume`,
  the early return for a live entry; `Sessions.withWriter`, which claims a lock and then releases it for a session not live
  here.
- `packages/engine/src/session-writer.ts` — `SessionWriter.open` and `SessionWriter.create`, which claim a lock with a
  writer, and `claimLockReaping`, the claim with its one dead-local-holder reap.
- `packages/engine/src/sessions.ts` — `lockForWrite`, the at-rest cancel's claim without a writer (`PD-ORCH-005`
  clause 16, OQ-101), through `claimLockReaping`, given back after its write. The repair chooses whether the continues
  reuse it, call `claimLockReaping` and hold the lock for the run, or reopen a writer.
