# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Decision

Part 3 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Decision

**Alternative B′, with alternative H for the exports.** One row per requirement carrying its delivery
state; history, audit, run and worktree-reference rows keyed to it; a tombstone table; all in the
workspace database SR-4 introduces. Behind the same two handle types as before. The two exports SR-9(a)
minted are projections over one shared export mechanism, and are reached only through the reader handle.

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

### The two exports SR-9(a) minted

`REQ-TRACE-514` and `REQ-LIBRARY-176` are one obligation applied twice, and the requirements say so
themselves. This record builds them as one mechanism with two projections, and the five commitments
below are the parts that are not obvious from reading either requirement alone.

**1. The export is composed with read access alone, and that is `REQ-TRACE-403`'s best witness.**
`REQ-TRACE-403` requires a component given only the ability to read requirement data to have "no route
by which to change a delivery state, write an audit record or start a run", with a guard test asserting
it. The export is exactly such a component and is the most natural one in the system: it reads
everything and writes nothing to the store. So it takes the **reader** handle and never the writer, and
the existing guard test gains its most convincing subject. This also discharges, structurally rather
than by care, the three prohibitions `REQ-TRACE-514` attaches — exporting writes nothing to the store,
persists or alters no delivery state (`REQ-TRACE-399`), relocates no card and records no verification
(`REQ-TRACE-410`) — and `REQ-LIBRARY-176`'s matching set: it creates, restores and repairs no version
and alters no current artifact.

**2. The redaction boundary is a property of the query, not of a review.** ESC-20 drew the line on
safety: a record gains an export when it carries no unredacted user or tool content. `REQ-LIBRARY-176`
turns that into a shape constraint — the export must not resolve `source_session_id`,
`source_artifact_id` or `source_task_id` into the material they name. The mechanical form is that
**the export's reader handle offers no route to session evidence at all**: the projection is built from
the delivery and improvement tables and reaches no join to `REQ-SESSION-136`'s tool-call evidence,
because the value it is composed with cannot express one. An id in the output is a string. Following it
would require a capability nothing hands the export, which is the same device the capability split
already uses and costs nothing extra to apply here. That is what stops alternative G's failure mode from
re-entering through a later widening.

**3. "How many were dropped" needs a counter, and the transaction is why.** Both requirements demand
that a pruned history state that it is pruned *and how many* — `REQ-TRACE-514` for
`REQ-CONFIG-192`'s 200-entry limit, `REQ-LIBRARY-176` for `REQ-LIBRARY-052`'s 25-version retention. This
is the one place the storage decision makes an export obligation *harder* rather than easier, and it is
easy to miss. Under A′ the pruned entries were removed from a document whose remaining entries carried
their own numbering, so a gap was visible. Under B′ the prune is a `DELETE` in the same transaction as
the write, and afterwards **the rows are simply not there**: nothing in the surviving set says how many
went. So the store must carry, per requirement, a **monotonic count of transitions ever recorded**,
incremented in the same transaction that appends the history entry and prunes. The dropped count is that
counter minus the retained row count. Writing it in the same transaction is not fastidiousness: a
counter maintained outside the transaction can disagree with the rows it counts, and an export that
misstates how much is missing is worse than one that admits it does not know.

  `REQ-SESSION-133` shows the specification reaching the same conclusion from the session side, where it
  is stated rather than derived — "Where a cap has dropped entries the record MUST retain enough to say
  that it has, because counts taken over what remains describe what is stored rather than what the run
  produced". The delivery and improvement sides state the obligation on the *export* and leave the
  obligation on the *store* to be inferred. It is inferred here so that it is designed for.

**4. An uninterpretable record exports because the body is opaque, and the two requirements were built
to fit each other.** `REQ-TRACE-514` requires a record the running build cannot interpret to be
"exported as it stands and identified as uninterpretable together with the version it carries". That is
satisfiable only because of commitment 2 of the forward-tolerance section above: the record body is one
opaque serialised value on the row, decoded only once its `schema_version` is supported. The export
writes that value through untouched and labels it. A design that had spread the record across typed
columns could not have exported an unsupported record at all, because it could not have stored one — the
same failure, one step earlier. `REQ-LIBRARY-176` has the analogous case in `REQ-LIBRARY-053`'s
unreadable recorded version, which is reported as skipped rather than dropped without trace.

**5. Destination, emptiness and the not-a-channel rule are the shared mechanism's, not each
projection's.** The destination is a file the user chooses through the platform's save dialog, with no
implicit destination and nothing written until one is chosen — `REQ-SESSION-189`'s rule, adopted here
because `REQ-TRACE-514` and `REQ-LIBRARY-176` both say "a file the user chooses" and neither restates
the dialog discipline. Where a store holds no record of a kind, the export produces an **empty record of
that kind rather than nothing at all**, so absence is distinguishable from failure; both requirements
state this and it is the shared mechanism that must implement it, since a per-kind implementation is
where the empty case gets forgotten. And the export **is not a channel**: a user-initiated action
producing a file at the moment it is asked for, never refreshing itself, with no surface built on
repeating it. Architecturally that means the export has no timer, no subscription and no place in the
view-update path of ADR-0010 — it is invoked, it produces, it ends. A failure is stated, naming what
failed, in `REQ-TRACE-512`'s terms for the delivery side and per `REQ-LIBRARY-173` for the improvement
side, with nothing written.

### The improvement store's export, and the part of that store this record does not take

`REQ-LIBRARY-176` is built here because ESC-20 minted the two exports together, they discharge one
guarantee, and splitting them across two records would produce alternative F by accident. **This record
takes the export and nothing else.** The improvement store's write path — `REQ-LIBRARY-042`'s indivisible
read-modify-write, `REQ-LIBRARY-043`'s atomicity observable, `REQ-LIBRARY-047`'s all-or-nothing save and
`REQ-LIBRARY-049`'s version recording — has no owning ADR, which is OQ-45, and this record is not the
right home for it: the two stores share an export obligation and share nothing else.

One consequence of that split has to be stated rather than left in the gap, because it lands on the
export. **`REQ-LIBRARY-047` makes recording a version best-effort and explicitly outside the artifact
write's all-or-nothing boundary**: "when the artifact is stored but its version cannot be, the save MUST
still report success, the change the user asked for MUST still take effect, and the failure MUST appear
only in the application log." So a version can be missing from the history because it was **never
recorded**, and not because `REQ-LIBRARY-052` pruned it. `REQ-LIBRARY-176` gives the export one sentence
to say — that retention has dropped versions, and how many — and that sentence is **false, or at least
incomplete, in a workspace where a version write failed.** The two causes are not distinguishable to a
reader of the export, and they mean different things: pruning is the product working as specified, a
failed version write is data the user was told about only in a log.

This record does not resolve it, because the resolution belongs to whoever takes OQ-45 and is a choice
between two real options — bring the version write inside the transaction, which `REQ-LIBRARY-047`
currently forbids and which would make a failed version undo the review decision it recorded, or keep it
outside and have the export distinguish the two causes, which needs the store to count versions
*allocated* as well as versions *retained*. What this record does is name the second option's storage
obligation now, because it is the same counter commitment 3 already requires and would cost nothing if
taken at the same time. Flagged for OQ-45 rather than decided.

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
