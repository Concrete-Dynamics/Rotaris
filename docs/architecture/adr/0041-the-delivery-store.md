# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` SR-2 and SR-4
- **Origin:** DATA (ADR-DATA-07)
- **Depends on:** ADR-0003, ADR-0040

> **What moves and what does not.** Delivery state, history, the audit trail, run records, worktree
> references and tombstones become rows in the per-workspace database SR-4 introduces. **Requirement
> text does not** — `REQ-CONFIG-192` already forbids it from this store, and ADR-0040 keeps the
> documents in the project's repository. **Worktrees do not** — they are directories on disk
> (`REQ-GIT-140`), referenced by row. The **capability split between the reader and the writer stays**,
> because `REQ-TRACE-403` is a requirement about the composition rather than about the store.

## Context

`REQ-CONFIG-192` fixes four settings and one placement: `store_subpath` (string, default `requirements`)
names the directory beneath the workspace configuration directory holding delivery records, tombstones
and audit entries; a `schema_version` written into every record; a tombstone-retention flag keeping the
ids of requirements the sources have stopped declaring so a retained id is never issued again; an
audit-trail flag recording each state transition with the actor, the time and the stated reason; and a
history limit of 200 entries per requirement with older entries pruned. The store "holds operational
records only; requirement text is never written there". **It does not fix the file granularity** — and
under SR-4 the directory placement itself is superseded, which is the one amendment this record needs
(see below).

`REQ-CONFIG-192` also fixes **forward-tolerant version handling**, and this is the sharpest constraint
in the domain for a database: the reader supports exactly versions 1 through the configured value; a
record whose version is higher is reported as unsupported and **is not interpreted**; a record whose
value is below 1, absent or not an integer is reported as unreadable; **neither is rewritten, migrated
in place, or deleted**. Such a record is reported in exactly three places and nowhere else — on the
board with its delivery history shown as unavailable *for that reason* rather than hidden or empty, in
the session log, and as the return of any surface that reads delivery records. **A workspace holding an
unsupported record still opens and still runs.**

`REQ-TRACE-382`: a closed set of **fourteen** state-changing actions, "closed deliberately so that a
completeness sweep over the action set is possible". `REQ-TRACE-399`: "**no path anywhere in the
application shall persist a delivery state except by calling the engine's transition function**, and
**none shall install the terminal state while circumventing the completion conditions** — not via a
drop, not via a context menu, and not via a bulk operation. **A guard test shall assert that no module
writes the delivery store directly.**"

`REQ-TRACE-403`: "**reading and writing shall be separately grantable.** A component given only the
ability to read requirement data shall have no route by which to change a delivery state, write an audit
record or start a run, and a guard test shall assert that a component composed with read access alone
offers no state-changing operation at all." That is a **capability-object requirement, not a naming
convention**, and it is indifferent to what the capability is over.

`REQ-TRACE-405`: every state-changing action writes who performed it, when, which requirement, and
**that requirement's hash at that instant**; the record is interleaved in the requirement's history with
runs and verifications; an action taken by the scheduler or an agent is recorded as such and is
distinguishable from one taken by a person; and no state-changing action completes without leaving such
a record. `REQ-TRACE-402`: a requirement whose text has changed since the snapshot its run was taken
against shall not be recordable as delivered by any route, and "**where the application is assembled
with a delivery-state writer that does not make that comparison, it shall refuse to start** and shall
name the comparison that is missing". `REQ-TRACE-401`: an override requires a deliberate confirmed act
with a stated reason, is marked as an override, names who and on what grounds, and stays visible.

`REQ-CONFIG-198` fixes what counts as **a person**: an action arriving through an interactive surface in
direct answer to a prompt the product raised for that specific action, with that surface attached to a
window. An action from an agent, a hook, a scheduled or unattended run, or a replay of recorded events
is never a person, **whatever it claims about itself**. The audit record names the operating-system
account the interactive session ran under together with the surface the answer came from; the product
maintains no identity of its own and asks for none.

`REQ-TRACE-388`: at most one state-changing board action per requirement, a second refused with a stated
reason and writing nothing "rather than being queued behind the first or racing it" — and **no further
bound at all on how many actions may be in flight across different requirements, each being
independent**. No card ever comes to rest in a state the engine has not agreed to.

`REQ-TRACE-476`: restart rebuilds, out of what was persisted, the delivery state of every requirement,
its execution units, the runs that were queued or running, and the worktrees belonging to them; a run
whose process is no longer alive is detected and reported **interrupted with its work retained** — never
displayed as still running — with its worktree, branch and partial output kept; the queue resumes where
it stopped **without re-running completed units**, and **no requirement is silently reset**.
`REQ-TRACE-464`: a board-started run's session identifier is already stored on the run record while it
is still executing, and survives a restart; closing the application **cancels** the run rather than
leaving it orphaned.

`REQ-TRACE-239`: putting a board on screen once the engine has answered occupies the interface thread
for no more than **100 ms** at the minimum window size, and that figure does not grow with the size of
the store. `REQ-TRACE-300`: 100 populated columns supported on an open axis.

**On the no-locking citation this record used to carry.** The previous version cited `REQ-LIBRARY-042`
and `REQ-TRACE-502` jointly as imposing "no locking" on the delivery store. Neither does.
`REQ-LIBRARY-042` governs **improvement artifacts** at `<workspace>/.rotaris/improvement_artifacts/`;
`REQ-TRACE-502` governs the four artifacts **the toolchain writes**, and `REQ-TRACE-152` limits those to
the generated artifact, the three baselines and the retired-identifier log. The delivery store is
written by the application's transition function, not by the toolchain. **No requirement forbids the
delivery store a transaction**, and that is what makes alternative B' below available at all. The
correction matters in both directions: it opens a door here, and it means the accepted-loss rule of
ESC-3 stays with the store it actually belongs to (see consequence 6).

## Alternatives considered

**A — One document for the whole store.** One read to build a board, trivially consistent, cheapest to
write. Under a no-locking read-modify-write rule *every* transition rewrites the whole store, so two
concurrent transitions on two **different** requirements can lose one of them, contradicting
`REQ-TRACE-388`'s "each being independent". It also makes forward-tolerant versioning unworkable: an
unsupported version on one record must leave its neighbours readable, which a single document cannot do.

**A′ — One document per requirement, plus an append-only audit log.** *The previous decision, and its
argument was a real one:* it gave per-record version tolerance, it made two transitions on different
requirements genuinely independent without a lock, it was inspectable by anyone who opened the workspace
directory, and it needed no store engine at all. What it could not give is the thing the requirements
ask for most often. Two files change per transition **with no transaction between them**, so the
ordering had to be chosen by argument (OQ-26) and a crash between them left a state no requirement
describes. `REQ-CONFIG-192`'s history pruning to 200 entries is a rewrite of the whole document on every
transition. `REQ-TRACE-476`'s restart rebuild is a directory scan. And `REQ-TRACE-239`'s 100 ms board
budget at `REQ-TRACE-300`'s hundred-column scale is N document reads, which this record flagged as
needing measurement before implementation. ADR-0003's own *Revisit if* named this exact case: "a
delivery store growing past the point where a directory scan per board refresh meets `REQ-TRACE-239`'s
budget".

**C — One document per transition, an append-only log per requirement.** Concurrency-free and a natural
fit for the audit trail. It fails the history limit: `REQ-CONFIG-192` requires older history entries to
be **pruned**, which an append-only log cannot do without rewriting, at which point it is A′ with more
files. It also makes the restart rebuild a fold over every transition ever recorded.

**B′ — Rows in the per-workspace database, behind the same capability-split handle.** Chosen.

**D′ — Rows, plus a mirrored per-requirement document on disk for inspectability.** Preserves A′'s one
genuine advantage. Refused: two copies that can disagree is the objection ADR-0003 raised against a
database and the only form in which that objection is actually true. Nothing in the specification
requires a person to read a delivery record from disk — `REQ-CONFIG-192` requires it to be *reported* in
three named places, all of them surfaces — so the mirror would buy convenience at the price of a
consistency problem. If an export is ever wanted it is an **export command**, produced on request from
the rows, never a second write path.

## Decision

**Alternative B′.** One row per requirement carrying its delivery state; history, audit, run and
worktree-reference rows keyed to it; a tombstone table; all in the workspace database SR-4 introduces.
Behind the same two handle types as before.

### The capability split stays, and it earns its keep

`REQ-TRACE-403` requires that a component given read access have **no route** to change a delivery
state, write an audit record or start a run, and that a guard test assert it. That is satisfied by **two
distinct handle types** — a reader value carrying only query methods and a writer value carrying the
transition function — with the reader obtainable without the writer and **never derivable from it**. A
single service object with a naming convention does not satisfy a test that asserts the read-only
composition "offers no state-changing operation at all"; that test can only pass if the operations are
genuinely absent from the value.

The move to rows does not weaken this and in one respect strengthens it. Under A′ the store was a
directory path, and any module that learned the path could open it; the guard test for
`REQ-TRACE-399`'s "no module writes the delivery store directly" had to be a search for filesystem calls
against that directory. Under B′ **the database handle is held privately by the engine and appears in no
other module's constructor**, so writing the store directly requires acquiring a value nothing hands
out. The guard test becomes an assertion over the module graph rather than over string literals.

### The startup self-check is unchanged

`REQ-TRACE-402` requires the application to **refuse to start** when assembled with a writer that does
not make the hash comparison, naming the comparison that is missing. So the writer declares, **as data
the assembly can inspect**, that it performs the specification-hash comparison, and startup checks that
declaration and aborts with a named message if it is absent. This is a **self-check on the
composition**, not merely a requirement for correct behaviour. It pairs with the two guard tests above
as a small family of structural assertions this area owes, and none of the three is affected by where
the records live.

`REQ-CONFIG-198`'s definition of a person is what the audit record's actor field must carry, and it is
**determined at the boundary where the action enters the process, not asserted by the caller** — which
means the transition function's signature takes an attribution value that only the interactive boundary
can construct. Unchanged.

### Forward-tolerant records survive the move, and how is not obvious

`REQ-CONFIG-192`'s version rule is the requirement most likely to be broken by a careless port, because
the reflex when moving to a database is to spread a record across typed columns and to reach for a
migration framework. Both would break it. The rule is preserved by three commitments:

1. **The record's `schema_version` is the record's, not the table's.** It is a value carried by each
   row, written into every record produced, and read forward-tolerantly. The **table** schema is an
   implementation detail with no version the specification knows about; conflating the two is the
   mistake.
2. **The record body is one opaque serialised value on the row, decoded only once its
   `schema_version` is supported.** A strict column layout cannot represent a record written by a
   later build, because the later build's fields have no columns — so an unsupported record would be
   unstorable and therefore unreportable, when `REQ-CONFIG-192` requires it to sit there, uninterpreted
   and unmigrated, while its neighbours read normally. Keeping the body opaque means "not interpreted"
   is literally what happens. The columns that exist beside it are only the ones the store must query
   on: requirement id, delivery state, and the version itself where it is a usable integer.
3. **No migration mechanism, and no write on read.** `REQ-CONFIG-192` says such a record is neither
   rewritten, migrated in place, nor deleted. That forbids an ORM whose contract is to migrate, and it
   forbids opening the database in a mode that rewrites rows. It does **not** forbid the table schema
   evolving; it forbids the *records* being touched.

A record whose version is below 1, absent or not an integer is **unreadable** rather than unsupported —
a different report, and reachable in a database exactly as in a file, because the column is read as it
was stored rather than coerced. Both conditions are reported in `REQ-CONFIG-192`'s three places and
nowhere else, and **the workspace still opens and still runs**: the query that builds a board returns
the offending rows with their history marked unavailable *for that reason*, rather than failing.

### One transaction, and what it settles

A transition writes the delivery state, appends the history entry, prunes history beyond
`REQ-CONFIG-192`'s limit, and appends the audit record **in one transaction**. Three consequences:

- **OQ-26 is dissolved.** It asked which of the state write and the audit append comes first, because
  there was no transaction between them and a crash between them left an undescribed state. There is
  now no "between them". Neither the state-first argument nor `REQ-TRACE-133`'s tombstone-before-
  artifact counter-example applies to a store that commits both together. (`REQ-TRACE-133` itself is
  untouched: it orders a *file* write against a *file* write in ADR-0040's store and stays as it is.)
- **History pruning is a `DELETE`, not a rewrite.** `REQ-CONFIG-192`'s 200-entry limit stops being the
  reason every transition rewrites a whole document.
- **`REQ-TRACE-405`'s "no state-changing action completes without leaving such a record" becomes true
  by construction** rather than by the ordering argument that used to carry it.

**`REQ-TRACE-388` is unaffected, and the distinction is worth stating** because it is easy to get
wrong: the requirement bounds how many actions may be **in flight** per requirement (one) and refuses to
bound them **across** requirements. A transaction does not admit or refuse an action; it orders commits.
Two actions on two different requirements are both accepted, both proceed, and both succeed; that their
commits are serialised for the microseconds each takes is not a bound on concurrency and produces no
refusal. The per-requirement single-flight remains an **admission** check in the engine, refusing the
second with a stated reason and writing nothing — it is not delegated to the store.

**Ordering guarantees are still ours to state.** A transaction gives them more cheaply; it does not
excuse stating them. There is one writer of this store — the engine's transition function, reached
through the writer handle and from nowhere else (`REQ-TRACE-399`) — and its writes are applied in the
order the actions were admitted. That is the same single-writer discipline `REQ-EVENTS-098` states for
the event journal, applied here, and it is what makes a requirement's history a sequence rather than a
set.

**Persist before publish.** A board card must never come to rest in a state the engine has not agreed to
(`REQ-TRACE-388`). The durable anchor for publishing a transition's outcome is the **transaction
commit**: the optimistic in-flight rendering is permitted while the action is in flight, and the settled
result is published only after the commit. This is ADR-0010's rule with its anchor changed from a
flushed journal append to a commit; it is neither broadened nor narrowed here, and its carve-out for
`REQ-MONITOR-219`'s 50 ms intra-row growth ticks — which have no event of their own, because
`REQ-EVENTS-052` gives a row exactly two events and none for any state in between — is untouched and
belongs to ADR-0010.

### Restart, under SR-2

`REQ-TRACE-476`'s rebuild is a query rather than a directory scan, and SR-2 makes its central judgement
unambiguous. "A run whose process is no longer alive" now has exactly one meaning: a run this
application's run host does not own. There is no third condition in which a run is alive somewhere we
cannot see, so a run record found without a live owner is **stale, not foreign**: the reap path settles
it, and it is then reported **interrupted with its work retained** — never as still running. Its
worktree, its branch and its partial output stay on disk untouched (`REQ-GIT-140`, `REQ-GIT-142`); only
the row's status changes. The queue resumes where it stopped, completed units are not re-run, and no
requirement is silently reset.

Whatever replaces the session lock must still settle a session whose owner is gone and must still carry
`REQ-SESSION-183`'s pid and host vocabulary; this record depends on that settling and does not own it.
`REQ-TRACE-464`'s session identifier is written onto the run record **in the same transaction that
records the run as started**, so the window in which the board can open the session opens with the run
rather than after it.

### What SR-4 dissolves here

- **OQ-27, file granularity.** It asked whether a delivery record is one file per requirement, one per
  transition, or one for the store, and noted the choice "is observable to anyone who opens the
  workspace directory". Nothing is observable there now, and the question has no subject.
- **OQ-26**, as above.
- **Consequence 1 of the previous version** — N document reads per board build, "to be measured before
  implementation begins". A board is one query. `REQ-TRACE-239`'s 100 ms budget is now bounded by what
  is on screen (`REQ-TRACE-358`) rather than by the store size, which is what the requirement asks for.
- **The atomic-replace machinery on this path**: staging, `fsync`, rename, the read-side empty-read
  guard, and ADR-0004 rule 3 with constraint D-28.

## Consequences accepted

1. **The delivery store is no longer inspectable with a text editor.** Under A′ a user could open a
   requirement's record. No requirement asked for that — `REQ-CONFIG-192` requires reporting on
   surfaces, not on disk — but it was a real property and its loss is recorded rather than glossed. The
   replacement, if one is ever wanted, is an **export** produced on request from the rows, on the same
   footing as `REQ-EVENTS-166`'s history export: a read path that yields a plain document, never a
   second write path. (`REQ-EVENTS-166` itself is about the event history and is honoured by ADR-0009's
   export, not here.)
2. **`REQ-CONFIG-192`'s `store_subpath` becomes vestigial** and the requirement needs amending. It names
   a directory beneath the workspace configuration directory that holds delivery records, tombstones and
   audit entries; those are rows. The directory does not disappear — `REQ-GIT-140` places requirement
   unit worktrees under `<workspace>/.rotaris/requirements/worktrees/` — so the key may survive with a
   narrower meaning or be withdrawn. **This record does not decide it**; it is reported as a needed
   amendment.
3. **The blast radius is one workspace, and what it holds is operational rather than substantive.**
   SR-4 concentrates the crash domain, and that must be stated rather than assumed. The specific
   containment here is `REQ-CONFIG-192`'s own rule that this store holds operational records only and
   never requirement text: losing the workspace database loses delivery history and audit trail, not a
   single requirement, not a line of the user's code, and not a worktree. The requirement documents are
   in the project's version control (ADR-0040) and the worktrees are on disk. That is not a reason to be
   careless with backups; it is the reason the store was allowed to move.
4. **The audit trail is now inside the same durability domain as the state it audits.** Under A′ they
   were separate files and could survive each other. That is a real change and it is the price of the
   transaction; it is accepted because a surviving audit line for a transition that never happened, and
   a surviving state with no audit line, were both states no requirement described.
5. **Three structural assertions this area owes are unchanged in obligation and cheaper in
   implementation**: the read-only composition offers no state-changing operation (`REQ-TRACE-403`), no
   module writes the store directly (`REQ-TRACE-399`), and the assembly refuses to start without the
   hash comparison (`REQ-TRACE-402`).
6. **ESC-3's accepted loss is not this store's rule and must not be deleted with it.** The previous
   version of this ADR carried "losing one of two genuinely interleaved decisions is an accepted outcome
   and must not be improved on with a lock", citing ESC-3. That rule belongs to `REQ-LIBRARY-042`, the
   **improvement artifact store**, where ESC-3 ruled it stands as specified. It never applied to
   delivery records, which no requirement forbids a transaction. **No ADR currently owns the improvement
   store** — ADR-0003 and ADR-0004 discuss it but neither is about it — so the rule presently has no
   home other than ESC-3 itself. Flagged rather than dropped.
7. Worktree references are rows; **worktrees are directories** and stay on disk with their branches and
   partial output (`REQ-GIT-140`, `REQ-GIT-142`, `REQ-TRACE-476`). Artifacts, attachments and images
   referenced from run records are on disk and referenced by row, never stored as blobs.

## Revisit if

`REQ-CONFIG-192` is amended in a direction that requires a delivery record to be a file a person or
another tool reads, which would reopen A′ under SR-4's own principle; or a measured failure to meet
`REQ-TRACE-239` at `REQ-TRACE-300`'s scale, which would now be a query-shape problem rather than a store
problem; or a requirement appears that the delivery store and the improvement store share a write path,
which would drag ESC-3's accepted loss across the boundary drawn in consequence 6.
