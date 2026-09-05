# ADR-0029 — Credentials stay individual protected files, with a platform protection adapter

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` SR-1 and SR-4
- **Origin:** MODEL (ADR-MODEL-04)
- **Depends on:** ADR-0002, ADR-0003, ADR-0004, ADR-0007
- **Requires a spike before the gate closes.**

## Context

SR-4 makes a database the store for session data the application alone reads. It also names the one
exception this ADR owns, and gives the reason in the ruling itself: **provider credentials are
individual protected files**, because `REQ-PROVIDER-016` requires `0600` plus an explicit Windows
access-control list, read back, "a filesystem guarantee a row cannot make". This record confirms that
placement, states why, and marks the boundary so a later implementer does not quietly migrate it.

`REQ-PROVIDER-014` and `REQ-PROVIDER-017`: one JSON file per provider at
`<per-user data dir>/tokens/<provider_id>.json`, five keys, two-space indentation, tolerant load for
three of them; the directory is **never inside a workspace or repository**. `REQ-CONFIG-011` confirms
credentials never appear in a configuration file. The per-user **data** directory is not the per-user
**configuration** directory of `REQ-CONFIG-001` — the snapshot and the credentials live in different
roots. `REQ-PROVIDER-019` makes enumeration "the sorted basenames of `*.json` files in the credential
directory" and an existence check "a pure file-existence test".

`REQ-PROVIDER-016`: protection is applied **explicitly on every platform and never inherited**. POSIX:
directory `0700`, files `0600`, no group or other bit ever set. Windows: no POSIX bits set and none
reported; an explicit access-control list granting full control to the owning user and to the system
account and to nobody else, **with inheritance from the parent disabled**. **If the protection cannot
be applied the credential is not written** and the failure names the store path. The same protection
covers the gateway staging directory (`REQ-PROVIDER-063`).

`REQ-PROVIDER-018`: writes are atomic — staged in a temp file inside the credential directory whose
name starts with the provider id and ends `.tmp`, mode `0600` on POSIX, renamed onto the target; a
failed write deletes the temp file and reports; and **once any credential operation has finished the
directory holds nothing but `<provider_id>.json` files**.

`REQ-PROVIDER-152` requires every read-modify-write over a credential file **or** over the discovery
snapshot to be performed while holding an exclusive lock on an adjacent lock file; acquisition failure
after 5 seconds fails the operation with a retryable message and the operation never proceeds without
the lock; a lock left by a dead process is reclaimed, a lock held by a live process is **never** broken;
**reads take no lock**. The requirement states its own premise in terms: those files "are per-user and
**may be reached by more than one application instance at once**". SR-1 withdraws that premise — see
the decision.

`REQ-PROVIDER-010` and `REQ-PROVIDER-059`: a credential-status query performs **no network I/O**, is a
function of the stored credential and the current clock alone, and returns one of `authenticated`,
`unauthenticated`, `expired` — `refreshing` is in the vocabulary but is never returned. Two queries at
the same clock reading must agree, which forbids any memoised, in-flight-derived or optimistic status.

`REQ-PROVIDER-035`: the key derived by token exchange lives in **process memory only**, is never
written to the store, the snapshot, a log, an event or any other file, and is re-derived on rejection
or process restart; a failed exchange fails that one model call and never invalidates the stored
credential.

`REQ-PROVIDER-061` and `REQ-PROVIDER-134`: bridge artifacts are rewritten as part of **every**
credential save and are on disk **before the save returns**, so an external consumer can never read an
older credential than the store holds; a failure to write one is a warning, never a failed save.

## Alternatives considered

**A — An OS keychain or credential manager, with the JSON file as a compatibility shim.** The
conventional answer and the strongest on pure security grounds: a keychain protects against another
process running as the same user, which file permissions do not.

*Against:* `REQ-PROVIDER-014` and `REQ-PROVIDER-017` make the file's path, key names and indentation
observable; `REQ-PROVIDER-019` makes enumeration a directory listing and existence a file test;
`REQ-PROVIDER-018` makes the directory's post-operation contents observable. A keychain plus a shim
would have to write the same file anyway, so it adds a second store and a synchronisation problem
without removing the first. **This alternative is unavailable, and saying so is the point: the
specification has already decided it.**

**B — Plain files, protection applied through a platform adapter, locking through an adjacent lock
file.** Chosen.

**C — As B, but Windows protection is best-effort and its failure is a warning rather than a
refusal.** Avoids the native-module-versus-command-line decision and matches what many desktop
applications do. *Against:* it contradicts `REQ-PROVIDER-016` in the most direct way available.
Downgrading a refusal to a warning is a **security decision that belongs to the product owner**, not to
this record.

**D — Credential rows in the workspace database (new under SR-4).** Assessed because SR-4 moves so much
else, and because a row would carry the lock semantics for free. It fails on two independent grounds,
either of which is sufficient:

1. **Protection.** `REQ-PROVIDER-016` requires protection applied per credential, explicitly, on every
   platform, with inheritance disabled, and — because "no group or other bit is ever set" is an
   observable — **read back to confirm it**. A row has no mode and no access-control list. The best a
   row can offer is the protection of the whole database file, which is one grant covering every record
   the database holds, is not per credential, is not read back per credential, and cannot report the
   credential store path when it fails. `REQ-PROVIDER-016`'s failure behaviour — *the credential is not
   written* — has no expression at row granularity.
2. **Scope.** SR-4's database is **one per workspace**. Credentials are per user and
   `REQ-PROVIDER-014` places them outside every workspace and repository. A per-workspace store cannot
   hold a per-user credential without either duplicating it per workspace or introducing a second,
   per-user database — and a per-user database that holds five keys per provider is a store with none
   of the properties SR-4's principle asks a database for: not high-volume, not queried, not
   transactional.

Both reasons are worth writing down rather than citing SR-4 alone, because the second one also decides
any future proposal to move something else per-user into a workspace database.

## Decision

**Alternative B, unchanged in mechanism and now explicitly confirmed against SR-4.** In the main
process (ADR-0030), through the write primitive of ADR-0004 with its own policy.

- **`protect(path, kind)` has two implementations.** POSIX: set the mode, **then verify by reading it
  back**, because "no group or other bit is ever set" is an observable and umask and filesystem
  behaviour vary. Windows: build an explicit discretionary access-control list granting the owning user
  and the system account, with inheritance disabled, and apply it to the directory and each file.
  Failure anywhere aborts the write **before the target is touched**.
- **Atomic write.** Create `<provider_id><random>.tmp` inside the credential directory, protect it,
  write, `fsync`, rename onto the target; on any failure unlink the temp file.
  `REQ-PROVIDER-018`'s "the directory holds nothing but `<provider_id>.json` files" is a post-condition
  worth asserting in tests, **including on the failure path**.
- **Status is computed, never cached.** One function of (stored credential, clock reading), with
  per-provider classification rules held in the registry of ADR-0028 rather than in a shared predicate,
  because `REQ-PROVIDER-024`, `REQ-PROVIDER-034`, `REQ-PROVIDER-045` and `REQ-PROVIDER-050` differ
  irreducibly. **Nothing about credential status is ever stored in the workspace database**, not as a
  cache and not as a denormalised copy; a row that answered a status query would break
  `REQ-PROVIDER-059`'s two-queries-at-one-clock-reading rule the first time it went stale.

**The Windows access-control mechanism must be chosen by spike before the gate closes.** Preference
order: (1) a maintained native binding, if one can be packaged and signed without complicating
ADR-0054's updater; (2) the platform's command-line tool invoked with security-identifier literals
rather than localised account names. Whichever wins, **the verification read-back is the part that
satisfies `REQ-PROVIDER-016`**, so it is not optional in either.

### What SR-1 changes, and what it does not

`REQ-PROVIDER-152`'s lock exists for a stated reason — more than one application instance reaching the
same per-user files — and SR-1 removes that reason. **The lock is nevertheless kept, and implemented as
specified**, for three reasons that survive the ruling:

1. **The requirement still says so.** The adjacent lock file is a stated observable. This record does
   not amend the specification; it reports the amendment as available (see below).
2. **A crashed owner is exactly what the reclaim rule is for.** SR-1 guarantees one *live* instance, not
   that the previous one exited cleanly. `REQ-PROVIDER-152`'s "a lock left behind by a process that is
   no longer running is reclaimed rather than blocking forever, and a lock held by a live process is
   never broken" is the same settle-a-dead-owner obligation the session lock carries, and it must not be
   deleted along with the multi-instance premise.
3. **The product still starts processes that are not the instance.** `REQ-UIBENCH-039`'s benchmark
   iteration processes are children of the product, and any future helper would be too. Under SR-1 the
   single-instance gate must let those through (ADR-0042 consequence 6); a store whose safety rested on
   "there is only ever one process" would be wrong the moment one does.

What SR-1 *does* remove is the lock's load-bearing role. Under one instance every credential
read-modify-write is issued from the main process, so the in-process ordering already serialises them
and the lock file is expected never to be contended. **It is therefore a belt over braces, not the
braces**, and its 5-second acquisition bound should never be observed in practice. That is worth
recording, because a future reader finding an uncontended lock may otherwise conclude it is dead code.

Staleness is decided by recording the holder's process id **and start time** in the lock file and
reclaiming only when that process is provably gone — `REQ-PROVIDER-152` forbids breaking a lock a live
process holds, so a time-based expiry alone is not sufficient. This is a **different** lock from the
session lock and it does not share that lock's reaping rule; this one waits up to 5 seconds.

### What SR-4 dissolves here, and what it does not

- **Dissolved:** the retry-ladder conflict of OQ-11 is no longer this store's problem, and never was.
  The two incompatible ladders belonged to `REQ-LIBRARY-043`'s improvement store and
  `REQ-SESSION-033`'s session state, and both of those stores move to the database under SR-4. **This
  store declares no ladder**, and the policy table must record that absence rather than borrow a
  neighbour's constants; `REQ-PROVIDER-152`'s 5-second lock bound is the only wait figure it has.
- **Dissolved:** ADR-0004 rule 3, the writer's-handle discipline for append-and-compact files. This
  store has no append-and-compact file. It never applied here and it applies nowhere now.
- **Not dissolved:** ADR-0004 **rule 1** — readers do not hold descriptors; every read is
  open-read-close within one call. Credential files remain files replaced by rename, and on Windows an
  ordinary open reader still blocks that rename. Rule 1 is what keeps `REQ-PROVIDER-018`'s atomicity
  reachable, and deleting it along with rule 3 would reintroduce a failure the spike already found.
- **Not dissolved:** the read-side guard of ADR-0004. `REQ-PROVIDER-017` requires a corrupt or
  key-missing file to be treated as no credential, which is a legitimate decode failure; the guard's
  retry must therefore distinguish "decode failed after a successful stat, possibly mid-replace" from
  "this file is genuinely corrupt", and this store's policy resolves that by retrying once and then
  taking `REQ-PROVIDER-017`'s tolerant path.

## Consequences accepted

1. Credentials are protected against **other users, not against other processes of the same user**.
   That is what the specification asks for; it is worth recording explicitly so nobody later believes
   otherwise. SR-4 does not change it: a database file would have had exactly the same property.
2. A lock file appears in the credential directory. `REQ-PROVIDER-018`'s "holds nothing but
   `<provider_id>.json` files" is stated about the *credential operation's temp files*, and
   `REQ-PROVIDER-152` requires an *adjacent* lock file; the two must be read together. **Flagged for
   confirmation (OQ-19)** — and note that OQ-19 now has a cheaper resolution than it had: if the
   specification withdraws the lock file with its multi-instance premise, the contradiction disappears
   rather than being adjudicated.
3. Every credential save also writes bridge artifacts before returning, so the save path is a composite
   operation whose partial failure is defined: the credential save still succeeds and the artifact
   failure is a warning. **This composite is not a transaction and must not be made one by moving it
   into the database** — the bridge artifacts exist to be read by an external consumer, which SR-4's
   principle places on disk by definition.
4. `REQ-PROVIDER-035`'s derived key is in-memory only, so a run host restart re-derives it. That must
   not be "optimised" by caching it anywhere, and under SR-4 "anywhere" now includes a row.
5. **This store is a named exception to SR-4 and must stay one.** The workspace database gains a
   credentials table by accident only if somebody stops reading this ADR; the guard is that no
   credential value has a row type anywhere in the schema, which is checkable by reading the schema.

## Revisit if

The Windows access-control spike shows no acceptable mechanism, which would make `REQ-PROVIDER-016`
unimplementable as written and would be an **escalation rather than a redesign**. Or `REQ-PROVIDER-016`
is relaxed to drop the per-file protection and the read-back, which is the only change that would make
alternative D assessable on its merits — and which would be a security decision for the product owner.

## First execution — 2026-09-05, the credential store and its spike (Part K)

*Recorded under GD-10. The thirteenth defect of ADR-0058 consequence 17's pattern, found by the spike this record
required before the store was written.*

**The spike** (`../spikes/credential-protection.md`, taken as the first act of building the store): alternative (2)
of the decision — `icacls` with security-identifier literals, the owner's SID read once from `whoami /user /fo csv`
— applies the required list and the SDDL read back through `icacls /save` is exact. **What the read-back caught:**
`/inheritance:r /grant:r` — the apply step as this record described it — leaves a **foreign explicit** access-control
entry in place, so a file that already carried one would have been reported protected with three trustees. The
sequence is therefore `/reset` (one call; it takes no companion option), then `/inheritance:r /grant:r`, then `/save`
and the parse. `/restore` with an exact SDDL is unavailable to the unelevated product (it needs the restore
privilege). About 120 ms per file, spent only on a save. **The read-back is the part that satisfies
REQ-PROVIDER-016, and the spike shows it is not a formality**: the first candidate passed every case in which the
file started clean and failed the one in which it did not, and only the read-back distinguished them. No native
binding is pinned; ADR-0054's updater and IC-6's load proof both argued against one.

**Built and run** (`packages/providers/src/credentials/`): `<data>/tokens/<provider_id>.json` — the reserved name
in `platform/dirs.ts` was `credentials`, which no requirement names, and is corrected beside its reason
(REQ-PROVIDER-014); the five keys, two-space indentation, the tolerant load with a warning naming the id and never
the contents (017); the staged `<id><random>.tmp` inside the directory, **protected before a byte is written**,
`fsync`, rename, unlinked on every failure (018) — the spike confirmed the protection travels with the rename; the
protection failure that writes nothing and names the store path (016); delete with its log line and the sorted
enumeration (019); status computed from the credential and the clock and cached nowhere (010/011/059); the
adjacent lock (152) as `<id>.lock` holding pid and start time, reclaimed only when the holder is provably gone by
the liveness probe, 5 s bound, and the retryable message never asserting a second instance. The directory's
post-condition is a test on the success and the failure path. Nineteen tests; the on-machine test plants a foreign
entry before a save and reads the result back independently of the store.

**Readings recorded.** (a) OQ-19: the contents rule of 018 is read as being about the operation's temp files; the
lock file is adjacent per 152 and inside the directory, and enumeration filters `*.json`. (b) SR-1 makes the lock
belt over braces, as the decision says; its bound was not observed. (c) A pid reused by an unrelated live process
reads as a live holder — the safe direction. (d) Windows only is measured; POSIX is `chmod` then `stat` and waits on
IC-3. (e) Consequence 5 holds: no credential value has a row type in the store's schema (v6).
