# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — First execution — 2026-09-05, the lock re-claimed on resume, and the one reap

Part 10 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## First execution — 2026-09-05, the lock re-claimed on resume, and the one reap

*Recorded under GD-10.*

**Built and run:** `SessionWriter.open` claims an existing session's lock row for a resume (`Sessions.resume`)
through the same `INSERT OR IGNORE` the create path uses. A held row naming this machine whose pid probes
dead is released and re-claimed **once** (`REQ-SESSION-047`); a held row naming this machine with a live pid
is refused naming the pid; a row naming another machine is refused naming the machine and its acquisition
time and saying liveness cannot be established (`REQ-SESSION-048`) — the three outcomes are one test over a
planted row each (`session-resume.test.ts`). The session browser's list marks a session **stale** when its
status is active and no live holder can be shown, and reaps nothing (`REQ-SESSION-056/057`). In the built
app the resumed session's lock was claimed by the second process, held through the continued run, and
released by its teardown: `session_locks` was empty at exit.

*History: [the correction of 2026-09-29](../../../archive/architecture/adr/0005-history.md#correction-2026-09-29).*

**Found: nothing in this record.**
