## A todo edit at rest and the quit's terminal record write with no lock

Two more writes through a loaded session's live writer from outside a run claim no lock. A run's teardown releases the
lock while the session stays in `Sessions.live`, so after a process's first run on a session neither write has a lock
row behind it. A second instance on the same workspace may hold the lock and be writing the same session's rows.

- **A todo edit at rest.** `Sessions.editStoredTodo` (REQ-CHAT-090: "a paused or completed session edits the validated
  stored source") writes through `s.writer.save` for the agent's and the planner's lists, and through
  `s.dal.setChildTodo` for a child's. It never looks at the lock.
- **The quit's terminal record.** `Sessions.closeAll` (PD-ORCH-005 clause 10) records each background terminal a
  session at rest had left running as ended by the quit, through `s.writer.recordAgentTerminal`. It does this for every
  loaded session, whether or not this process holds its lock, before the release that follows it.

These are the same shape as the three writes `withWriter` carries. Those three were repaired on 2026-09-29 (R-067,
[`a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`](a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md)).
These two were outside that task, and they were not repaired then.

Noticed 2026-09-29 while repairing that note, by reading every `s.writer` write in `sessions.ts`. No test or proof has
shown either write. Two writes were read and left out: the plan edit (`planEdit`) is made at the plan gate, whose park
keeps the lock; and the continue paths take the lock first (`holdForContinue`).

## Outcome — repaired 2026-10-01

**Confirmed on the branch first.** With the run ended and the session still loaded (no lock row) and a lock row planted
for another live process, a todo edit at rest answered `{ok: true}` and wrote the planner's list under that holder's
lock, and `closeAll` recorded a background session as ended by the quit under it. Three new tests failed on the code
before the repair.

**What changed** (`packages/engine/src/sessions.ts`):

- `editStoredTodo` refuses a malformed request before the lock is touched, then claims through `claimHold` and writes
  under it (`editStoredTodoUnderLock`), giving back a lock it took. Another live holder refuses the edit with nothing
  written: `{ok: false, refusal: {code: 'session_locked'}}` in REQ-SESSION-048's words (`lockHeldRefusal`, the single
  statement of what a held-lock refusal conveys), which the renderer's `control` helper shows in place of its fallback
  sentence. A store that could not be read or written to take the lock refuses `store_failed`.
- `closeAll` hands the quit's terminal records to `recordQuitTerminals`, which claims through `claimHold` only when there
  is something to record. For a session another live process holds, or whose lock could not be taken, it records nothing
  and warns, naming the background sessions and the holder; the session's own `writer.release` after it leaves a
  foreign row alone (`releaseLock` matches pid and host).

**Pinned by** three cases in `packages/engine/src/control.test.ts` ("REQ-CHAT-090 with REQ-EVENTS-098 / ADR-0005: a todo
edit at rest is written under the session's lock": the foreign holder refused and kept, then the edit taking and giving
back the lock once it is free; the store failure; a malformed edit never touching the lock) and one in
`packages/engine/src/run/turn.test.ts` ("clause 10 with REQ-EVENTS-098 / ADR-0005: the quit records nothing of a session
another live process holds"), with the existing clause-10 quit case now asserting the lock is given back. `pnpm
todo-proof` runs `control.test.ts`.

## Specs

ADR-0005: "the run host … must not write a session's rows without holding its lock". REQ-EVENTS-098: the right to write
a session's history is the right to hold its lock.

## Relevant files

- `packages/engine/src/sessions.ts`:
  - `editStoredTodo` writes through `s.writer.save` and `s.dal.setChildTodo` with no claim.
  - `closeAll` writes through `s.writer.recordAgentTerminal` before `s.writer.release`.
  - `claimHold` is the claim a repair would reuse. It keeps the lock when this process holds it, takes it and gives it
    back otherwise, and refuses a live foreign holder.
- `packages/engine/src/run/run.ts` — the teardown's `writer.release`, which leaves the loaded entry without a lock.
