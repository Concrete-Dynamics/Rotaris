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

*Corrected 2026-09-29 (R-067): "held through the continued run" was true of the **first** continue after a load only.
That teardown released the lock while the session stayed loaded in the same process, and no later continue there took it
back — `prompt`'s re-claim went through `resume`, which returns at once for a session already live, and the Continue
action and the plan decision claimed nothing — so every run after a process's first ran with no lock row. The claim is
kept as it was measured; what the later continue does now is the section "the lock a continue takes back" below.*

**Found: nothing in this record.**
