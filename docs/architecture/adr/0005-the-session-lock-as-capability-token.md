# ADR-0005 — The session lock as the single capability token, and the one lock that is not a row

- **Status:** proposed
- **Date:** 2026-09-01
- **Supersedes:** its own earlier decision that **both** locks live in one table keyed by `(kind, key)`,
  recorded under this number on 2026-08-31. `REQ-GIT-128` as amended keeps the workspace integration lock a
  **file**, deliberately. The earlier argument is preserved below as alternative **G**.
- **Revised:** 2026-09-02, to carry **ESC-21**. `REQ-GIT-128` and `REQ-GIT-124` have since been amended and
  they now decide what this record previously described as an unconnected hazard; the paragraph that said
  "no requirement currently connects the two" is **withdrawn and must not be cited**.
- **Revised again:** 2026-09-02. **Consequence 11's lock-row correction has been run, with its
  counterfactual, and is confirmed.** The consequence now states what was measured instead of predicting
  what would happen, and its subjunctive is retired. Nothing else in this record changes and no decision in
  it moves.
- **Evidence:** `../spikes/backup-restore-mechanism.md` (2026-09-02), for consequence 11. Every figure it
  contributes below is a measurement; none is estimated.
- **Authority:** `owner-decisions.md` SR-1, SR-4, **ESC-15**, **ESC-21**; the amended `REQ-SESSION-046`,
  `REQ-GIT-020`, `REQ-GIT-124` and `REQ-GIT-128`, which have settled what this ADR previously had to decide
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
   "unifying" the two locks. `REQ-GIT-128` records why they are not unified; *Why the two locks are not
   unified* above records the five grounds and what would break, and it is the section to read before
   proposing the merge.

8. **One of the two lock media can be silently non-exclusive, and the product's answer is to refuse
   rather than to detect the failure afterwards.** Under ESC-21 an integration on a workspace inside a
   file-synchronisation agent's tree is refused before the lock is created. Two costs are accepted with
   it. A user whose project genuinely lives in such a folder cannot integrate worktrees there at all,
   with "hold the workspace on this machine's own storage" as the stated remedy — which is a real
   capability lost to a storage choice the product cannot make safe. And the refusal is only as good as
   `REQ-STARTUP-166`'s classification: an agent the product does not recognise classifies as unknown,
   which is a silent negative by ruling, so the integration proceeds under a lock that does not lock.
   **That residual is not closed by anything in this record and must not be presented as if it were.**
   It is the strongest argument for the classification being maintained as clients change, and it is why
   the refusal is worth having even though it is incomplete: it removes the recognised cases, and the
   recognised cases are the common ones.

9. **The session lock is never on storage where exclusive semantics are doubtful, and that is a second,
   independent dividend of ESC-15.** `REQ-SESSION-198` puts the store on machine-local storage always, so
   the primary-key insert this record relies on always runs against a local file. The hazard ESC-21
   describes reaches exactly one lock in the product. Before ESC-15 it would have reached both.
10. `REQ-GIT-020` names an acquisition contender the sessions domain does not — the brief overlap of an
    in-place update hand-over (`REQ-STARTUP-121`) — and the row's primary-key insert refuses it
    identically. No separate mechanism is needed, but ADR-0054's hand-over must not assume the outgoing
    instance has released its locks before the incoming one claims them.

11. **A restore of `REQ-SESSION-201` brings lock rows with it, and one of them is poisonous.** The restore
    is refused while any session in the *target* store is live, so no lock is ever taken from under a
    running run (ADR-0058). What arrives is the **artifact's** lock rows as they stood when the backup was
    taken, and `REQ-SESSION-201` requires the backup to be valid while runs are live — so an artifact
    routinely carries locks for sessions that were mid-run. Restored on the machine that took the backup,
    those rows name this `host`, their pids probe dead, and the ordinary reap and repair settle them with
    no new concept. Restored on a different machine they name a foreign `host`, which `REQ-SESSION-056`
    resolves toward live and `REQ-SESSION-047` never reaps, so every session that was running at backup
    time arrives permanently unreachable and needs `REQ-SESSION-183`'s explicit, per-session,
    user-confirmed release — turning a recovery into a chore proportional to how busy the machine was
    when it died. *(That sentence stood in the conditional until 2026-09-02. It is now indicative, because
    the case has been run: see the measurement below.)*

    **The correction is one line and it belongs to the lock rules, so it is stated here:** a restore
    **drops lock rows whose `host` is not this machine**, and keeps the ones that name it. Restoring a
    store makes it this machine's store (`REQ-SESSION-198`), and a claim that a process on some other
    machine is running one of its sessions cannot be true of it. The dropped rows cost nothing and lose
    nothing: the session's `execution_status` still asserts a run, so with no lock the session is
    **stale** by `REQ-SESSION-057` and the ordinary explicit repair of `REQ-SESSION-060` settles it to
    `interrupted` — which is exactly what happened to it. Rows naming this machine are kept because they
    carry the pid `REQ-SESSION-059` wants a stale report to name. ADR-0058 owns where this sits in the
    restore sequence and requires the pre-restore summary to say how many sessions will arrive needing
    repair, so the correction is disclosed rather than silent.

    **Confirmed by measurement, 2026-09-02, against its own counterfactual**
    (`../spikes/backup-restore-mechanism.md`). A backup was taken with two sessions mid-run —
    `execution_status = running`, lock rows held — and restored into a world where those rows named a
    different machine. **With the correction applied:** both foreign-host rows dropped, both sessions
    arrived `running` with no lock, `live=false`, `stale=true`, and the ordinary explicit repair settled
    both to `interrupted`. **With the correction disabled against the same world:** both arrived holding a
    lock naming `DEAD-LAPTOP-7`, `live=true`, `stale=false`, **not repairable**, reachable only one at a
    time through `REQ-SESSION-183`. Terminal sessions were untouched either way, and rows naming this
    machine were kept and probed dead, so `REQ-SESSION-059` still had the pid to name. **The rule was
    written for a case nobody had run; the case has now been run, and both halves of it behave as the rule
    says.** That is worth stating rather than assuming: three defects were found in the same restore
    mechanism on the same measurement pass (ADR-0058, consequence 17), so this rule's survival is evidence
    and not a formality — it is the part of that mechanism that was reasoned correctly, and the reasoning
    that produced it is the reasoning to imitate.

    **What this rule does not cover, stated so the confirmation is not over-read.** It drops foreign-host
    rows on the way **in**, from the artifact. It says nothing about a foreign-host row already sitting in
    the **target** store — and measured, one such row makes that target permanently unrestorable, because
    `REQ-SESSION-056` resolves it toward live, `REQ-SESSION-047` never reaps it, and the restore is refused
    while anything in the target is live. A machine rename produces that condition for every lock row at
    once, which `REQ-SESSION-054` calls "a state that should not arise". Nothing here closes that, and the
    remedy — if the owner wants one — is a rule about the *target*, belonging with the ordinary reap and
    with `REQ-SESSION-183`, not an extension of this one.

## Revisit if

A supported platform is found where the runtime's null-signal probe is not inspection-only (take alternative
B). Or a requirement appears for reclaiming a lock held by a different machine, which `REQ-SESSION-183`
currently forbids. Or ADR-0058's *Revisit if* splits the workspace store in two, in which case this ADR must
say which of the two holds the lock table — and the answer is the one holding the sessions, so that the lock
and the record it guards never live in different files. Or the synchronised-storage spike finds that a
warning a user may proceed past is sufficient strength for ESC-21, in which case the refusal of
`REQ-GIT-128` becomes a confirmation and consequence 8's first cost is given back — the ordering, the
three-valued classification and the never-create-the-lock rule are unaffected either way. Or
`REQ-STARTUP-166`'s classification is found to misreport a common synchronisation client in either
direction: a false *replicated* refuses integrations that were safe, and a false *unknown* is consequence
8's residual, and only the second is silent.

**Discharged, 2026-09-02.** This record previously carried: *"Or a requirement connects `REQ-STARTUP-166`'s
sync-client detection to `REQ-GIT-128`, in which case the integration lock gains a stated behaviour on
storage where exclusive create does not mean what it says."* That has happened. `REQ-GIT-128` and
`REQ-GIT-124` as amended connect them, fix the refusal, fix its position in the ordered refusal list, and
forbid domain 06 making the determination a second time. The clause is retired rather than deleted, so a
reader can see that the record raised the gap before the specification closed it.

## First execution — 2026-09-03, the lock released by a run that ends

*Recorded under GD-10.*

**Built and run:** a run's teardown releases the lock row inside the one durable transaction that also
records `session.end` and `result` and the terminal status (ADR-0008's first-execution note of the same
date states the reading of `REQ-SESSION-094` against `REQ-EVENTS-098` this rests on). On every path the
tests and the application reached — completed, interrupted by a stop, failed on a model error, stopped at
the iteration limit, ended by shutdown — the lock row was gone when the commit was visible. A force exit
still leaves a live-looking row for the next start to reap; that path is unchanged and unbuilt.

**Found: nothing in this record.**

## First execution — 2026-09-03, the foreign-lock report (IC-4, half 1)

*Recorded under GD-10; the report is `../spikes/machine-identifier-rename.md`.*

The restore's assessment lists lock rows naming another machine **together**, separately from rows this
machine can prove live; the confirmation names how many and which, states the risk (a run there may be
writing now and the restore replaces what it writes), and proceeding clears nothing one at a time.
Consequence 11's drop of foreign rows from the artifact ran on every restore. The rename half of IC-4 is
prepared as a two-phase harness the owner runs around a real rename and reboot.

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

## First execution — 2026-09-06, the explicit repair on demand (Part U)

*Recorded under GD-10.*

**Built and run:** `REQ-SESSION-060`'s repair is ONE unit, `Sessions.repairOne` (`packages/engine/src/sessions.ts`),
shared by the session browser's Repair and Repair-all-stale (`REQ-SESSION-182`, the `session.repair` command → the run
host) and by `REQ-GIT-094`'s open-time repair in `checkpointListing`, which now calls it instead of carrying its own
copy. The unit re-checks liveness through the one predicate, reads the state (unreadable → nothing to do,
`REQ-SESSION-041`), requires an active status, writes `interrupted` through the writer's terminal-status path (the
stronger durability setting), files the `session.interrupted_recovered` timeline entry (REQ-SESSION-062's fixed shape, corrected under OQ-46), and the writer releases the lock
last. Per session repaired it reports the id, the stuck status, `interrupted` and the reason, which names which of
`REQ-SESSION-059`'s two conditions applied — "no process holds a lock for it", or "the lock names this machine and its
process (pid N) is gone" — plus the one this process produces itself, "this application holds its lock but runs nothing
for it"; nothing stale is an explicit sentence, never an empty answer. In the proof (`pnpm sessions-proof`) a run left
mid-flight by the application's exit read back `running` behind a dead lock; the browser marked it stale; Repair repaired
it naming the pid, the lock row was gone and the entry filed; Repair all stale over two planted stale sessions and one
whose lock named a child process this script held repaired exactly the two and left the live one; a second press
answered "Nothing was stale".

**Found — defect 40 (the fortieth by Part U's numbering; the manager reconciles).** The listing carried a *second*
liveness predicate beside `liveness()`: `lock present && (foreign host || pid <= 0 || probe alive)`. The two disagreed on
one case — a lock this process holds with no run behind it, which the listing called live (its own pid probes alive) and
`liveness()` called not live — so the browser showed a crash-resumed session as sound while the checkpoint listing
repaired it. `REQ-SESSION-171` forbids two verdicts for one pid at one moment and this record's "one predicate, four
call sites" names a second implementation a defect. The listing now consumes `liveness()`; the falsified predicate is
kept beside its replacement in `Sessions.list`; `session-actions.test.ts` drives the case through a real resume.

**Reading taken where this record and `REQ-SESSION-060` pull apart.** The requirement's order is status, then the lock's
release, then the timeline entry. The entry is written *before* the release here, as `checkpointListing` already did,
because the lock is the capability that authorises writing the session's rows (the decision above: "the run host … must
not write a session's rows without holding its lock"); what the requirement's ordering exists to forbid — the release
preceding the status — holds. The alternative, an entry written after the release, would be a row written without the
lock, which this record forbids outright.

## First execution — 2026-09-29, the lock a continue takes back

*Recorded under R-067; the repair of `../../defects/fixed/a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md`
and `../../defects/fixed/a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`.*

**Built and run:** "the lock is still the capability … the run host must not write a session's rows without holding its
lock" now holds for every run in a process, not only its first. A continue — by message (`Sessions.prompt`), the
Continue action and the message-limit resolution (`continueSession`), a plan decision (`planDecision`) — claims the lock
before its first write (`holdForContinue`): kept when this process already holds it, taken through `claimLockReaping`
(REQ-SESSION-047's one reap, the claim `SessionWriter.open` makes) otherwise, and refused with `resume`'s REQ-SESSION-048
words and nothing written while another live process holds it (REQ-SESSION-083: "does not steal the holder's lock").
The run it launches holds the lock until its own teardown releases it; a continue that launches no run gives back what it
took. The claim is one function beside the at-rest cancel's (`claimHold`, which `lockForWrite` now calls). Pinned by
five tests in `session-resume.test.ts` (a second and a third run each hold the row; the Continue action, and its
`cancel` giving the lock back; a live local and a foreign holder refused with nothing written; a dead local holder
reaped; a loaded session's lock kept) and one in `run/plan-gate.test.ts` (a plan decision refused under a live holder
and holding the lock once free). In the built app, `part-j-proof`'s pause scenario now samples the store every 50 ms
from a worker thread while the app runs: the pause's teardown left no lock row, and every sample of the continued run
while active named this process's pid. On the code before the repair the same proof failed with the continued run
`running` and no lock row.

**Found: the claim this record made on 2026-09-05 was true of a process's first continue only** — corrected in place
above, with its measurement kept. Nothing in the decision moves.
