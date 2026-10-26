# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — Alternatives considered — the workspace integration lock

Part 4 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

## Alternatives considered — the workspace integration lock

**G — One lock table for both, keyed by `(kind, key)`.** *This record's own superseded decision.* It was
attractive and the argument was real: one mechanism, one reap rule, one place to audit, one primary-key
insert standing in for exclusive create, and no second medium for a reader to disagree with — which is
exactly the reasoning that rejected alternative C for the session lock.

**What killed it is ESC-15.** A store held only on this machine is invisible to any other machine, and
`REQ-GIT-128` protects something that is *not* machine-local: the base repository, which is the user's own
material and travels with the workspace. A store-held integration lock would therefore be no lock at all
across the boundary that matters, and **two machines with the same checkout mounted could promote into one
base branch at once** — a silent, destructive outcome in the user's own repository. `REQ-GIT-128` states the
conclusion and the reason: the lock "stays a file beside the workspace, and stays there deliberately … It is
the one lock in the product that is not machine-local, and that is why `host` is load-bearing here in a way
it is not for a session lock (`REQ-SESSION-198`). Moving it into the machine-local session store would let
two machines promote into one base branch at once."

**ESC-21 has since added a fifth ground and made the refusal symmetric**: unifying the two locks is now
refused in *both* directions rather than one, because the direction G proposed is refused by ESC-15 and
the opposite direction is refused by ESC-15 as well, for a different reason. The full argument is in *Why
the two locks are not unified* below; G is not reopened by it, it is closed harder.

**The two locks were never as alike as the superseded record said**, and the correction matters because G
was partly argued from the likeness. `REQ-SESSION-046`'s record carries `pid`, `host`, `acquired_at`.
`REQ-GIT-128`'s file carries `{session_id, pid, host, started_at}` — four fields, a different timestamp name,
and an owning session id the session lock has no use for. **What the two share is the reaping rule, not the
shape**: reaped once when `host` names this machine and the process is dead, never reaped when `host` names
another machine.

**H — The integration lock stays a file in the workspace.** Chosen, per `REQ-GIT-128`.
