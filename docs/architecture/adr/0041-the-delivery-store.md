# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-02, under `owner-decisions.md` SR-2, SR-4, SR-6, SR-9(a), ESC-18 and ESC-20, and
  against the specification as amended — `REQ-TRACE-514` (new), `REQ-LIBRARY-176` (new),
  `REQ-CONFIG-192`, `REQ-LIBRARY-042`
- **Origin:** DATA (ADR-DATA-07)
- **Depends on:** ADR-0003, ADR-0040
- **Scope note:** this record now also owns the **export** of the improvement artifact store, and only
  the export. That store's write path remains unowned — OQ-45 — and this record does not take it.

> **What moves and what does not.** Delivery state, history, the audit trail, run records, worktree
> references and tombstones become rows in the per-workspace database SR-4 introduces. **Requirement
> text does not** — `REQ-CONFIG-192` already forbids it from this store, and ADR-0040 keeps the
> documents in the project's repository, which `REQ-TRACE-513` now states as a requirement. **Worktrees
> do not** — they are directories on disk (`REQ-GIT-140`), referenced by row. The **capability split
> between the reader and the writer stays**, because `REQ-TRACE-403` is a requirement about the
> composition rather than about the store.
>
> **What is new is that the records have to be able to leave.** When this record was written, the loss
> of a delivery record a user could open in a text editor was noted in a consequence and dismissed on
> the grounds that no requirement asked for it. SR-9(a) and ESC-20 reversed that, and the specification
> has since minted the two exports: `REQ-TRACE-514` for the delivery store and `REQ-LIBRARY-176` for the
> improvement store. Both are built to `REQ-SESSION-199`'s shape, deliberately and by the requirements'
> own instruction, rather than to a second one invented here.

## Context

`REQ-CONFIG-192` has been amended and now **states this record's own conclusion as a requirement**,
which changes what has to be argued here. It fixes four settings: a `schema_version` written into every
record; a tombstone-retention flag keeping the ids of requirements the sources have stopped declaring so
a retained id is never issued again; an audit-trail flag recording each state transition with the actor,
the time and the stated reason; and a history limit of 200 entries per requirement with older entries
pruned. The store "holds operational records only; requirement text is never written there".

Three things in the amendment bear directly on the decision below. **The store is placed by requirement
rather than by ruling**: "That store is not configuration and `REQ-CONFIG-477`'s boundary does not reach
it: only this application reads a delivery record, the records are high-volume, queried and
transactional". **The transaction is required rather than chosen**: the delivery state, the history, the
`history_limit` prune and the audit entry are written "**together, indivisibly**, so no failure can
leave a state recorded without its audit entry or an audit entry for a state that was never recorded" —
which is exactly what alternative B′ was selected to provide, and is now an obligation rather than a
benefit. And `store_subpath` **is withdrawn**, together with the directory it named; a file that still
states it is rejected as an unknown key under `requirements:` like any other (`REQ-CONFIG-183`, and see
ADR-0036's consequence 6, which is where that rejection is delivered). `REQ-CONFIG-192` no longer fixes
any file granularity because it no longer names a file: "no key of this domain names a directory, a file
or a document format for it".

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

**`REQ-TRACE-514` mints the delivery store's export**, and its terms are specific enough to constrain
the design rather than merely to authorise it. Every field of every record must reach a stock parser on
a machine carrying none of this product's code; the guarantee "is `REQ-EVENTS-166`'s and is not restated
in a second form here", applied "on the same terms `REQ-SESSION-199` applies it to the timeline, the
issues record, the metrics document and the permission audit". It runs against the open workspace's
repository root exactly as `REQ-TRACE-512` requires of the four toolchain operations, with neither a
root nor a store nominated by the user, and is available whether or not a run is in flight. It is
explicitly **not a fifth toolchain operation** — `REQ-TRACE-508` through `REQ-TRACE-511` "remain exactly
four, and this action performs none of their passes". What it carries is enumerated: the delivery state
from `REQ-TRACE-232`'s column vocabulary together with `REQ-TRACE-233`'s blocked condition and the
origin state a blocked requirement returns to; the delivered specification hash an acceptance stored
(`REQ-TRACE-387`, `REQ-TRACE-402`); the retained per-requirement history; each recorded transition with
the acting party, the time and the stated reason, an override additionally carrying that it was one and
the grounds given (`REQ-TRACE-401`); and the store's own retained retired ids — which the requirement is
at pains to distinguish from the toolchain's retired-identifier log, "which is already the user's and
needs no export". **The audit exports as an audit**: transitions in the order taken, none omitted, and
where retention has pruned earlier entries "the export SHALL state that it has and how many, so a pruned
history can never be mistaken for a complete one". A record the running build cannot interpret is
exported as it stands and identified as uninterpretable with the version it carries, "which is the same
answer `REQ-CONFIG-192` requires of every other surface that reads delivery records; an export that
silently omitted it would be the one place a user could not discover it existed."

**`REQ-LIBRARY-176` mints the improvement store's export** on the same terms and with one addition this
record has to build for. It must carry the artifact container's fields (`REQ-LIBRARY-011`), each
proposal's fields including its evidence entries in stored order (`REQ-LIBRARY-008`, `REQ-LIBRARY-010`),
and "**the recorded version history `REQ-LIBRARY-168` calls 'the audit trail the write path keeps'**" —
every retained version with its `version`, its `recorded_at`, its cause from `REQ-LIBRARY-050`'s closed
vocabulary, and the state that version holds. The same ordering clause applies: every retained version
in the order recorded, none omitted, and where `REQ-LIBRARY-052`'s retention has dropped intermediate
versions, a statement that it has and how many. A version that cannot be read is reported as skipped
rather than dropped without trace (`REQ-LIBRARY-053`). It is offered for a single artifact and for every
artifact of the workspace, from the detail of `REQ-LIBRARY-167` and the list of `REQ-LIBRARY-166`, and
is available whether or not any session is live.

**Both requirements draw ESC-20's boundary the same way, and it is a boundary on content rather than on
readership.** A record gains an export when it carries no unredacted user or tool content.
`REQ-LIBRARY-176` states the consequence as a prohibition on the export's *shape*: it must carry the
artifact exactly as stored, "adding nothing to it and reaching nothing it does not already hold", and in
particular must not resolve an evidence entry's `source_session_id`, `source_artifact_id` or
`source_task_id` into the material those ids name, "because a session's tool-call evidence deliberately
holds unredacted arguments and never gains an export of its own (`REQ-SESSION-136`). An export that
followed those ids would become the export that record is denied." `REQ-TRACE-514` says the same of the
delivery export: it "SHALL NOT be widened to carry the run material a delivery decision refers to."

**On the no-locking citation this record used to carry.** The previous version cited `REQ-LIBRARY-042`
and `REQ-TRACE-502` jointly as imposing "no locking" on the delivery store. Neither does.
`REQ-LIBRARY-042` governs **improvement artifacts**, which are held in a store the application keeps for
the workspace and whose organisation is expressly not contractual — "no path, no file, no document
format"; `REQ-TRACE-502` governs the four artifacts **the toolchain writes**, and `REQ-TRACE-152` limits
those to the generated artifact, the three baselines and the retired-identifier log, which
`REQ-TRACE-513` now fixes as files in the user's repository. The delivery store is written by the
application's transition function, not by the toolchain. **No requirement forbids the delivery store a
transaction**, and `REQ-CONFIG-192` now requires one. The correction still matters in both directions,
but its second half has been overtaken: see consequence 6, where ESC-18 and the amended
`REQ-LIBRARY-042` change the answer.

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
genuine advantage. **Still refused**, and now for a sharper reason than when it was first refused. The
old reason: two copies that can disagree is the objection ADR-0003 raised against a database and the
only form in which that objection is actually true, and nothing in the specification required a person
to read a delivery record from disk — `REQ-CONFIG-192` requires it to be *reported* in three named
places, all of them surfaces. That reason survives. What has changed is the closing clause, which said
"if an export is ever wanted it is an **export command**, produced on request from the rows, never a
second write path". **An export is now wanted, by requirement**, and D′ is what a careless reading of
`REQ-TRACE-514` would produce: a continuously-maintained readable copy. The requirements refuse that
directly — both exports are "a user-initiated action producing a file at the moment it is asked for",
neither "SHALL refresh itself", and "no surface SHALL be built on repeating it". A mirror is a refreshing
export, which is the one thing the export may not be. The conditional clause has become the decision,
and the decision is below.

### Alternatives for the exports themselves

**F — One export path per record kind, each written where its records live.** The path of least
resistance: the delivery export in the traceability engine, the improvement export beside the
improvement store, the four session exports in the session record. Refused. `REQ-TRACE-514` and
`REQ-LIBRARY-176` both say, in almost the same words, that the guarantee "is `REQ-EVENTS-166`'s and is
not restated in a second form here" and that they apply it "on the same terms `REQ-SESSION-199`" applies
it. Six independent implementations of one guarantee is six places for the ordering clause, the
empty-record clause and the not-a-channel clause to be got subtly differently, and the failure is
invisible — an export that quietly reorders is still a file that opens.

**G — A generic row dumper: one mechanism that serialises any table on request.** Attractive because it
is written once and covers records not yet invented. Refused, and the reason is the whole of ESC-20's
boundary. A generic dumper's default answer to a new table is *yes*, and `REQ-SESSION-136`'s tool-call
evidence — which "deliberately holds unredacted arguments and never gains an export" — is a row in the
same store. A mechanism whose safe operation depends on someone remembering to exclude a table is a
mechanism that will export that table. ESC-20 examined the field and found this is the live hazard, not
a theoretical one: Codex rollouts are documented as carrying "prompts, command output, file paths, code,
and accidental secrets", and opencode ships a `--sanitize` flag on its export for exactly this reason.

**H — One export mechanism, per-record-kind projections, each declared explicitly.** Chosen. One piece
of machinery owns the destination, the writing, the not-a-channel discipline and the stock-parser
guarantee; each exportable record kind supplies a projection that names its fields. There is no route by
which a table acquires an export by existing.

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

## Consequences accepted

1. **The delivery store is no longer inspectable with a text editor, and the export is the answer
   rather than a hypothetical one.** Under A′ a user could open a requirement's record. This record
   previously noted that no requirement asked for that — `REQ-CONFIG-192` requires reporting on
   surfaces, not on disk — and offered an export only "if one is ever wanted". **That judgement was
   wrong and has been overruled**, by SR-6's reasoning and then by SR-9(a) and ESC-20: moving records a
   user could previously read for themselves into rows is a straight reduction in what a user owns about
   their own project's delivery history, whether or not a requirement had noticed. The argument the old
   consequence rested on — that a property nobody wrote down is a property nobody is owed — is preserved
   here as the thing that turned out to be false. `REQ-TRACE-514` now requires the export, and the
   restored capability is **not** the old one: a user gets a file rendered for other software rather
   than a directory to browse. That is a better artifact for checking against and a worse one for
   idle inspection, and the trade is deliberate.
2. **`REQ-CONFIG-192`'s `store_subpath` is withdrawn, and the specification decided it rather than this
   record.** The previous version reported the key as vestigial, noted that the directory itself does not
   disappear because `REQ-GIT-140` places requirement-unit worktrees beneath it, and declined to choose
   between narrowing the key and withdrawing it. The amendment withdraws it outright and disposes of the
   worktree half separately: `REQ-CONFIG-194` records that `worktree_subpath` was never a key of this
   domain either, and `REQ-GIT-137` fixes where requirement-unit checkouts go without a configuration
   key naming it. The user-visible consequence is a hard load failure for a workspace still stating
   either key, which lands in ADR-0036 rather than here.
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
6. **ESC-3's accepted loss no longer exists to be homed, and the correction runs the opposite way from
   the one this record recorded.** The previous version said: the rule "losing one of two genuinely
   interleaved decisions is an accepted outcome and must not be improved on with a lock" belongs to
   `REQ-LIBRARY-042`, the improvement artifact store, "where ESC-3 ruled it stands as specified" — and
   flagged that no ADR owns that store, so the rule had no home. **The first half is now wrong.** ESC-18
   overtook ESC-3 on the ground that a store providing atomicity makes the interleaving unreachable, and
   `REQ-LIBRARY-042` has been amended to match: the read-modify-write "MUST take effect as one
   indivisible step, so no other mutation can be interleaved between its read and its write", decisions
   on different proposals "consequently both survive — always, not merely when the later writer's read
   happened to follow the earlier writer's write", and the requirement records its own concession as
   withdrawn "as unreachable, not as unimportant". Constraint C-10 has been re-derived on the same
   basis. There is no accepted loss left to carry, in either store.

   The distinction the old consequence was defending still holds and is still worth keeping: what
   `REQ-LIBRARY-042` governs is the **improvement artifact store** and nothing else, and it does not
   reach delivery records. What has changed is that the two stores now agree rather than differ, and for
   the same reason — a store that can make a write indivisible removes a defect that a document layout
   could only accept. **The second half stands**: no ADR owns the improvement store's write path, which
   is OQ-45. This record now owns its **export** and only that, and the live question OQ-45 inherits is
   `REQ-LIBRARY-047`'s best-effort version write, which the amendment did *not* touch and which the
   export section above shows now has an observable consequence it did not have before.
7. Worktree references are rows; **worktrees are directories** and stay on disk with their branches and
   partial output (`REQ-GIT-140`, `REQ-GIT-142`, `REQ-TRACE-476`). Artifacts, attachments and images
   referenced from run records are on disk and referenced by row, never stored as blobs.
8. **The store owes a counter it would not otherwise keep.** Commitment 3 adds a monotonic
   transitions-ever-recorded count per requirement, written in the transition transaction. It exists
   solely so an export can say how much history was pruned. That is a small, permanent cost paid on
   every transition for the benefit of an action most users will take rarely, and it is recorded as such
   rather than hidden inside the export: an implementer who finds it and cannot see who uses it will
   remove it, and the export will then quietly understate what is missing.
9. **The export is a second reader of the store and is not on any latency budget.** `REQ-TRACE-239`'s
   100 ms applies to putting a board on screen and is bounded by what is on screen (`REQ-TRACE-358`); an
   export reads everything and is bounded by nothing the specification states. It runs off the interface
   thread like the four operations of `REQ-TRACE-512`, and — because it is a user-initiated action
   producing a file — a slow export is a progress problem rather than a responsiveness one. What must
   not happen is an export holding a long read transaction that blocks transitions; that is a store
   concurrency question belonging to ADR-0058, named here so it is designed for rather than discovered.
10. **`REQ-SESSION-201`'s whole-store backup is a different artifact and this record must not be read as
    providing it.** The requirement is explicit: "an **export** is a record rendered so that software
    knowing nothing about this product can read it; a **backup** is the store rendered so that this
    product can put it back". The two exports here discharge readability and discharge nothing about
    durability. A user who exports every delivery record has not backed up their workspace store, and
    the disclosure of `REQ-SESSION-200` is what tells them so.

## Revisit if

`REQ-CONFIG-192` is amended in a direction that requires a delivery record to be a file a person or
another tool reads, which would reopen A′ — though `REQ-CONFIG-192`'s own amended text, which states the
records are "high-volume, queried and transactional" and written "together, indivisibly", now makes that
a large reversal rather than a small one.

A measured failure to meet `REQ-TRACE-239` at `REQ-TRACE-300`'s scale, which would be a query-shape
problem rather than a store problem. **No such measurement exists**: a second workflow is taking
store-side measurements as this is written and its results are not in hand, so the claim that a board is
one query inside 100 ms at a hundred populated columns is a design expectation and not a result. If it
is missed, the first thing to check is whether the board query and the export share a read path they
should not.

ESC-20's boundary is widened — a record carrying unredacted user or tool content is given an export —
which would invalidate commitment 2's premise that the export's handle need offer no route to session
evidence, and would make alternative G's failure mode reachable by design rather than by accident.

OQ-45 is decided in a way that brings `REQ-LIBRARY-047`'s version write inside the artifact write's
atomic boundary, which would remove the "never recorded versus pruned" ambiguity the export section
names and make part of that section unnecessary. Or a requirement appears that the delivery store and
the improvement store share a write path, which would collapse the boundary consequence 6 draws — no
longer to drag an accepted loss across it, since there is none left, but because the two stores' write
disciplines are stated separately and would have to be reconciled.

## First execution — 2026-09-09 (Part AK)

*Recorded under GD-10. One defect of ADR-0058 consequence 17's pattern, the forty-sixth; the ordinals continue
from the forty-fifth (ADR-0060, Part AH). Two readings corrected before the first commit are kept beside their
replacements. The exports of `REQ-TRACE-514` and `REQ-LIBRARY-176` are not in this part and were not executed.*

**Built and run:** store **v15** — `delivery` (the record's own `schema_version` uncoerced, the opaque `body`,
the two hashes, `return_to`, the `transitions_ever` counter of commitment 3), `delivery_history` (the 200-entry
prune as a `DELETE`), `delivery_audit` (append-only by trigger, one workspace-wide series), `delivery_runs`,
`delivery_worktrees`, `delivery_blockers`, `delivery_tombstones`; the DAL's one write unit `transition()` carrying
the state, the history entry, the prune, the counter, the run row a start writes with its session id
(`REQ-TRACE-464`), the blocker a hold raises and the answers a resume gives, **in one `BEGIN IMMEDIATE`
transaction**; the two handle types with the reader a closure over the DAL and the writer built from the reader
plus the transition function; the pure `decide` over the fourteen actions, the nine transitions, the fixed targets
and `REQ-TRACE-385`'s table, with reachability as the same function asked without writing; the single-flight
admission; the release gate and blocker chain over an injected dependency map; the restart reap; the projection as
one deep-frozen value; the pure display mapping in `ui-core`; the `requirements.*` command family, channel 10 and
the relay in main that stamps the actor. Eighty-six tests in nine files; `pnpm delivery-proof` twice, 5 390 ms
then 5 728 ms, printing its nine assertions each with a verdict — the plan's seven, the reap's "interrupted, work
retained", and the regression of defect (1) below — all green (`.delivery-proof/results.json`). The store's own
suite moved its two schema pins to v15 and narrowed its cascade premise: `delivery_runs.session_id` names a
session as a fact about the run and carries no foreign key, because a requirement's run history outlives the
session it names (`REQ-TRACE-405`, `REQ-TRACE-476`); `delivery.test.ts` proves the row survives the delete.

**Found (1) — the forty-sixth: reachability's refusal recursed into itself.** `REQ-TRACE-391` wants a refused
move to carry "the engine's own words unchanged, including its enumeration of what the source column can reach",
and this record's reading — reachability is `decide` asked without writing — was built literally: a refusal
enumerated the reachable targets by asking `decide` about each, and each of those refusals enumerated the
reachable targets in turn. The first refused probe overflowed the stack. The enumeration is now a probe
(`decide(…, { probe: true })`) whose refusals carry the reason and no enumeration, and `reachableFromSource` is
computed once per answer. The reading stands; what it omitted is that an answer which describes its
alternatives cannot be composed of answers that each describe theirs. No reading of the requirement or of this
record would have caught it; the first test did.

**Reading corrected (a) — the queue's two persisted controls are not a store table.** The first draft of v15
carried a `delivery_queue` table for `REQ-TRACE-480`'s `automatic` and `concurrency`, on the ground that the
delivery store already held the rows those controls schedule. `REQ-TRACE-480` names the **workspace
configuration** — `requirements.scheduling.*`, which `REQ-CONFIG-196` registers and which no part has registered
yet — and the plan's rule that no part adds configuration keys outside its row applies. The table was withdrawn
before the migration was committed; the settings live in memory in the service at the schema's defaults
(`manual`, 2) until Part AP registers the keys, and the schema comment says so. A stop is persisted nowhere, by
requirement.

**Reading corrected (b) — an epic owes no evidence.** The first projection made an approved epic owe
`verification` (approved, and a report present) and reported it `incomplete-traceability`. `REQ-TRACE-281` and
`REQ-TRACE-284` make an epic a grouping element whose state is derived from its children; it owes no evidence of
its own and its indicator is empty with the stated reason. Kept in `owedObligations`.

**Readings recorded, for the parts that follow.**

- *The requirement document format declares no dependency.* Spec 08's frontmatter has `epic` and `derived-from`
  and nothing else relational, so of `REQ-TRACE-274`'s twelve relation tokens the projection emits four
  (`parent`, `children`, `derived-from`, `derived-requirements`) and the other eight have no data source in this
  product. The release gate (`REQ-TRACE-455..462`) is therefore a pure function over a dependency map fed from
  recorded `dependency` blockers' `blocking_ids` — the one place a dependency can exist — and is empty until an
  engine analysis raises one. `superseded` health is in the closed set and unreachable from store data.
- *`Reachability.reachableFromSource` is typed over the delivery columns* and cannot name the blocked condition,
  which every column reaches by `hold`; the enumeration lists stages, as the seam types it.
- *The system's two moves are not board actions.* Nothing in the closed fourteen enters `running` or leaves it;
  `recordRunStarted` and `recordRunEnded` write history entries `run-started` / `run-ended` by the `system` actor,
  interleaved in the store as `REQ-TRACE-405` asks, and the detail's history lists the fourteen while `runs` lists
  those. A failed or interrupted run holds the requirement with a `run-failure` blocker returning to `ready`
  (`REQ-TRACE-407` lets a pass move a requirement into the blocked condition; `REQ-TRACE-463` fixes the return).
- *The reap's live set at workspace open is empty* under SR-2: nothing older than this instance's run host is
  owned. Part AP hands in the run host's actual live set when it re-runs the reap after a run-host exit.
- *`edit`, `create`, `accept-proposal` and `accept-change-work` are stated refusals* with the reason named
  (`REQ-TRACE-498` "the control explains why"); the first two are Part AP's source write, the last two wait on
  OQ-45. `keep-worktree` returns `historyEntry: 0` and writes nothing, as `REQ-TRACE-383` says it should.

**Not built here, stated:** the persistence of `REQ-TRACE-480`'s two controls (above); a run starting from a
release (`REQ-TRACE-387`'s second half, `464..475` — Part AP; the writer's `beforeCommit` is the slot it fills);
the offers of `409..416`, the source revisions of `278..280`, the graph of `322..333`; the queue's `start`, which
the seam's `requirements.queue.set` has no field for (raised in the handoff, additive for AP); the two exports.
`REQ-TRACE-239`'s 100 ms is not measured here — no board is drawn until Part AK′, and this record's "Revisit if"
still says no such measurement exists.

**What the merge must do:** replace `ENGINE_NOT_MERGED` in `apps/desktop/src/workspace-service/index.ts`'s
`requirements.command` case with Part AJ's factory; until then the board reports `source: none` with the cause in
`parseErrors`, and the tests fake the engine around `fixture-store.ts`.

## Second execution — 2026-09-09 (Part AP)

*Recorded under GD-10. Three defects — `AP-1`, `AP-2` and `AP-4` — and one reachability finding, `AP-3`; the manager
assigns the ordinals at merge. This branch does **not** take store v16 — `REQ-TRACE-472`'s granted permissions ride
the `delivery_runs.permissions` column v15 already writes, so nothing migrated.*

**Built and run:** the slot this record left for a run. `packages/workspace/src/delivery/runs.ts` holds the pure half —
the branch and directory derivation of `REQ-GIT-074/137/139/140` with every substituted value slugged so nothing
substituted can carry a `/`, the scheduler of `REQ-TRACE-478..483` and `463`, the prompt a unit receives with a
send-back's instructions (`REQ-TRACE-423`), the document composer and the in-place editor of `REQ-TRACE-434`, the
identifier and location conventions of `REQ-TRACE-442/443` — and the two named I/O units, provisioning through
ADR-0038's one Git chokepoint and the source write through ADR-0004's atomic replace. The writer's `beforeCommit`
slot is filled: a run-starting action provisions its worktree inside the transition's single-flight window and hands
the row back, and a refusal there refuses the action and writes nothing, which is how `REQ-TRACE-472`'s declined
disclosure and `REQ-TRACE-498`'s two repository rows are met. The workspace service arms the run family, the queue's
four controls, the source write, the review and blocker payloads, and re-runs the reap with the run host's real live
set. Main's coordinator is the **system** actor of that family: it claims, elevates for exactly one `session.start`,
restores the live state, writes the session id onto the row, settles it from the host's own ending, marks a run
waiting on a person, and cancels the board's runs when the last window closes. `pnpm requirements-runs-proof` drives
all of it against a real scratch Git repository built from Part AJ's fixture store, with the real traceability
engine on an in-thread executor and only the run host scripted.

**Found (1) — `AP-1`: the editor pane assigned its fields from an effect.** The first build of `EditorPane` reset
`title`, `description` and the failure notice inside a `useEffect` keyed on the props, which is the shape
`react-hooks/set-state-in-effect` refuses and which re-renders the pane twice on every open. React's own answer is to
reset by identity, so the writable form is now a component of its own keyed by the requirement and the text it was
opened on. No reading of `REQ-TRACE-436` would have found it; `pnpm lint` did, on the first assembly of the Part.

**Found (2) — `AP-2`: a deferred candidate was told the wrong number of slots were in use.** The scheduler reported
`REQ-TRACE-483`'s slot deferral as `slotReason(executing.length, concurrency)` — the count of units executing when
the pass *began*. A pass that dispatches two candidates and defers a third therefore printed "Waiting for a unit
slot: 0 of 2 in use." directly beneath two rows it had just marked `next`. The count is the concurrency less the
slots still free, which is the same value whenever a pass dispatches nothing, and differs exactly in the case the
queue is read in. The unit test had pinned the wrong number and was corrected with it; the end-to-end proof is what
put a person's eye on two rows and a contradiction.

**Found (3) — `AP-3`, a reachability finding, not a defect.** The scheduler's `manualReason` ("Automatic scheduling
is off: X waits until you release it from the queue.") is **unreachable through the product's own routes** today.
Every route into the released column other than a board release — a blocker cleared, a reaped run resumed — also
leaves the requirement without a disclosed launch, and the undisclosed stall sits above the manual deferral in the
ladder, so that is the sentence the queue states. `REQ-TRACE-482` is still met (nothing begins on its own, and the
queue says why), and the sentence the user gets is the more useful of the two because it names the next action. It
is recorded here rather than repaired because repairing it would mean ranking a *less* actionable reason first.

**Found (4) — `AP-4`: the queue promised a start the claim would refuse.** The service folded "this launch has no
accepted disclosure" into `REQ-TRACE-463`'s stall map, and the stall has an escape: a candidate the person has armed
is offered anyway, because arming is how a stalled start is retried. But `resume` from a run-failure blocker returns
to the released column, which is a run-starting decision, so it provisions and arms — while carrying no disclosure,
because nobody was asked for one. The scheduler therefore marked it `next`, `claim()` refused it (correctly —
`REQ-TRACE-497` forbids an undisclosed run being observable), and **nothing started, forever**, with the queue
saying otherwise. Worse, the phantom `next` consumed one of the two unit slots, so a later release of three
candidates started one instead of two. The disclosure is now its own input to the scheduler, checked before the
stall and not escaped by arming, and the claim logs any offer it cannot take, because the invariant is that what the
scheduler offers the claim takes. Both halves of this were invisible to reading: the first three assertions of the
proof passed, and the fourth and fifth failed together on one cause.

**Readings recorded.**

- *The queue's two persisted controls are configuration, and now they are registered.* This record's first execution
  withdrew a `delivery_queue` table on the ground that `REQ-TRACE-480` names the workspace configuration and no part
  had registered the keys. They are registered here: `requirements.scheduling.mode` and `max_concurrent_units`
  (`REQ-CONFIG-196`), written by the service through the Tier A writer and reloaded at once. The in-memory holder is
  now the cache of the configured values. A stop is still persisted nowhere.
- *The elevation has two residues this build cannot close, and they are stated rather than hidden.* The coordinator
  grants `REQ-TRACE-470`'s preset by handing the run host a live state carrying `runtime.permission_mode:
  autonomous` for one start. (a) `runtime.allow_unsandboxed_autonomous` is **not** a Tier B key
  (`REQ-CONFIG-263` closes that list; `REQ-CONFIG-265` makes it Tier C), so the opt-in half of `REQ-TRACE-470` has no
  per-run route. On the attended desktop the engine's `REQ-TOOLS-067` downgrade does not fire, so the run holds the
  preset; a headless host would downgrade it to `ask`, exactly as `REQ-TRACE-470` warns. (b) A composer start that
  reached the run host between the two hand-overs would read the elevated state — a window of two round trips. Both
  close the same way, with a per-run permission field on `session.start`, which is a run-host seam this row does not
  own; it is raised in the handoff as a ruling request.
- *`edit` and `create` are transitions that record, not refusals.* The first execution left them refusing and named
  this part. They now write into the project's own artifact through `requirements.source.write` and record the
  action with the summary the audit keeps (`REQ-TRACE-405`); the wave-1 refusal sentence and its pin in
  `transition.test.ts` were retired together. `accept-proposal` and `accept-change-work` are still refusals naming
  OQ-45, unchanged.
- *One unit per release.* Decomposition (`REQ-CONFIG-195`'s `execution.decomposition`) is registered as
  configuration and not built: a release starts unit `u<n+1>` where `n` is the number of runs the record already
  has. The branch template's `{unit_id}` is therefore always a single unit, and `REQ-GIT-139`'s cycle suffix carries
  the second and later deliveries of the same requirement.
- *The `requirements:` block's three unconsumed sub-blocks are carried opaque.* `evidence`, `delivery` and `board`
  are registered by the specification (`REQ-CONFIG-190/191/192/197`) and consumed by no part yet. Refusing a
  documented key would be the wrong refusal and validating a block nothing reads would be a second copy of a schema
  nobody executes, so they are accepted as mappings and passed through, with their inner validation owed to whoever
  consumes them.

**Not built here, stated:** decomposition into several units (above); the offers of `REQ-TRACE-409..416`, the source
revisions of `278..280` and the graph of `322..333`, which stay where the first execution left them; the improvement
store's two actions (OQ-45); `REQ-TRACE-465`'s stop control, which is the existing session control and is reachable
only once a board run has a surface to stop it from — the coordinator's `cancelAll` is the application-close half.
`REQ-TRACE-469` rides on that same cancel, and is now cited where it does: `session.control {op: 'cancel'}` reaches
`run.stop`, whose **first** act is to release whatever is blocked on a person (`REQ-MONITOR-012`), and every waiter
finishes `cancelled` whatever its deadline, which is `REQ-TOOLS-055`'s rule and is measured in
`packages/agent-tools/src/gate.test.ts`. An unlimited wait therefore ends with the stop instead of outliving it. What
**this** branch measures is the coordinator's half — a board run blocked on an unlimited approval has the cancel
issued at once, with nothing answering the approval first (`requirements-runs.test.ts`); a person pressing stop is
unmeasured here, because that button is `REQ-TRACE-465`'s and no surface in this branch offers it.
The five panes are **built and exported and nothing in this branch hosts them**: the board that mounts them is Part
AK′'s, in a worktree of its own, so this row's proof drives the panes' pure halves and the mechanism beneath them,
never a mounted pane. That is the seam the merge closes, and it is the one thing in this note that a reader should
not mistake for a working surface.
