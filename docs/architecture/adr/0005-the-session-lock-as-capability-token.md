# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row

- **Status:** proposed
- **Date:** 2026-09-01
- **Supersedes:** its own earlier decision that **both** locks live in one table keyed by `(kind, key)`,
  recorded under this number on 2026-08-31. `REQ-GIT-128` as amended keeps the workspace integration lock a
  **file**, deliberately. The earlier argument is preserved below as alternative **G**.
- **Authority:** `owner-decisions.md` SR-1, SR-4, **ESC-15**; the amended `REQ-SESSION-046`, `REQ-GIT-020`
  and `REQ-GIT-128`, which have settled what this ADR previously had to decide
- **Origin:** RUNTIME (ADR-RUNTIME-07, including a Windows spike), DATA (constraints C2, C3)
- **Depends on:** ADR-0002, ADR-0003, ADR-0058

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

## Alternatives considered — the liveness probe

**Unchanged, and the evidence is preserved because neither the store's kind nor its location bears on it.**

**A — the runtime's null-signal probe, guarded.** A spike was run for the RUNTIME proposal on Node v24.11.0,
Windows 11 build 26200: a child was spawned to sleep 3 s and exit 7; at t+500 ms the parent probed the live
child, pid 999999, pid 0 and pid -1. Result: live `ok`, dead `ESRCH`, zero `ok`, negative `ESRCH` — **and
the child then exited normally, printing its own message and exiting 7**. Node's Windows implementation is
therefore inspection-only and does **not** deliver the console interrupt `REQ-SESSION-053` calls out. Two
guards are non-optional and are required by `REQ-SESSION-052` and `REQ-SESSION-054` rather than being
workarounds: `pid <= 0` answers *dead* before the call, and the error code is mapped — `ESRCH` to dead,
`EPERM` and everything else to alive.

**B — A platform-native probe** through a native addon. More literally faithful to `REQ-SESSION-053`'s
wording, and it would let the Windows case distinguish "exited but a handle keeps it reported" — which
`REQ-SESSION-054` nevertheless **accepts** as a documented limitation resolving toward alive, so the extra
fidelity buys nothing the specification asks for.

**Alternative A with the two guards**, kept behind one interface rather than inlined at four sites so that B
remains available.

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

**The two locks were never as alike as the superseded record said**, and the correction matters because G
was partly argued from the likeness. `REQ-SESSION-046`'s record carries `pid`, `host`, `acquired_at`.
`REQ-GIT-128`'s file carries `{session_id, pid, host, started_at}` — four fields, a different timestamp name,
and an owning session id the session lock has no use for. **What the two share is the reaping rule, not the
shape**: reaped once when `host` names this machine and the process is dead, never reaped when `host` names
another machine.

**H — The integration lock stays a file in the workspace.** Chosen, per `REQ-GIT-128`.

## Decision

### The session lock is a row

**One table, one kind of row, keyed by session id**, carrying **`pid`, `host` and `acquired_at`**.
`REQ-SESSION-046`'s three field names and value types are kept verbatim as columns, because the requirement
calls them a machine-readable contract, `REQ-GIT-020` binds the same set from the other domain and forbids
either domain changing it alone, and `REQ-SESSION-183` reads all three back to the user before it acts.
**The `kind` column of the superseded version is deleted with alternative G.**

- **Exclusive create becomes a primary-key insert.** The session id is the primary key, so a second claim
  fails on the constraint rather than on a filesystem race. This is strictly stronger than the file it
  replaces: exclusive create was atomic, but *read-check-delete-then-create* was three operations with a
  window between each.
- **Acquisition and reap are one transaction, and it still never spins.** `BEGIN IMMEDIATE`; insert; on a
  constraint failure read the row and apply `REQ-SESSION-047`'s three conditions — the record carries the
  three fields with their stated types, `host` names this machine, `pid` probes dead here; if all three
  hold, delete and insert once and commit; otherwise **roll back**, which leaves the row exactly as it was
  found, and fail. **One reap, two claims, no waiting, no retry loop, no second reap** — now atomically
  rather than by discipline. A lock another party keeps re-claiming still cannot make an acquisition spin.
- **A failure reports the holder, and which of two things is wrong.** `REQ-SESSION-048` and `REQ-GIT-020`
  both require the refusal to distinguish a lock naming this machine from one naming another, and the second
  case to be reported as *the store being reachable from more than one machine* rather than as a lock
  conflict. The rolled-back transaction has the row in hand, so the refusal is built from what was read and
  never from a second read that could disagree.
- **Release is unchanged in order.** `REQ-SESSION-049`'s session-scoped subprocesses — tool servers,
  language servers — are torn down **first**; the row is deleted **last**, in its own transaction.
- **The lock is still the capability.** Holding it authorises writing that session's rows
  (`REQ-EVENTS-098`) and settling orphaned children on continue (`REQ-ORCH-053`, `REQ-SESSION-065`). The run
  host must not hold two locks for one session and must not write a session's rows without holding its lock.
  **Main and the workspace service never hold a session lock and therefore never write a session's rows** —
  which is ADR-0058's table-ownership rule reached from the other direction.
- **One predicate, four call sites.** `isSessionLive(sessionId)` is implemented once over the lock row and
  the guarded probe, and `REQ-SESSION-047`, `REQ-SESSION-056`, `REQ-SESSION-057` and `REQ-SESSION-064` all
  consume it. Domain 06's `REQ-GIT-093` consumes the same predicate through the workspace service. Any
  second implementation is a defect by `REQ-SESSION-171`.
- **Read paths and repair paths are still different objects.** The detector takes a **`query_only`**
  connection; the repairer is a separate, explicitly invoked service holding a writable one.

**`REQ-SESSION-058`'s verification method has been amended and the amendment has landed.** The superseded
version of this ADR listed it as owed. The requirement now says stale detection must write nothing at all —
"no state, no file, and no lock touched, **which a caller may verify by observing that nothing the session
owns has changed**" — which is a property of the session's own records rather than a fingerprint of a
directory tree. That matters because a store's `-wal` and `-shm` companions are engine bookkeeping and change
without any row changing, so the old tree-fingerprint test would have failed a conformant implementation.
The architecture's obligation is now simply to make the guarantee structural: the detector's connection is
`query_only`, on which the engine refuses a write rather than performing one.

**Recovery must precede detection, and the ordering is a rule.** A process that crashed can leave a
write-ahead log needing recovery, and recovery is a write performed at open — so a `query_only` open would
fail on exactly the store a crash left behind, which is the store stale detection most needs to read. The
**workspace service opens the store read-write once at workspace open**, before any other process is told
the workspace is open and before any stale detection runs, which performs recovery. Only then does detection
run `query_only`. This is the same instinct as `REQ-SESSION-060`'s mandatory ordering: the state that lets a
read be safe is established by a write that happens first, deliberately, in a known place. ADR-0058 makes the
same open the identifier-resolution and migration point, so there is exactly one.

**When the store itself is what failed to open.** This is the case alternative C existed for, and the answer
is that there is nothing to arbitrate. If the workspace store will not open, no session in that workspace can
be listed, read, run, reaped or repaired, because the lock and the record it guards are the same object. The
application reports the **workspace store** as unopenable, naming the store path and the engine's own error
unaltered (ADR-0058, `REQ-EVENTS-084`), and offers ADR-0058's recovery path. It does not report a session as
live, does not report one as stale, and does not offer `REQ-SESSION-183`'s release for a session it cannot
read — that action is offered "only for a session that reports live", and over an unopenable store nothing
reports anything. `REQ-SESSION-058`'s "report an empty result, not raise, over a store it cannot read" is
exactly this behaviour and was already the specification's answer.

### The integration lock is a file, and that distinction is load-bearing

**`<workspace>/.rotaris/integration.lock`, created with exclusive-create semantics, containing
`{session_id, pid, host, started_at}`** — `REQ-GIT-128`. It is written and removed through ADR-0004's
primitive on its **exclusive-create** path, not its replace path: the file is created, read, and deleted,
and it is never replaced over itself, so neither the reader-handle rule nor any compaction concern reaches
it.

- **The reap rule is the session lock's, and the liveness predicate is the same one.** A stale lock whose
  `host` names this machine and whose process is dead is reaped once; a lock recorded by another host is
  never reaped. `REQ-GIT-128` says explicitly that this is "the same reasoning `REQ-GIT-020` gives for
  session locks". So the product has **one liveness predicate over two media**, and the medium is the only
  difference. Any second probe implementation is the `REQ-SESSION-171` defect again, in domain 06's clothes.
- **`host` means something different here, and that is the whole point.** For a session lock a foreign host
  is a fault (`REQ-SESSION-054`). For the integration lock a foreign host is the mechanism working: a second
  machine with the same checkout mounted is supposed to see this lock and be refused.
- **Its failure messages are fixed strings** — `Another worktree integration is already running.` for a busy
  lock and `Could not acquire worktree integration lock.` for an unreapable one — unlike the session lock's
  refusal, whose wording `REQ-SESSION-048` leaves to the implementation while fixing its information content.
  The asymmetry is the specification's, not an inconsistency to iron out.

**Where this lock is weaker than it reads, stated rather than left to be discovered.** Exclusive create is a
real primitive on a true network filesystem, and `REQ-GIT-128`'s cross-machine guarantee holds there. It is
**not** real inside a file-synchronisation client's tree: such clients replicate after the fact, so two
machines can each successfully create the file and the conflict is reconciled afterwards, by which time both
integrations have started. The product has exactly the right instrument for this and it belongs here:
`REQ-STARTUP-166` requires the two conditions — "storage another machine can reach directly" and "storage a
file-synchronisation agent replicates to another machine" — to be **distinguished and reported as the one
that was found**, directly and never inferred from a failure. This is the one place in the record where that
distinction changes a safety property rather than only a warning, and no requirement currently connects the
two.

## Consequences accepted

1. A lock naming another machine, or one whose record is incomplete, is never reclaimed automatically and
   requires `REQ-SESSION-183`'s explicit, user-confirmed action. Unchanged, and it is the safe direction —
   but under `REQ-SESSION-054` it now indicates a fault rather than a routine condition, and
   `REQ-SESSION-048` requires the refusal to say so.
2. Pid recycling can make a dead session report alive until the recycling process exits
   (`REQ-SESSION-054`); accepted, documented, and it must not be "fixed" in a way that breaks
   `REQ-SESSION-051`'s resolve-toward-alive rule.
3. A run-host crash (ADR-0002) leaves live-looking lock rows for every session it held. Each becomes stale
   and is repairable individually or all at once (`REQ-SESSION-063`); the repair announcement is how
   `REQ-MONITOR-283`'s "reported as such on the next start" is satisfied without a separate mechanism. This
   is the case the lock exists for and it is unchanged by SR-1.
4. **Consequence 4 of the superseded version is withdrawn and must not be cited.** It read: "Where ADR-0058
   has opened the store read-only — a workspace on a network share or in a cloud-sync folder — no session
   can be run at all." That was true and it was fatal, and it is the observation ESC-15 acted on. Under
   `REQ-SESSION-198` the store is never on such storage, so the case does not arise. **What survives is the
   sentence that made it fatal: acquiring a lock is a write to the store.** That is the single clearest
   statement of why the store had to become machine-local, and it belongs in this record because this is
   where the write happens.
5. The reap transaction holds the store's write lock across one liveness probe. That is an inspection-only
   call of microseconds, but it is an operating-system call inside a database transaction and it is the only
   one in the product; it must stay the only one.
6. Everything main and the workspace service need from a session — the integration precondition, the stale
   list, the session browser — is a **read**, and reads need no lock (`REQ-EVENTS-098`) and, under
   write-ahead logging, never block the writer. `REQ-EVENTS-098` states that as a conformance property of
   the store, so this is not merely convenient.
7. **The product now has two lock media and must keep exactly one liveness predicate.** That is a standing
   invariant rather than a one-time task, and it is the most likely thing a later sweep would erase by
   "unifying" the two locks. `REQ-GIT-128` records why they are not unified; this record records what would
   break.
8. `REQ-GIT-020` names an acquisition contender the sessions domain does not — the brief overlap of an
   in-place update hand-over (`REQ-STARTUP-121`) — and the row's primary-key insert refuses it identically.
   No separate mechanism is needed, but ADR-0054's hand-over must not assume the outgoing instance has
   released its locks before the incoming one claims them.

## Revisit if

A supported platform is found where the runtime's null-signal probe is not inspection-only (take alternative
B). Or a requirement appears for reclaiming a lock held by a different machine, which `REQ-SESSION-183`
currently forbids. Or ADR-0058's *Revisit if* splits the workspace store in two, in which case this ADR must
say which of the two holds the lock table — and the answer is the one holding the sessions, so that the lock
and the record it guards never live in different files. Or a requirement connects `REQ-STARTUP-166`'s
sync-client detection to `REQ-GIT-128`, in which case the integration lock gains a stated behaviour on
storage where exclusive create does not mean what it says.
