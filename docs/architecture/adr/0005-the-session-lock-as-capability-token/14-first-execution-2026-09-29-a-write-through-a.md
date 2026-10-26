# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — First execution — 2026-09-29, a write through a loaded session outside a run

Part 14 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## First execution — 2026-09-29, a write through a loaded session outside a run

*Recorded under R-067 (acceptance finding A14); the repair of
`../../../defects/fixed/a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`.*

**Built and run:** the three writes the run host makes against a session's record from outside a run — the repair
(`repairOne`: REQ-SESSION-060's browser Repair and REQ-GIT-094's open-time repair), the restore's safety checkpoint
(`recordSafetyCheckpoint`, REQ-GIT-058 gate 5) and its outcome (`recordRestore`, REQ-GIT-062) — go through `withWriter`,
whose branch for a session loaded here now claims the lock through `claimHold` before writing: kept when this process
holds it, taken with REQ-SESSION-047's one reap and given back after the write otherwise, and refused `lock-held`, naming
the holder, with nothing written while another live process holds it — the refusal the branch for a session not loaded
here already gave through `SessionWriter.open`. Pinned by three cases in `session-resume.test.ts` that failed before the
repair. In the built app, `checkpoint-proof`'s `loaded-restore` launch runs a session so it stays loaded after its
teardown releases the lock, plants a lock naming another machine once the run has ended, and drives a restore: the
restore stopped at gate 5 under that holder's lock with the file untouched and the planted lock kept; on the code before
the repair the same launch restored the file under it.

**Found: the claim this record made on 2026-09-06 held only for a session not loaded here** — corrected in place
above, with its reading kept. Two further writes through a loaded writer outside a run (the REQ-CHAT-090 todo edit at
rest and the quit's terminal record) are the same shape and are recorded, not repaired:
`../../../defects/a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md` (now under `fixed/`; repaired on <!-- historical-path: ../../../defects/a-todo-edit-at-rest-and-the-quits-terminal-record-write-with-no-lock.md -->
2026-10-01, the section below). Nothing in the decision moves.
