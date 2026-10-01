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
[`fixed/a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`](fixed/a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md)).
These two were outside that task, and they are not repaired.

Noticed 2026-09-29 while repairing that note, by reading every `s.writer` write in `sessions.ts`. No test or proof has
shown either write. Two writes were read and left out: the plan edit (`planEdit`) is made at the plan gate, whose park
keeps the lock; and the continue paths take the lock first (`holdForContinue`).

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
