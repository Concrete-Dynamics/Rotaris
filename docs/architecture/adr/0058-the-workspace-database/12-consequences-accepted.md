# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Consequences accepted

Part 12 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Consequences accepted

1. **A native module returns**, with an Electron-ABI rebuild per version and architecture and asar
   unpacking. ADR-0054 and ADR-0056 already carry that obligation for `node-pty`; this widens it rather than
   creating it.
2. **Two writer processes share one write lock. Now measured, and the price is smaller than the rule that
   bounds it.** Contention is real, bounded by rules 4 and 5, and it is the price of SR-4's
   one-per-workspace scope. A **compliant** heavy reader in the other process — reading all ~13,000
   transcript rows back to back, 147–1,603 ms per pass — roughly doubles the writer's median commit and
   triples its p95 (163.6 → 345.9 µs p50, 271.7 → 898.9 µs p95), with **zero errors, zero `SQLITE_BUSY`
   and no blocking**, and the absolute figure stays under a millisecond. That is contention this design
   absorbs. A **non-compliant** one — a write transaction held across the read — produces the 205.4 ms
   commit in rule 5 and, held back to back, starves the writer indefinitely. So alternative G's two-store
   split is **not triggered**: the measured cost of sharing is sub-millisecond, and the failure mode that
   would justify the split is a rule violation rather than a property of sharing. G stays available for the
   case the *Revisit if* names — a workspace-service write pattern that genuinely needs long transactions.
3. **The superseded record's consequence 3 is withdrawn.** "A workspace on a network share or in a
   cloud-sync folder is degraded, not merely slow" is **no longer true and must not be cited**:
   `REQ-SESSION-198` requires such a workspace to be fully usable, and it is, because the store is not there.
   What replaces it is smaller and different: the user is *warned* about shared or synchronised storage by
   `REQ-STARTUP-166`, and the warning is about their own files and about a second machine working in the
   same folder — not about this store.
4. **A machine-local store is not in the user's backup of their workspace** (SR-9(b)). This is the largest
   new user-visible property in this record, and the specification has since closed the two holes the
   previous version listed as owed. **Its statement that "the requirement SR-9(b) minted for that
   disclosure is not in the specification" is withdrawn and must not be cited**: `REQ-SESSION-200` exists,
   fixes what must be named as outside a workspace backup and what is carried, requires both remedies to be
   named, requires it to be reachable in the ordinary course of managing sessions (`REQ-SESSION-182`), and
   forbids it being delivered only inside a failure message. Its statement that the exports "become the
   only user-controlled durable copy" is withdrawn too: `REQ-SESSION-201` is that copy. What is left as a
   consequence is the plain fact — the store does not travel with the workspace — and the obligation that
   the recovery ladder still assumes no copy exists, because taking a backup is not mandatory.
5. **Storage the product owns accumulates outside the workspace, and only the user may reclaim it.** A
   deleted project leaves a store nothing points at. Automatic reclamation is refused for the reason above,
   so an inspect-and-delete surface is owed, and it **still** does not exist in the specification (OQ-48).
   ESC-19 has made it more owed, not less: a restore displaces the store it replaces rather than deleting
   it, and the corruption ladder does the same, so the two operations most likely to be used by a user in
   trouble both produce leftovers only this surface can clear. **ESC-26 adds a third producer and a third
   shape** — a confirmed identifier establishment leaves the old identifier's store intact and merely
   unreferenced — so the surface is now the only route back to a store a user may well want, rather than
   only the only route to clearing one they do not.

   > **Corrected 2026-09-03. This consequence is the one that tracks leftovers and it had stopped tracking
   > them.** It named three producers and three shapes while the mechanism above produces **five**, and it
   > was not updated when the corrected reversal added one. The full set, each stated with whether anything
   > deletes it:
   >
   > | Shape | Produced by | Deleted by |
   > |---|---|---|
   > | `<identifier>.displaced-<stamp>` | a restore, displacing the store it replaces | nothing — kept on purpose |
   > | `<identifier>.displaced-<stamp>` | the corruption ladder | nothing — kept on purpose |
   > | the old identifier's whole store | ESC-26's confirmed establishment | nothing — kept on purpose, and it is the undo |
   > | `<identifier>.restoring-<n>` | **every** restore, staging the artifact | **since 2026-10-14 ([OQ-265](../../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-265), ruled 2026-10-13 under R-072): deleted by the restore on every failure that leaves the store as it was; kept and reported after a failed reversal; left by a killed process ([OQ-266](../../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-266)); cleared by the next restore's step 6.** *Until then: nothing, and nothing knows it exists.* |
   > | `<identifier>.obstruction-<stamp>` | the R1/R2 reversal, displacing whatever occupied the target | ***nothing, and nothing knows it exists*** |
   > | `<identifier>.restore-pending` *(added 2026-10-14, [OQ-266](../../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-266))* | every restore that reaches step 8, its journal, a file of a few dozen bytes | step 9, the in-process reversal, or the next open (`recoverCutRestore`); kept after a failed R2 until the next open retries the rename |
   >
   > **The last two are defect D5 and it is open.** The staging copy was left behind in every measured
   > failure of spike 22 — 30 of 30 on the literal reading, 30 of 30 with a file manager holding the store
   > directory, 30 of 30 at second-granularity collision, and the timeout case — and the layout block above
   > calls it "transient" while no step deletes it. It is the size of the store. The obstruction aside was
   > added by the correction and IC-1 observed **both** leftovers beside the target on every reversal run.
   > The first three are kept deliberately and are the reclamation surface's business; the last two are not
   > kept deliberately by anybody, which is the difference this table exists to show.
   >
   > *2026-10-14: the staging copy's half of D5 is repaired ([OQ-265](../../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-265)); the paragraph above is
   > kept as what was measured. A copy is now kept only after a reversal that failed, where it sits beside the displaced store
   > the error names, or where its delete failed, which the failure's error names in one sentence; the obstruction aside's row
   > stands as it was, deferred with OQ-48.*
6. **The backup is O(store), and it now has one number rather than none.** `VACUUM INTO` copies the whole
   store and pins the write-ahead log for the duration. Measured against a 41 MB store with 108,525 commits
   landing during the run, it produced **8 valid snapshots out of 8** at a **median 1,077 ms** each (min
   403 ms, max 2,107 ms) on a local NVMe volume, monotonic and integrity-clean — which settles the
   *correctness* half of `REQ-SESSION-201`'s hardest clause. **The scale half is still open**: the action
   is required to work while runs are live, ESC-9 leaves retention unbounded, and the field has a filed
   issue about session logs reaching 700 MB to 2 GB. At the measured rate a store two orders of magnitude
   larger is a copy of tens of seconds, which is where progress reporting starts to matter — so the
   question is now "at what size", not "is it seconds or minutes". The write-ahead-log growth during the
   copy is still unmeasured and is the input the mid-copy checkpoint question turns on.
7. **A restore stops the store for both processes while the application keeps running**, and its directory
   swap is two renames rather than one. The observable in the gap is an absent store directory, which
   `REQ-SESSION-043` already makes an ordinary state — so the failure mode is an empty session list, not a
   corrupt store. Accepted deliberately in preference to inventing an atomicity no platform provides.
   **Measured 2026-09-02 and true as claimed**: 20 of 20 observations that caught the gap saw the store
   directory absent and never anything mixed, and the gap is 3 to 5 ms whatever the store weighs. It was
   also measured to be *not* the worst observable, and that is the part this consequence must not be read
   as covering on its own: a failed reversal left a store directory present and empty, durably, in 20 of 20
   occupied-name failures. That state is now excluded by the reversal's displace step rather than by luck,
   and the exclusion is a correctness property of the reversal and not a nicety of it. *(2026-10-14: a process cut in
   the gap is the case the 20 observations did not cover — the absence then lasts until the next open, which now
   reverses it from the restore's journal, [OQ-266](../../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-266); and a store directory present and
   empty, whatever reaches it, is refused at the open rather than created over, REQ-SESSION-202 and W-31.)*
8. **Restoring on a machine other than the one that took the backup changes which sessions need repair.**
   Foreign-host lock rows are dropped on the way in (ADR-0005), so every session that was live when the
   backup was taken arrives stale and needs the ordinary explicit repair. That is a correct outcome, it is
   disclosed before the restore, and it means a restore is routinely followed by a repair-all — which
   `REQ-SESSION-182` already offers and which needs no new affordance.
9. **A second workspace presenting an already-open identifier opens without a store.** New behaviour,
   expressible in `REQ-SESSION-089`'s existing vocabulary but not itself stated by any requirement
   (OQ-47). ADR-0002 has since settled the part of OQ-47 that was an inter-record disagreement — the
   workspace service is keyed by resolved path, this store by identifier, and the two key different
   objects — but this behaviour is still architecture-invented on a specification silence *(ratified 2026-10-06,
   [R-071](../../../product/requests.md#r-071), as OQ-47's ruling: a second open workspace presenting one
   identifier opens without a store)*.
10. **`REQ-SESSION-089`'s graceful degradation is gone by ruling, and the amended requirement says so.** The
    event store, the session state and the lock are one object; there is no partial failure left. The
    previous version listed this as an amendment owed; it has landed, in `REQ-SESSION-089` and
    `REQ-EVENTS-084`, and they agree.
11. **A transaction removed a defect ESC-3 accepted, and the specification has absorbed it.**
    `REQ-LIBRARY-042` now requires the read-modify-write to "take effect as one indivisible step" and
    records its old concession as withdrawn "as unreachable, not as unimportant". ESC-18 ruled it; nothing
    here is outstanding.
12. **Indexes and query planning are ours to own.** `REQ-SESSION-042`'s listing — which now requires the
    cost to grow with the number of sessions "and with nothing else" — and `REQ-TRACE-239`'s 100 ms board
    budget are the two that must be measured against real indexes rather than assumed.
13. **Store paths are longer than workspace-relative ones.** A per-user data directory plus an identifier
    plus a session id plus an artifact name is a deep path on Windows; long-path handling is an obligation
    rather than an optimisation, and artifact body names are the part that varies without bound. The
    backup adds nothing to this — it writes to a destination the user chose — but the restore's staging
    and displaced directories add a suffix to the deepest path in the record, which is where a long-path
    limit would bite first.
    *2026-10-21, the identifier file on Windows (the Windows ARM64 session's E1): `establishWorkspaceId` minted and
    `readWorkspaceId` read it back at workspace roots of 198 to 328 characters, through Node's file API, past the
    engine's 251; the identifier is not where a long path bites.*
14. **Where a first-statement store failure belongs is decided by this record and by no requirement.** Rule
    3 puts the open, the pragma, the read-back and the write probe inside `REQ-EVENTS-084`'s "opening the
    store", and starts `REQ-EVENTS-088` only once the workspace service has declared the store open. The
    measurement that forces the question is real — 30 of 30 opens over a mapped drive threw on the first
    statement and then worked — and neither requirement covers it as written. This is architecture-invented
    on a specification silence, on the same footing as consequence 9, and it should be raised as one.
15. **A store reachable through two path spellings loses data silently, and rule 6 is the whole defence.**
    `REQ-EVENTS-098`'s non-blocking property is a conformance property of the store, and it was measured to
    hold on local storage and on same-spelling network storage (9,330 and 8,631 reader polls, zero reader
    errors, zero writer errors) and to **fail** where one file is reached two ways — 18,776 polls in which
    the reader never observed the writer's commits, 55 of 800 rows surviving, `integrity_check` clean.
    Nothing reports an error, so there is no failure to detect after the fact and no repair to offer. The
    only defence is not producing the condition, which is rule 6, and rule 6 is therefore a correctness
    rule and not a hygiene one. It also means **`integrity_check` is not evidence of completeness** —
    anywhere this record or a later one reaches for it, it establishes that the store is not corrupt and
    says nothing about whether it is short.
16. **The chosen binding needs two implementation disciplines that are not optional.** Every prepared
    statement is retained for the life of the connection (a garbage-collected `Statement` aborted the
    process in 3 of 30 measured launches under Electron, in both the run-as-node and `utilityProcess`
    hosts), and result-less pragmas go through direct execution rather than the convenience accessor that
    creates a transient statement per call — which is both the abort's easiest trigger and, separately, the
    route by which `PRAGMA synchronous` silently fails to apply. Both belong in the thin data-access module
    alternative B exists to keep swappable, and both are the kind of thing that is rediscovered as an
    intermittent crash if it is not written down.
17. **Four mechanisms in the architecture record have now been built for the first time, and every one of
    them contained a defect that no amount of reading had caught. That is the number, and it belongs here.**
    *This consequence read "three" until 2026-09-03; the fourth is stated at the end of it.*
    ADR-0054's commit step, which renamed a prepared directory onto an existing one — a thing this platform
    does not do, so a damaged preparation was never repaired and one case launched to no window at all.
    ADR-0054's completeness check, which passed a preparation whose image was damaged, after which the
    launch produced nothing. And this record's restore, which could not complete at all, destroyed a live
    session through a gate evaluated too early, and reversed itself with the same call that had just failed.
    Each was found on first execution and none by review. Each is corrected in place, here or in the record
    that owns it.

    **And the fourth, which says most about the other three: the harness built to measure this record's
    corrected restore had three defects on its first run.** One of them would have reported a **pass while
    testing nothing it claimed to test** — the raced run took its lock on the wrong side of the first
    liveness evaluation, so the first caught it and the second, the one under test, never ran. A second was
    **defect D8 arriving uninvited**: the byte-identical check counted the `-wal` and `-shm` files any open
    connection creates. The third asserted byte-identity in the one experiment whose entire premise is that
    a live run keeps writing. **A harness is a mechanism**, decided on paper like the rest, and it was
    written by someone who had just finished writing up the other three. See
    `../spikes/corrected-restore-rerun.md` section 8.

    **What that licenses and what it does not.** Four of four is a sample of four and it is the only
    sample this project has, so it is the best available estimate of how much of what remains unmeasured is
    wrong, and the estimate is not small. It does not license measuring everything; that is not available.
    It settles two narrower things. First, **a mechanism this record describes and nobody has executed is
    not evidence that the mechanism works**, and must not be cited as though the writing were the testing —
    every one of these four read correctly to everyone who read it, including the readers who wrote it.
    Second, **when one of them is built and does not work, the defect and its measurement belong in the
    record in place**, rather than being repaired quietly in code, because the reason for a fix is the only
    thing that stops the next reader removing it. Every correction in the restore section above is written
    that way for that reason.

    **One instance is worth carrying by itself, because it is the same fact found twice.** ADR-0054's commit
    step and this record's reversal failed on one identical platform property — a directory cannot be
    renamed onto a name that already exists, not even an empty one — discovered independently, in two
    records, by two measurements, neither of which was looking for it. The displace-then-rename shape is now
    in both. A third mechanism in this product that renames a directory onto a name that might be occupied
    has the same defect and has simply not been run yet.
