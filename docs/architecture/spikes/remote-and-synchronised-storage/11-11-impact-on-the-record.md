# Spike — the store and exclusive-create locking on remote and synchronised storage — 11. Impact on the record

Part 11 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 11. Impact on the record

Reported here rather than edited in, per the brief. A second workflow holds
`docs/architecture/adr/`, `README.md`, `constraints.md` and `open-questions.md`; none were touched.

### ADR-0058 — the workspace store

1. **The Context paragraph and alternative J's rebuttal both state a mechanism that measurement
   contradicts.** "Write-ahead logging requires shared memory and is unsupported on network filesystems,
   so the store there opens read-only" is wrong in its second clause and configuration-dependent in its
   first. The **decision does not change** — ESC-15 is supported, and more strongly — but the record
   should say what actually happens: the store opens read-write, may report WAL enabled, and then either
   works, or throws at an arbitrary later statement, or loses committed rows silently. Recommended
   replacement claim, all of it measured: *on a UNC path WAL succeeded here; on a mapped network drive
   letter it reported success and then threw a disk I/O error on every open; and where one database file
   is reached through two path spellings, two writers each reported full success while up to 95 % of
   their committed rows vanished with a clean `integrity_check`.* That is a stronger case for
   machine-local than the one currently written down, and it does not rest on a claim a reader can
   falsify in ten minutes with a UNC path.
2. **Decision point 3's read-back is necessary but not sufficient, and the record currently implies it
   is sufficient.** Add the measured counter-example. The reliable probe is a **write** — a trivial one,
   inside a transaction that rolls back, immediately after the pragma — not a pragma read. This matters
   even under machine-local storage, because decision point 3 says a WAL failure "is therefore treated as
   a fault — the store is reported unopenable with the engine's own reason", and the engine will not give
   its reason until something touches a page.
3. **`SQLITE_IOERR_IN_PAGE` on the first statement after a successful open needs an owner.** It is not
   `REQ-EVENTS-084` (the store opened) and not obviously `REQ-EVENTS-088` (no run has started). ADR-0058
   should say which, and should say that the first-statement probe result is what `REQ-SESSION-089`
   reports. Left undrawn, the natural implementation swallows it and retries — which works, and which is
   exactly the silent-degradation `REQ-EVENTS-084` exists to forbid.
4. **The store's path must resolve to one canonical spelling, and the ADR should say so.** Section 4.5
   is a same-machine hazard: the run host and the workspace service reaching one store by two different
   spellings would silently destroy each other's writes. ADR-0058 already makes the workspace service
   "the only process that resolves an identifier" and hand the **resolved store path** to the run host,
   which prevents this — but it prevents it by accident, not by stated intent. One sentence naming the
   reason turns a happy consequence into a guarantee.
5. **`locking_mode = EXCLUSIVE` must be refused explicitly.** It is the obvious fix for a network path,
   it is documented, and it worked here on both local and UNC paths with no shared memory at all. It is
   incompatible with ADR-0058's two-writer process table, and `wal.html` §9 says other connections then
   get `SQLITE_BUSY`. Recording the refusal is cheaper than re-deriving it later.
6. **The recovery section gains a measured fact.** A naive copy of a live store is unopenable 625 times
   in 627, and `VACUUM INTO` produced 8 valid snapshots in 8 at a median 1,077 ms per 41 MB while
   108,525 commits landed. That is the mechanism `REQ-SESSION-201`'s "valid while runs are live" needs,
   and it now has a number.

### ADR-0004 — the atomic document primitive

7. **The retry ladder is a normal-path requirement on shared storage, not a rare-contention defence.**
   6.2 % of rename-over-existing calls failed `EPERM` on SMB **with no other opener present at all**.
   The existing ladder absorbed every one of them, 29 of 30 on the second attempt. ADR-0004 and the
   `windows-writer-handle-compaction` record both derive the ladder from a local-NTFS reader-contention
   argument; the SMB failure has a different cause and a much higher rate, and an implementer who reads
   the ladder as belt-and-braces may drop it.
8. **Atomic writes cost about 6× more on a share** (p50 12.06 ms vs 2.07 ms; p95 26.50 ms vs 2.53 ms).
   The user's own material stays on the share under `REQ-SESSION-198`, so this is the cost of every
   configuration document write for such a user, and it is not currently anywhere in the record.
9. **Directory `fsync` returns `EPERM` on Windows on every spelling, local included.** If ADR-0004's
   durability step assumes it, that assumption is unavailable on the primary platform.

### ADR-0005 — the session lock / ESC-21

10. **ESC-21's ruling stands, and its first premise is now measured**: exclusive create is a genuine
    primitive over SMB, 2,500 / 2,500. Its second premise remains unmeasured and I did not fake it.
11. **On strength — refusal versus warning, which is what ESC-21 asked this spike to decide: this spike
    cannot decide it, and says so.** The deciding measurement is two machines on one synced folder. What
    the spike *can* contribute is that the failure, if it occurs, is **undetectable after the fact by the
    lock itself**: `started_at` cannot order two machines when the orderable step is ~1 ms and a real
    machine's clock offset is ~855 ms, `pid` is meaningless across machines, and `host` distinguishes
    without ranking. So a warning-only design would leave the user with two integrations into one base
    branch and no artefact that says which came first. That is an argument for refusal, and it is
    reasoning from a measurement rather than a measurement.
12. **The detection ESC-21's ruling composes with is real, precise and cheap**, verified against a live
    third-party provider at every depth with a correct negative above the root, at p50 0.10–1.83 ms. Its
    blind spot — clients that register no Cloud Filter sync root — should be stated wherever the
    refusal is specified, because a refusal that silently does not fire is worse than none.

### `REQ-GIT-124` ordering — confirmed by measurement

13. `REQ-GIT-124` already evaluates the replicated-storage condition **ahead of** the lock check,
    "because that is exactly the condition under which the lock the next check reads does not mean what
    it says". Sections 5 and 6 confirm both halves independently: the lock means exactly what it says
    over SMB, and there is no information in it that could rescue the synchronised case. The ordering is
    correct and the stated reason is the right one.

### Open question this spike opens

14. **Where does a first-statement store failure after a successful open belong?** Between
    `REQ-EVENTS-084` (opening) and `REQ-EVENTS-088` (a write failing during a run) there is a gap, and
    the mapped-drive result lands in it 30 times out of 30. Worth an entry in `open-questions.md`; I did
    not add one, per the brief.

---
