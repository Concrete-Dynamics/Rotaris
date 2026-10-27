# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — First execution — 2026-10-01, a todo edit at rest and the quit's terminal record

Part 15 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## First execution — 2026-10-01, a todo edit at rest and the quit's terminal record

*The repair of `../../../defects/fixed/a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md`.*

**Built and run:** the two remaining writes through a loaded session's writer from outside a run now claim the lock the
way the three above do (`claimHold`). A todo edit while the session rests (REQ-CHAT-090, `editStoredTodo`) keeps a lock
this process holds, takes and gives back a free one, and is refused with nothing written while another live process
holds it — `session_locked`, in REQ-SESSION-048's words (`lockHeldRefusal`) — or `store_failed` when the store could not
be read or written to take it; a malformed edit is refused before the lock is touched. The quit's record of a resting
session's background sessions (PD-ORCH-005 clause 10, `recordQuitTerminals` from `closeAll`) is written under the same
claim, and for a session another live process holds it records nothing and warns: those rows are that holder's to
write, and the background session stays `running` in the record for the next repair or continue to settle.

**Found the note true on the branch.** With a lock row planted for another live process after a run's teardown, the todo
edit answered `ok` and wrote under it, and the quit recorded the background session as `quit` under it. Three of the
four new cases in `control.test.ts` and `run/turn.test.ts` failed on that code; the fourth, a malformed edit never
touching the lock, passed on both. Nothing in the decision moves: "the run host must not write a session's rows without
holding its lock" now holds for every `s.writer` write `sessions.ts` makes outside a run that was read on 2026-09-29.
