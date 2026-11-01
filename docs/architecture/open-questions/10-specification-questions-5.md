# Open questions — Specification questions (5 of 27)

Part 10 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-48; OQ-45 – OQ-47, OQ-49 – OQ-52 archived in [the archive](../../archive/architecture/open-questions/10-specification-questions-5.md).

- OQ-45 — Decision closed, 2026-09-11: ADR-0061 owns the store; closed 2026-09-11; [archived](../../archive/architecture/open-questions/10-specification-questions-5.md#oq-45)
- OQ-46 — CLOSED as a policy decision, 2026-09-06; implemented 2026-09-13; closed 2026-09-06; [archived](../../archive/architecture/open-questions/10-specification-questions-5.md#oq-46)
- OQ-47 — Two concurrently open workspaces presenting one identifier. NOT closed by ESC-26, and ADR-0058 now says so explicitly (2026-09-02). Ruled …; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/10-specification-questions-5.md#oq-47)

**OQ-48 — Reclaiming a machine-local store whose workspace no longer exists. *MORE owed after ESC-26, and
the surface changes purpose (2026-09-02).*** *(ADR-0058; constraints W-17, W-22, W-24.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

***ESC-26 adds a third producer and a third shape of leftover.*** A confirmed identifier establishment
leaves the **old** identifier's store intact and merely unreferenced — that is one of the five conditions
the exception is bound by, and it is what makes a one-way-looking operation safe to confirm. So there are
now three sources of a store nothing points at: the corruption ladder displaces a damaged store and keeps
it (W-17), a restore displaces the store it replaces and keeps it (W-24), and a confirmed establishment
orphans the workspace's previous one. **The surface's purpose changes with it.** It was the route to
*clearing* a store a user does not want; it is now also **the only route back to a store a user may well
want**, because after a confirmed establishment the previous history is reachable by nothing else in the
product. That makes "offer the exports first" a stronger obligation rather than a courtesy, and it makes
the absence of the surface a larger gap than it was. `REQ-SESSION-166` deletes one session. ESC-15 moved every session's
record out of the workspace. **Nothing addresses a whole store that nothing points at** after the user
deletes the project, re-identifies it, or clones it fresh — a hole the ruling opened and the amendment
pass did not close.

**ADR-0058 decides it in three parts and refuses the appealing one.** The pre-migration copy is reclaimed
by the product at the next clean open. A store nothing references is reclaimed **only** by an explicit,
user-confirmed action from a surface listing this machine's stores with last-seen paths, size, session
count and last-open time, **offering the exports first**. **Automatic reclamation is refused**, and the
reason is the whole of it: the only signal available is that a last-seen path no longer resolves, and a
path fails to resolve when a drive is unmounted, when a share is down, and above all **when the folder
has been moved** — precisely the case the identifier exists to survive. Reclaiming on that signal would
delete a user's history to punish them for the operation the design supports.

**The surface that decision assumes does not exist**, in the specification or in any other ADR, and
`origin.txt` — which records last-seen paths for diagnostics and for exactly this listing — **must not**
be consulted to resolve a store, so it cannot quietly become an identity mechanism. Ratify the behaviour,
or state that an orphaned store is never reclaimed and the disk cost is accepted.

***Unchanged in substance and MORE owed, 2026-09-02.*** The surface still does not exist, and ESC-19 has
added a second and a third source of stores nothing points at: **a restore displaces the store it
replaces** and keeps it under a UTC-timestamped name rather than deleting it (constraint W-24), and the
corruption ladder displaces a damaged one (W-17). Both are deliberate and both are right — the user is
mid-recovery in each case and a deleted store is history that existed nowhere else. But it means **the
two operations a user in trouble is most likely to reach for are the two that produce leftovers only this
surface can clear**, and it is the one surface the record assumes and nothing owns.

***MEASURED 2026-09-02, and the count of leftover kinds went from three to FIVE while the consequence
that tracks them was not updated.*** `spikes/backup-restore-mechanism.md` ran the restore and left two
kinds of leftover nobody has named. **(4) The staging directory.** In every measured failure — 30 of 30 on
the record's literal reading, 30 of 30 with a file manager holding the store's own directory, 30 of 30 at
second-granularity stamp collision, and the timeout case — a **full copy of the artifact's store** was left
at `<identifier>.restoring-<n>`. ADR-0058's layout block calls it "transient" and **no step deletes it**. It
is the size of the store. **(5) The obstruction aside-name.** The corrected reversal is displace-then-rename
and its displace step renames an occupying `<identifier>` aside to `<identifier>.obstruction-<stamp>`, which
is kept and never deleted on the same reclamation argument as everything else here. **Neither is enumerated
in ADR-0058 consequence 5, which is the consequence that tracks them**, and both are inside this question's
surface rather than beside it. *The register's observation, which is the reason this is written here rather
than left to the ADR:* every mechanism this record has added that displaces something has added a leftover
kind, none has added a way to reclaim one, and the surface that would clear all five still exists nowhere.
**Whoever owns ADR-0058 consequence 5 should be told, and this question is now owed five shapes rather than
three.**

- OQ-49 — What makes two directory strings the same directory. RESOLVED 2026-09-02 by amendment; resolved 2026-09-02; [archived](../../archive/architecture/open-questions/10-specification-questions-5.md#oq-49)
- OQ-50 — Validation by discovery proves nothing against a public catalog; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/10-specification-questions-5.md#oq-50)
- OQ-51 — Does an UNSCOPED queued prompt still exist?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/10-specification-questions-5.md#oq-51)
- OQ-52 — May a delegated child ask the user a structured question?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/10-specification-questions-5.md#oq-52)
