# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row — Decision

Part 5 of 15 of [ADR-0005](../0005-the-session-lock-as-capability-token.md), which indexes every part.

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
- **Its failure messages are fixed strings, unlike the session lock's** — whose wording `REQ-SESSION-048`
  leaves to the implementation while fixing its information content. The asymmetry is the specification's,
  not an inconsistency to iron out. `Could not acquire worktree integration lock.` for an unreapable lock
  is fixed once and is unambiguous. **The busy-lock string is not, and this record does not choose
  between the two spellings.** `REQ-GIT-128` fixes it as `Another worktree integration is already
  running.` and `REQ-GIT-124`, listing the same condition in its ordered refusal list, fixes it as `A
  worktree integration is already running.` Both are literal strings in requirements that are meant to
  agree. Picking one here would make the record read as though the question were settled; it is raised
  against the specification instead. The **third** refusal on this path — the replicated-storage refusal
  of `REQ-GIT-124` and `REQ-GIT-128` — has its wording left to the implementation with its content fixed,
  which is the session lock's shape rather than this lock's, and that is deliberate: it is a statement
  about the user's storage, not about a lock.

### Where the integration lock does not lock, and what the product does about it (ESC-21)

**The hazard, restated because it is the reason for everything below.** Exclusive create is a genuine
primitive on a true network filesystem, and `REQ-GIT-128`'s cross-machine guarantee holds there — two
machines mounting one share contend for one create and exactly one wins. It is **not** a primitive inside
a file-synchronisation agent's tree. Such an agent replicates a file after it has been created, so two
machines each create the lock locally, each succeed, each believe they hold it, and the conflict is
reconciled — as a duplicate, a rename, or a last-writer-wins overwrite, depending on the client — after
both integrations have already started merging into one base branch. The lock is not weakened there. It
is absent, while continuing to read as present.

**The previous version of this record said "no requirement currently connects the two". That sentence is
now false and is withdrawn.** `REQ-GIT-128` and `REQ-GIT-124` as amended connect them explicitly, and
they decide the behaviour rather than leaving it to the architecture. This record builds to what they
say.

**What they say.** `REQ-GIT-128`: *"The product SHALL NOT promise mutual exclusion it cannot enforce."*
Where the open workspace is classified as replicated by a file-synchronisation agent, an integration is
refused before anything is attempted **and the lock is not created at all**, as a pre-work refusal under
`REQ-GIT-157` leaving no lock, no worktree, no branch and no modified file. The classification is
`REQ-STARTUP-166`'s and domain 06 "states no storage test of its own". Only the *replicated*
classification refuses: storage another machine can reach directly does not, because exclusive create is
real there; a workspace that could not be classified does not; and one whose classification is not yet
determined does not, because "an inconclusive answer is a silent negative there, it stays one here".
`REQ-GIT-124` fixes the order — demo mode, then replicated storage, then the lock, then an active run —
and gives the reason the storage check must come first: it "is exactly the condition under which the lock
the next check reads does not mean what it says".

**Four things follow for the mechanism, and each of them is a way to get this wrong.**

1. **The classification is read, never made, and never waited for.** ADR-0002 places one determination
   per workspace open in the workspace service, which is the process the integration precondition already
   runs in. Reading it is a field read. It must not become an on-demand storage probe behind the user's
   gesture: `REQ-STARTUP-166` puts the determination in post-show background activation precisely so it
   never delays the interface, and a synchronous probe here would put filesystem I/O in front of
   `REQ-SHELL-150`'s 100 ms budget to answer a question the product has already asked.

2. **"Not yet determined" is a third value and must be representable.** Because the determination is
   asynchronous, a user can start an integration before it has answered. `REQ-GIT-128` rules that state a
   silent negative — it does not refuse — so the field is three-valued (*replicated*, *directly
   reachable*, *unknown-or-pending*) and only the first refuses. Collapsing pending into replicated would
   refuse integrations for the first seconds of every workspace open; collapsing it into a boolean
   "safe" loses the distinction `REQ-STARTUP-166` requires to be preserved. This is the one place a
   `null` in this record is load-bearing rather than sloppy.

3. **The refusal happens before the create, and that ordering is the safety property.** Creating the lock
   and then refusing would leave a lock file on synchronised storage. It would replicate, and the other
   machine would then meet a lock naming a host it must never reap (`REQ-GIT-128`) for an integration
   that never ran — converting a refusal into a permanent block requiring a manual file deletion. The
   sequence is: read classification, refuse or continue, **then** attempt exclusive create.

4. **The refusal is not the storage notice, and this record raises none.** `REQ-STARTUP-166` already
   warns about shared and synchronised storage on the persistent notice surface, and `REQ-GIT-128` says
   domain 06 "adds no notice of its own to the one `REQ-STARTUP-166` already raises". The integration
   refusal is a toast on the Git view (`REQ-GIT-124`) and it is about *this operation*, not about the
   workspace. Two surfaces, one determination, and the notice may be dismissed without affecting the
   refusal.

**What is still open, and it is a strength question and not a direction question.** `REQ-GIT-128` closes
with "the strength of this response is under review": whether a refusal is right, or whether a warning
the user may proceed past would suffice, is left to the synchronised-storage spike. That spike's results
are **not available to this record** — they were not among the four spikes in `../spikes/` when it was
written — so no number here rests on them. What the spike cannot reopen is the direction: the product
does not proceed under a lock that does not lock. If the answer turns out to be a proceed-anyway warning,
what changes is one refusal becoming a confirmation, and points 1 to 4 above are unaffected because they
are about how the condition is known and when, not about what is done with it.

### Why the two locks are not unified

This is the most likely thing a later sweep erases. It looks like duplication — two locks, two media, two
reap paths, one product — and the tidying is one commit. Five grounds, of which the fifth is decisive on
its own and is new under ESC-21.

1. **They protect things with different residencies.** The session lock protects rows in a store that is
   machine-local by ruling and by requirement (`REQ-SESSION-198`). The integration lock protects the base
   repository, which is the user's own material and travels with the workspace. A lock is only a lock
   where everything it excludes can see it.

2. **Their field sets are different, and both are cross-domain contracts with two owners.**
   `REQ-SESSION-046` fixes `pid`, `host`, `acquired_at`, and `REQ-GIT-020` binds the same three from the
   other side, forbidding either domain to change them alone. `REQ-GIT-128` fixes
   `{session_id, pid, host, started_at}` — four fields, a different timestamp name, and an owning session
   id the session lock has no use for. A unified record would have to be the union, and the union is a
   change to two requirements in two domains.

3. **`host` means opposite things.** On a session lock a foreign host is a **fault** —
   `REQ-SESSION-054` calls it "evidence that the store itself is reachable from more than one machine — a
   state that should not arise", and `REQ-SESSION-048` requires the refusal to say so. On the integration
   lock a foreign host is **the mechanism working as designed**: a second machine with the same checkout
   mounted is supposed to meet this lock and be refused. One column, two opposite readings, is not a
   column worth sharing.

4. **Their failure presentations are fixed differently by the specification.** `REQ-GIT-128` fixes two
   literal strings; `REQ-SESSION-048` fixes information content and leaves the wording to the
   implementation. The asymmetry is the specification's and is not an inconsistency to iron out.

5. **Unification is already refused in both directions, by rulings, for different reasons.** Moving the
   integration lock into the machine-local store is refused by ESC-15 and stated by `REQ-GIT-128`: it
   "would let two machines promote into one base branch at once". Moving the session lock out to a file
   beside the workspace is refused by ESC-15 from the other end — the store is machine-local so the lock
   that guards it must be, and `REQ-SESSION-046` in any case requires the lock to be "a record held in
   the same store as the session it locks". There is no third place. **A unification proposal is not a
   simplification of this record; it is a proposal to overturn ESC-15, and it should be presented as
   one.**

**What is actually shared, and is the thing to protect instead.** One liveness predicate. `REQ-SESSION-171`
and `REQ-GIT-093` both demand one verdict about one pid at one moment, and `REQ-GIT-128` says its reap rule
is "the same reasoning `REQ-GIT-020` gives for session locks". So the product has **one probe and one reap
rule over two media**, and the medium is the only difference. Anyone who wants less duplication should
verify that invariant rather than merge the locks — it is where a real defect would hide, and merging the
locks is not needed to have it, because the record already does.
