# Architecture proposals — DATA slice — C. Concurrency

Part 4 of 25 of [the data proposal](../data.md), which indexes every part.

## C. Concurrency

**C1 — The document stores are coordinated by atomic replacement alone. There is no locking, and
this is stated as a decision, not an omission. (hard)**
`REQ-LIBRARY-042`: "Coordination between processes goes no further than the whole-file atomic
replacement of `REQ-LIBRARY-043` and `REQ-LIBRARY-158` — there is no locking. Every mutation MUST
therefore be a read-modify-write against what the store holds at that moment: the writer re-reads
the artifact file immediately before applying the change and writes back that freshly read state
with the change applied, never a copy a surface has been holding on screen." Losing one of two
genuinely interleaved decisions is an accepted outcome; the later replacement wins whole.
`REQ-LIBRARY-158` repeats it for the session artifact store and adds that within one process
mutations *are* serialised.
`REQ-TRACE-502`: "Concurrent invocations SHALL be safe without any lock, lease or coordination
file… **no invocation SHALL wait for another** … An invocation SHALL NEVER fail, hang or leave a
lock behind because another was running." A check running beside a regeneration may legitimately
report the artifact stale.
This is the single most consequential constraint in the slice. A store that answers a concurrent
writer with a *busy* error, or that makes one writer wait, does not produce these observables.

**C2 — Exactly two lock files exist, and both have fixed content and fixed reclaim rules. (hard)**
Session lock `<session-dir>/lock`, exclusive-create, content
`{"pid": int, "host": string, "acquired_at": ISO-8601 UTC}` (`REQ-GIT-020`, restated identically by
`REQ-SESSION` domain 07). **At most one reclaim retry per acquisition** — so a lock another party
recreates continuously cannot make an acquisition loop. A lock recorded by another host, and a lock
whose content cannot be read or parsed, are treated as held by a live process and are **never**
reclaimed automatically, by an acquisition or by any repair.
Workspace integration lock `<workspace>/.rotaris/integration.lock`, exclusive-create, content
`{"session_id", "pid", "host", "started_at"}`, same reaping rule (`REQ-GIT-128`).
Exclusive-create semantics (`O_EXCL`) is the mechanism named: "of two processes racing for the same
session lock exactly one acquires it and the other does not run."

**C3 — Every liveness ambiguity resolves toward "live". (hard)**
`REQ-GIT-093`: the probe asks one question only — does a process bearing the recorded pid exist on
this machine now — and does **not** attempt to confirm it is the same process that took the lock. A
recycled pid answers yes and the session is reported live; a platform that still reports an exited
process as present answers yes; a lock from another host is not probed at all. `REQ-GIT-150`,
`REQ-GIT-160`, `REQ-GIT-092`. The cost of each such verdict is a refusal that names a remedy, which
the domain prefers to a restore racing a live run.

**C4 — Single-flight rules, per subject. (hard)**
- At most one desktop checkpoint operation in flight; a request arriving while another is in flight,
  or during shutdown, is **declined** with a stated toast (`REQ-GIT-091`, `REQ-GIT-145`).
- One integration per base workspace, enforced by the lock file (`REQ-GIT-128`, `REQ-GIT-136`).
- One run per session, enforced by the session lock (`REQ-GIT-020`).
- At most one traceability operation *of a given kind* per workspace; a second request is **refused
  with a stated reason rather than queued or raced** (`REQ-TRACE-512`).
- At most one state-changing board action per requirement; a second is refused with a stated reason
  and writes nothing, "rather than being queued behind the first or racing it". No bound at all on
  concurrent actions across *different* requirements (`REQ-TRACE-388`).
- One improvement analysis at a time, **in the order the runs that produced them finished**, so
  artifacts and notices appear in that order and never interleave (`REQ-LIBRARY-123`).
- Requirement refresh passes: starting one while another is in flight returns false rather than
  queueing (`REQ-TRACE-229`); a batch arriving during an in-flight read is re-attempted **150 ms**
  later, and that delay is explicitly *not* a debounce (`REQ-TRACE-350`).
- Two threads opening a cold board read the workspace source **once**: the first open coalesces
  concurrent reads (`REQ-TRACE-349`).

**C5 — There is no ceiling on concurrent isolated runs. (hard)**
`REQ-GIT-145`: "no fixed ceiling on how many isolated runs may proceed at once — host resources are
the only limit." Every store in this slice must therefore tolerate N concurrent writers in one
workspace, where N is unbounded, under **C1**'s no-lock discipline.

**C6 — A cancelled pass never blanks the last good state. (hard)**
`REQ-TRACE-223`, `REQ-TRACE-227` (cancellation never abandons the pass: rules already applied are
not rolled back, the projection is still computed, the result is still delivered),
`REQ-TRACE-338` and `REQ-TRACE-379` (a failed evaluation or unavailable projection keeps the last
good board and never falls back to a locally computed one), `REQ-TRACE-224` (a fresh token per pass;
a shared token would leave every pass after the first already cancelled).
