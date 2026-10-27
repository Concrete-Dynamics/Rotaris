# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — Alternatives considered — where the session lock lives

Part 3 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## Alternatives considered — where the session lock lives

Recorded as history: `REQ-SESSION-046` now fixes the answer.

**C — A file beside the store.** Its one real advantage was sharp: the lock stays readable when the store
does not, so the application could name the pid and host holding a session it cannot open. Rejected, because
it costs the property `REQ-SESSION-171` exists to protect. Two stores are two sources of truth about one
ownership fact and can disagree in three ordinary ways — a lock file left by a crash beside a healthy store,
a lock row absent while a file says held, a file deleted by hand while the store says running. The
requirement demands one verdict from four consumers about one pid at one moment.

**D — No durable lock at all; an in-memory registry in the run host.** Genuinely tempting under SR-1, and it
must be answered rather than dismissed: with one instance and one run host, in-process ownership is the whole
of the arbitration `REQ-SESSION-050` describes. Rejected on the case the lock actually exists for. **An
in-memory registry dies with the process that held it**, so an instance that crashed would leave a record
asserting `running` with nothing anywhere recording that a run had claimed it — no pid, no host, no
acquisition time. `REQ-SESSION-047`'s reap would have nothing to reap, `REQ-SESSION-183` nothing to state,
and `REQ-SESSION-060`'s repair would fire on inference rather than on evidence. It also erases
`REQ-SESSION-046`'s `host`, which `REQ-SESSION-054` now relies on as a **fault detector** — the argument for
keeping it has become stronger since ESC-15, not weaker.

**E — Lean on the engine's own locking.** Rejected outright. SQLite's write lock is a property of a
transaction and is released when it commits; the session lock must outlive every transaction the run makes,
for hours. Conflating them would make the session lock's lifetime the transaction's.

**F — A row in the store it protects.** Chosen, and now required by `REQ-SESSION-046`.
