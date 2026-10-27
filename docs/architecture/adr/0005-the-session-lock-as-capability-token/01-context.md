# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — Context

Part 1 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## Context

**The storage question this ADR was written to answer has been answered by the specification, and the ADR
now records it rather than deciding it.** `REQ-SESSION-046` no longer says "a file named `lock` at the
session-directory root". It says the session lock "MUST be a record held in the same store as the session it
locks, claimed by an operation that either succeeds or reports the existing holder, so that two claims on
one session can never both succeed and a claim can never partially take effect", carrying `pid` (integer),
`host` and `acquired_at`. `REQ-GIT-020` says the same from domain 06 and adds the sentence that binds the
two: the field set "is shared verbatim with `REQ-SESSION-046` and **neither domain may change it alone**".

That changes this record's job in two ways. What was an architecture decision — row, not file — is now a
requirement, and the alternatives below are preserved as history rather than as live options. And the three
field names have become a **cross-domain contract with two owners**, which means they are not the
architecture's to rename, retype or extend: a column added here is a specification amendment in two domains,
and `REQ-SESSION-183` reads all three back to a user before it acts, so they are user-visible as well as
machine-readable.

**ESC-15 then moved the store, which changes what the `host` field is for.** With the store machine-local
(`REQ-SESSION-198`), a lock naming another machine can no longer arise from the ordinary case it was
designed for. `REQ-SESSION-054` says so: such a lock "is no longer the ordinary consequence of a workspace on
shared storage but evidence that the store itself is reachable from more than one machine — a state that
should not arise. The `host` field is kept as the defence against it and as what makes the pid probe sound
at all, since probing a pid recorded by another machine would be meaningless." The field is not vestigial; it
has been promoted from a routine discriminator to a fault detector, and `REQ-SESSION-048` requires the
refusal to say which of those two things happened.

**SR-1 does not weaken the lock and the specification says so in terms.** `REQ-SESSION-047`: "That only one
instance of the application runs at a time (`REQ-STARTUP-161`) is not a reason to weaken any of this. The
lock this path exists to reap is the one a *previous* instance left behind when it crashed or was
force-quit — the one case in which no process can be asked to release it." `REQ-SESSION-050` narrows the
arbitration to exactly two cases: a further run started inside this same instance, refused outright
(`REQ-SESSION-083`), and a lock left behind by an instance that is gone. `REQ-GIT-020` names a third the
sessions domain does not: "the brief overlap of an in-place update hand-over (`REQ-STARTUP-121`)".

The rules the lock must satisfy, all of which are behaviour rather than storage:

- `REQ-SESSION-047` allows **at most one** stale-reap attempt per acquisition — two claims in total — and
  only when the record carries the three fields with their stated types, `host` names this machine, and
  `pid` probes dead here. **No waiting, no bounded retry loop, no second reap.** In every other case the
  lock is respected, acquisition fails, and the record is **left exactly as it was found**.
- `REQ-SESSION-048` is the single statement of what a refusal must convey, and it requires the two cases to
  be **distinguished**: a lock naming this machine says another run in this application holds the session
  and names the pid; a lock naming another machine says the session is held by a different machine, names
  it and when the lock was taken, says this instance cannot establish whether that run is still going, and —
  because the store is machine-local — says that such a lock means this workspace's session store is
  reachable from more than one machine, "which is the condition the user must resolve rather than a lock to
  be cleared".
- `REQ-SESSION-183` requires that a lock this machine cannot prove dead is never reclaimed automatically:
  exactly one explicit, user-confirmed action removes it, stating pid, host and acquisition time first,
  saying what a foreign host *means* and not only what it says, warning that releasing a lock a live run
  still holds risks two runs writing one session, and removing the lock and nothing else —
  `execution_status` left exactly as it stands.
- `REQ-SESSION-056` defines live as present-and-not-proved-unheld and resolves every uncertainty toward
  live; `REQ-SESSION-054` keeps pid recycling and the Windows open-handle case as documented limitations
  resolving toward live.
- `REQ-SESSION-058` requires stale detection to read only the listing record and the lock record, to **write
  nothing at all — no state, no file, and no lock touched, which a caller may verify by observing that
  nothing the session owns has changed** — never to raise, and to report an empty result over a store it
  cannot read.
- `REQ-SESSION-171` requires **one verdict**: reaping, liveness reporting, stale detection and the
  worktree-integration precondition must never disagree about one pid at one moment. `REQ-GIT-093` states
  the same rule for domain 06 and adds that the probe asks one question only — "does a process bearing the
  recorded pid exist on this machine now" — and must not try to confirm it is the same process that took
  the lock.
- `REQ-SESSION-051` to `REQ-SESSION-054` fix the probe: uncertainty resolves toward alive; `pid <= 0` is
  dead; permission-denied is alive; and on Windows the probe **must deliver no signal and no console control
  event to the target**.
- `REQ-EVENTS-098` makes the right to write a session's history exactly the right to hold its lock, and adds
  that a run which cannot take the lock does not start, "so nothing ever records beside the holder".
  `REQ-SESSION-049` tears down session-scoped subprocesses **before** the lock is released.
  `REQ-ORCH-053` and `REQ-SESSION-065` settle orphaned child records on continue **without probing
  liveness**, because holding the lock is itself proof the previous owner exited.
- `REQ-SESSION-060` to `REQ-SESSION-063` fix repair: re-check liveness, read state, require an active
  status, set `execution_status = "interrupted"`, make that correction durable before going further,
  best-effort release the lock, write the diagnostics entry — **status first, lock second**, idempotent,
  never raising.
