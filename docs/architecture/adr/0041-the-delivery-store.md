# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-02, under `owner-decisions.md` SR-2, SR-4, SR-6, SR-9(a), ESC-18 and ESC-20, and
  against the specification as amended — `REQ-TRACE-514` (new), `REQ-LIBRARY-176` (new),
  `REQ-CONFIG-192`, `REQ-LIBRARY-042`
- **Origin:** DATA (ADR-DATA-07)
- **Depends on:** ADR-0003, ADR-0040
- **Scope note:** this record now also owns the **export** of the improvement artifact store, and only
  the export. That store's write path was unowned when this note was written — OQ-45 — and this record still does not take it; **ADR-0061 takes it, 2026-09-11**, and OQ-45 is closed. The split stands: the export is this record's because `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted by one ruling over one guarantee, and the write is ADR-0061's because the rule is not this store's.

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

**Merge 1's proof pass — 2026-09-09, the sixtieth defect.** The narrowing above — the cascade premise is "the tables
whose `session_id` REFERENCES `sessions`" — was applied to the store's own suite and ruled into the plan, and nothing
carried it to the proof that executes the cascade against the running product: `pnpm sessions-proof` (Part U) pinned
the count of tables carrying a `session_id` at fifteen and asserted every one of them empty after the delete, so v15's
`delivery_runs` failed the pin on the merged main while every branch and the store's tests were green — the same class
as the fifty-ninth, a bound only the merged arrangement exercises. The proof now reads the premise from the schema
(`pragma_foreign_key_list`: the fourteen that reference `sessions`, plus the parent), asserts that `delivery_runs` is
the ONE table carrying the column as a fact, plants a run row naming the session about to be deleted and asserts it
survives — REQ-TRACE-476 executed against the product rather than against the DAL alone: `pnpm sessions-proof` alone on the merged main, 146 s, PASS — fifteen cascaded, `delivery_runs` the one fact-table, the planted run row 1 before and 1 after the delete. The reading
stands; what it omitted is that a premise narrowed in one suite is a pin left standing in every other, so a ruling that
narrows a premise must name the proofs that pinned the old one, and the merge's proof pass is where such pins are found.
## Second execution — 2026-09-09 (Part AK′), the board

*Recorded under GD-10, the standing policy that a mechanism's first execution reports back into the record that
decided it. The first execution built the store, the transition and the projection; this one draws them. Two defects
of ADR-0058 consequence 17's pattern, `AK2-1` to `AK2-5` — three of them found after this note was first written, by
the verification it invited; the manager assigns the ordinals at merge.*

**What the board is, against this record's decisions.** The view reads ONE immutable projection per generation over
the `requirements.*` command family and assembles nothing locally (`REQ-TRACE-378/379`), which is the renderer half of
the "one value, one generation" decision. The write path is single: `requirements.act` with an action from the closed
set, and no card comes to rest anywhere the engine did not put it — an optimistic label is shown for the round trip
and the resting state is the next projection's (`REQ-TRACE-387/388/399`). Live refresh is channel 10, and a change
that names the requirements it affects replaces only those cards, so the memoised card of an unnamed requirement keeps
its element (`REQ-TRACE-374`). The clock is injected and read once per board arrival and once a minute after, never
per render (`REQ-TRACE-250`).

**Defect `AK2-1` — the filter selects tore the window down.** The five `<select>` handlers read
`event.currentTarget.value` INSIDE the deferred `setFilter` updater. React had already pooled the event by the time the
updater ran, `currentTarget` was `null`, and the first filter a person chose threw inside a state updater — which React
answers by unmounting the whole tree, so choosing a filter blanked the window rather than filtering the board. The
value is read in the handler now and the updater closes over it. No reading of this record was wrong; the surface was.
Recorded at the site in `RequirementsView.tsx`.

**Defect `AK2-2` — virtualising one dimension left the other unbounded.** `REQ-TRACE-358` speaks of the cards within a
column's own scroll viewport, and the first build virtualised exactly that: each column realised the band its own
vertical scroll exposed. But `REQ-TRACE-237` makes the COLUMNS area scroll horizontally too, and `REQ-TRACE-300`'s
supported bound is a hundred populated columns. Grouped by epic, a 1,500-requirement store therefore realised a
hundred columns' bands in one commit — about 1,300 card widgets and a 1.7 s long task — for four columns in view, and
`REQ-TRACE-239`'s budget was missed by more than an order of magnitude on an axis switch. A column now decides whether
it is on screen against the columns area itself, in a layout effect before the first paint, re-decided once per frame
on horizontal scroll and on resize; off-screen columns keep their heading, their count and their full scroll-range
spacer, so a column's scroll offset survives (`REQ-TRACE-335`) while it realises no card. **Bounding the cards was not
the whole of it, and the proof is what said so.** Its first measured run still cost a 151 ms long task on the axis
switch while only 48 card widgets stood across the hundred columns — the fix was working and the budget was still
missed — because the remainder was the per-column work itself: a viewport read and a `ResizeObserver` registration on
each of a hundred lists, in the single commit that switches axis. An off-screen column now reads no geometry and
observes nothing; it keeps its spacer, so its scroll offset still survives, and it costs nothing to exist. A third reading followed the second, because the
proof again said the figure had not moved: `Column` is memoised now, so the realised-count bookkeeping of the columns
in view no longer re-renders all one hundred. **None of the three closed the gap.** The card bound is real and is
kept, the off-screen guard is right and is kept, the memoisation is right and is kept — and the axis switch still
costs 150 to 170 ms. What the sequence establishes is where the cost is NOT, which is worth recording precisely
because each attempt was a plausible reading of the same requirement and each was measured rather than argued. What
remains is the single commit that creates a hundred column subtrees and lays out a 28 820 px row.
The reading that was wrong is
the one this record's "Revisit if" warned about in the other direction: the cost at scale was never the query, it was
the paint, and the requirement that bounds it is a two-dimensional one read as one-dimensional.

**Defect `AK2-3` — a hundred columns were built to show five.** The fourth reading, and the one that closed it. The
three above all left the hundred `Column` components standing and tried to make each cheaper; what was over the
budget was building a hundred of anything at all. So the board now realises COLUMNS the way a column realises cards:
the view decides, from the laid-out boxes, which columns the area's own viewport exposes, and builds only those.
`REQ-TRACE-239` asks for exactly this — "the work of displaying it SHALL be bounded by what is on screen rather than
by how many requirements the store holds" — and `REQ-TRACE-358` is its mechanism; reading that in one dimension when
the area scrolls in two was the whole of the error.

What made this look impossible from inside the third reading was a **tension with `REQ-TRACE-300`**, which forbids
truncating, hiding or refusing a column on account of how many there are, and which the proof asserted by counting a
hundred columns in the document. Virtualising columns by removing them would have failed that assertion, and the
handoff recorded the two as irreconcilable — either 300 means a hundred columns must EXIST, or the assertion should
read the count off the board's model. **Both readings were unnecessary.** An unbuilt column is not removed: it keeps a
placeholder of exactly its own box, carrying its key and its count. Its width, its place in the row, its share of the
horizontal scroll range and every other column's position are unchanged, so a hundred columns are present, the row is
still 28 820 px, `REQ-TRACE-237/238/335` hold as literally as before, and the column is built — heading, cards,
accessible description — in the update that brings it into view. The proof asserts BOTH halves now, which is stronger
than either reading would have been: a hundred columns present, the row a hundred minimum-width columns long, and
fewer than a hundred built. A folded column is never virtualised, because a rail holds no card widgets already
(`REQ-TRACE-311`) and its accessible name is what `REQ-TRACE-320` asks a reader to find.

Two further costs were found and removed while measuring it. The margin either side of the viewport was one whole
column, chosen by analogy with `REQ-TRACE-360`'s five cards; measured, it builds a sixth column to cover a wheel notch
the band re-decides within the frame anyway, so it is half a column now. And a newly built column began from the
built-in 128 px card estimate, built eleven cards for a column of fifteen, adopted the measured mean in the layout
effect that followed and discarded three — fifty-five widgets built to keep forty, inside the same update. A card is
the same widget in every column, so a mean this board has actually measured is now what the next column starts from;
`REQ-TRACE-361` requires a column to keep using an estimate until one of its own cards has completed layout, and it
does not require that estimate to be a constant.

**The keyboard was the thing this could have quietly broken, and it did not.** `REQ-TRACE-300` requires a hundred
columns to stay keyboard-operable. Traversal used to walk the built columns in the document; it walks the board's
columns now — every one is a child of the area, built or not — and where the neighbour is not built it is scrolled
into view and takes the focus in the update that builds it. `REQ-TRACE-364`'s reveal does the same for a card whose
column is not built. The proof's fold section is where this is exercised end to end: at 1264 px the Done column lies
outside the area's viewport, so it holds no heading and cannot be clicked — by a person or by a proof — and the proof
scrolls to it first and then folds it, which is the other half of `REQ-TRACE-300` demonstrated rather than argued.

**Defect `AK2-4` — the detail drew six sections where the specification fixes five.** `REQ-TRACE-271` says exactly
five and spec 08's vocabulary list names them; `REQ-TRACE-278/280` separately require a revision-history panel with
three states. The first build drew the panel as a sixth peer — same test identifier, same class, same kicker — so the
file contradicted its own `DETAIL_SECTIONS` constant and anything counting the detail's sections found six. The
reading taken, and stated at the site: 280's "history panel" is its own surface within the detail view and not one of
271's five. It keeps its own identifier and its own class, the five stay five, and a test pins both.

**Defect `AK2-5` — the proof's own instrument measured the wrong window.** The long-task observer was re-armed before
each measurement by clearing its array and registering a fresh `PerformanceObserver` with `buffered: true` — and
`buffered` replays the entries recorded before that observer existed. Every window after the first therefore reported
the longest task since start-up, not the longest task in the window: the axis switch was reading the board's own
arrival back as its own cost, and one run printed a 102 ms arrival as a 102 ms switch. The observer is registered
once, every entry keeps its start time, and a read takes only the entries that began at or after the arming. This is
recorded because a measurement that cannot be attributed is not a measurement — and because it cuts the other way
too: arrival never cost more than 74 ms in any run, so nothing at the 150 to 180 ms scale can be explained by the
replay and the breach those figures recorded was real.

**What the first execution left for the board to state, and how it states it.** Four things the projection cannot carry
are printed in the section that would have shown them rather than left blank or invented: the current requirement hash
(`REQ-TRACE-256` puts it on the card value; `BoardCard` has no field, and the detail says the engine compares it on
every action instead); eight of `REQ-TRACE-274`'s twelve relation tokens, which the requirement document format
declares nowhere, named in the Relations section as tokens the projection cannot emit; `superseded` health, which no
store datum can reach, so no card can ever carry it; and `run.waitingOnPerson`, which is carried and always false
because no signal for it exists yet. `REQ-TRACE-346`'s analysis flag is stated as the pass reports it and deduced from
nothing. This is the same discipline the first execution used for the stated refusals, applied to a drawn surface.

**Found in the store and the projection: nothing.** Every value the board needed was on the projection or derivable by
`ui-core`'s pure display mapping; no query was added, no table was touched, no transition rule was changed, and the
`facts` channel the first execution chose (`Units`, `Last run`, `Last change`) carried what the card needs without a
seam change. The one thing the surface wanted and the seam does not offer is a unit count and a last-run stamp as
FIELDS rather than facts, which is an additive seam change nobody needed to make.

**`REQ-TRACE-239` is measured now, and this record's "Revisit if" is answered — in part, and not in the direction
expected.** That paragraph said no measurement of the 100 ms budget at `REQ-TRACE-300`'s scale existed and that the
claim was a design expectation. It is measured now, and the expectation held for one path and **failed for the other**.

*Met.* Putting a board on screen is within budget everywhere it was measured: **21 ms** on the fixture store at
1264 px (longest long task 56 ms), **14 ms** at `REQ-SHELL-022`'s 1000 x 680 minimum, and **26 ms** on a generated
1,500-requirement, 100-epic store (longest long task 69 ms), each read as the view's own figure from the projection's
arrival to the laid-out DOM. The post-debounce filter recomputation over 1,500 requirements is within `REQ-TRACE-367`'s
budget too. At `REQ-TRACE-300`'s hundred populated columns the board realises **48** card widgets, not the ~1,300 it
realised before `AK2-2`, and a column of 1,500 members realises 8 to 13 of them across a scroll from end to end.

*Not met.* **Switching the grouping axis to a hundred populated columns costs the interface thread 150 to 170 ms**,
over the budget, measured three times on this machine: 151 ms before `AK2-2`'s later halves, then 171 ms and 158 ms
after them, with no competing process for at least part of that. Two fixes were tried against it and neither moved
the figure, and both are kept because each is right on its own terms: an off-screen column now reads no geometry and
registers no observer, and `Column` is memoised so the realised-count bookkeeping of the columns in view no longer
re-renders all one hundred. The remaining cost is therefore not the cards, not the per-column effects and not the
render cascade; on the evidence it is the single commit that creates a hundred column subtrees and lays out a
28 820 px row. **This is recorded as unmet rather than argued away, and the proof's assertion is left in place and
failing.** What has not been tried, in the order a later hand should try it: realising the column SUBTREES the way
the cards are already realised, so a hundred columns cost what six do; and deciding whether `REQ-TRACE-239`'s budget
governs a re-grouping at all, which is a question for the specification and not for the person whose code is over it.
The first thing this record said to check if the budget were missed — whether the board query and the export share a
read path — is not the cause: the query is one read of one projection and the cost is entirely in the paint.

*Met, after `AK2-3`, and the paragraph above is kept as it stood rather than rewritten.* On the repaired tree the axis
switch to a hundred populated columns costs **72 ms and 89 ms** in two consecutive green runs of the proof, one long
task each, against the same proof's 151 / 171 / 158 ms before it. Five runs after the repair read 87, 89, **134**, 72
and 89 ms; the 134 is named rather than dropped, and it was taken while four other builds were launching Electron on
this machine. `REQ-TRACE-088`'s reference conditions — "one execution thread on a contemporary developer workstation
… timing the work alone" — are not those conditions, which is why a red on a timing budget is re-run alone before it
is read; the same machine's board arrival moved from 21 ms to 64 ms over the same period without a line of the board
changing. The margin at the bound is real but it is not large, and that is stated rather than smoothed.

Around it, on the same two runs: putting the board on screen costs **45 to 64 ms** on the fixture at 1264 px (longest
long task 0 to 67 ms — 0 meaning no task reached the 50 ms threshold at all), **40 to 47 ms** at `REQ-SHELL-022`'s
1000 × 680 minimum, and **60 to 73 ms** on the generated 1 500-requirement, 100-epic store. At `REQ-TRACE-300`'s bound
the board holds **100 columns present** of which **5 are built**, carrying **40 card widgets**, in a row 28 820 px
wide against a 1 134 px viewport, with the board's own model reporting a hundred columns; the post-debounce filter
recomputation over 1 500 requirements costs 7 to 9 ms against `REQ-TRACE-367`'s 100 ms. The proof's `scale` section is
the regression for all of it, and it now asserts the presence and the boundedness together, so neither can be met by
giving up the other.

**Not built here, stated:** every pane (`REQ-TRACE-417..445`), runs from the board and the queue's controls
(`464..483`) and the source write are Part AP's; the graph axis (`322..333`) is wave 3's; `REQ-TRACE-514`'s export is in
no part yet; `REQ-TRACE-486`'s evidence chord is bound on the focused card rather than registered on the command
registry, because the row allows this part one registry entry and `REQ-TRACE-390`'s move control takes it. The
`edit`, `create`, `accept-proposal` and `accept-change-work` refusals stand exactly as the first execution left them.
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
  **Closed by the owner's authorized refactoring, 2026-09-13 (R-009).** The original residue above remains
  as the record of the first implementation. `session.start.boardPermissions = permissive` now carries the
  board coordinator's grant over the main-to-run-host boundary. The launch module captures configuration
  before leasing credentials and applies `permission_mode: autonomous` together with
  `allow_unsandboxed_autonomous: true` to that launch. `Sessions.start` consumes the prepared setup.
  Active run ports resolve configuration by session identifier, and every model resolver retains its launch's
  leased bearers. Board dispatch sends one start request. Tier B's key list and the user's live settings retain
  their existing meaning.

  The first focused execution found an additional defect: `Run.start` wrote `permission_mode: default` and
  an empty configuration snapshot into every launch audit. The session record already held the effective
  permission. The audit now records that effective permission and the captured runtime section, including both
  board grant fields. The 2026-09-16 defect closeout completed every effective configuration section, inline
  resolved persona prompts and deterministic credential redaction.
  `launch.test.ts` exercises real configuration loads and session records with scripted provider responses:
  overlapping board/composer starts, reversed lease completion across workspaces, failed credential leases,
  a thrown session start, and renderer contract isolation. The snapshot assertion failed against the literal
  `default` audit and passed after the correction; the existing session-resume tests preserve the original audit.
  Validation: the focused launch/configuration/board/session/run/tool suite passed 57 tests;
  `requirements-runs-proof` passed 104 tests after its handover assertions were updated to the per-launch
  grant, and now includes the real launch suite. `pnpm check` passed 1,625 tests with 25 skipped;
  `pnpm build` passed. All model responses in these checks were scripted.
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

> **Reconciled 2026-09-28 (`PD-ORCH-005` clauses 3, 9 and 15, OQ-108, R-065).** The coordinator's `cancelAll` is now
> `quitAll`, and it sends the run host's `session.control {op: 'announceShutdown'}`, the application's quit, not the
> stop control's `cancel`: a stop request keeps its first reason, so the `cancel` rested a board run by `stop`
> (`docs/defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md`). The run comes to rest by `quit`, and what
> waits on a person is **withdrawn** by the quit (clause 9), never answered and no longer `cancelled`, so the
> paragraph above describes the release before the directive. REQ-TRACE-469's guarantee holds unchanged: the unlimited
> wait still ends at once with the quit. REQ-TRACE-464's "SHALL cancel" is read through clause 3's quit; OQ-108 records
> that no directive yet names it.

The five panes are **built and exported and nothing in this branch hosts them**: the board that mounts them is Part
AK′'s, in a worktree of its own, so this row's proof drives the panes' pure halves and the mechanism beneath them,
never a mounted pane. That is the seam the merge closes, and it is the one thing in this note that a reader should
not mistake for a working surface.

## Third execution — 2026-09-11 (Part R″), the lane closed end to end

*Recorded under GD-10. Defects are numbered `R2-n` here; the manager assigns the ordinals at merge, and the tally
stands at sixty-eight before them. This execution took the seam the second execution named and left open — "the five
panes are built and exported and nothing in this branch hosts them" — and closed it, then drove `REQ-TRACE-499` over
the composition that results.*

**Built and run.** The board hosts the five panes through Part AP's own registry (`REQ-TRACE-369/370/375`): one
registry per window and workspace, a pane built the first time it is needed and reused after, `installed` answerable
for every key without constructing anything, and a workspace change discarding them all. The two board-level panes —
the queue and creation — are reached from the board's header; the three that are about ONE requirement — review,
blockers, the editor — are reached from that requirement's detail, because the detail is the only surface that knows
which requirement they would open against. The elevation's disclosure (`REQ-TRACE-472`) now stands where the
specification puts it: between the first action of a launch that would start a run and anything being written. The
protocol is Part AP's, unchanged — `requirements.runs {op:'preview'}`, the dialog, `requirements.act` carrying
`payload.disclosure`, then `requirements.runs {op:'dispatch'}` — and abandoning sends nothing at all, which is how
`REQ-TRACE-472`'s "nothing whatsoever happens" is met: by not speaking, not by a rollback. The relationship graph of
`REQ-TRACE-322..333` and `REQ-TRACE-505`, which the first and second executions both left where they found it, is
built as a **presentation** of the board centred on one requirement rather than as a grouping axis, because an axis
has no centre; its model is pure and unit-tested, its walk is breadth-first with first-seen depth winning, and its
surface is depth columns of focusable node controls beside a textual edge list, which is what `REQ-TRACE-328` fixes.

**Found (1) — `R2-1`: the queue pane had no way back.** Three of Part AP's five panes carry a Close control of their
own and the queue does not, because the queue was built to be hosted and the host had not been written. Mounted as
they were, opening the queue left the board unreachable until the view was switched away and back. The way back
belongs to whoever opened the pane, so the host draws its own chrome — a titled bar with one Close control — above
whichever pane is open, and the panes' own controls stay as they are. Found by driving the surface, not by reading it.

**Found (2) — `R2-2`: the observable state could not see the panes, so the first proof of the registry was vacuous.**
`window.__rotarisBoard` reported the cards, the columns and the budgets, and said nothing about which panes were
built. A proof written against the DOM alone can see that a pane is on screen but not that a SECOND open reused the
first — which is the whole of `REQ-TRACE-369` — so the observable now carries, per key, whether the pane is installed
and the moment it was built. The assertion that re-opening the queue leaves `openedAt` unchanged is the one that can
fail; without it the proof would have passed against a host that rebuilt the pane every time.

**Found (3) — `R2-3`: the renderer built cleanly and threw on the first pane.** `PANE_TITLE` was dropped from an import
while the chrome that uses it did not yet exist, and then that chrome was written. `tsc` would have caught it; the run
of `pnpm check` that would have caught it read the file moments before the edit, and **a bundler does not resolve
identifiers**, so the build was green and the renderer threw `PANE_TITLE is not defined` the first time a pane opened —
which React answers by unmounting the tree. Found by the proof's own evidence: every pane reported `installed: false`
and the card had vanished from the DOM at the last read. **The lesson is the schedule, not the typo:** a check whose
`tsc` step ran before the last edit proves nothing about the bytes that were built.

**Found (4) — `R2-4`, in the proof: the eval readers were left pointing at the old times.** When the resting read was
moved to make room for the reveal, the two readers that consume it were not moved with it, so the assertion read the
reveal's `true` and reported "sits in undefined" while the launch's own evidence showed `column: "done"` at that moment.

**Found (5) — `R2-5`, in the proof: the refusal was read before it was drawn.** The epic-axis drag assertion read the
card's feedback in the same tick as the synthetic `dragstart`, saw an empty list and reported "the refusal was silent"
where the product had refused in words. The read waits two frames now, as every other driven assertion here does.

*The four below were found by the gate-3 verifier against the BUILT product and the committed proof, after this note
was first written. They are recorded in the same list and on the same terms, because a defect found by the reader
after the writer stopped looking is still a defect of this execution — and three of the four are of one kind: an
assertion that read a name, an attribute or a null, where only a measurement could have answered.*

**Found (6) — `R2-6`: the relationship graph's node controls were never painted.** `.req-graph__columns` is a flex item
whose `overflow-x` is not `visible`, so its automatic minimum size is zero; the edge list below it took the free space
and the wrapper was shrunk to a height of 0 and clipped its ten node buttons away. The controls were in the DOM,
carried their identifiers and their kinds, and were focusable — and the surface showed the summary, the bound statement
and twelve edge sentences with nothing between them. `REQ-TRACE-328` fixes node controls **laid out** in depth columns,
and a queryable control is not a laid-out one. `flex: none` gives the wrapper its content height. The reason the proof
passed is the finding's whole point: its `panes` stage read attributes through `querySelectorAll` and never a box, so
it could not tell a drawn graph from a clipped one. It measures the wrapper and the first node now, at both depths.

**Found (7) — `R2-7`: the pane host's own chrome was undrawn.** The bar added to repair `R2-1` had no rule in
`shell.css` or anywhere else, so it drew as a block with no padding, no gap and no rule beneath it: the kicker and the
Close control sat flush against each other, above the pane's own heading, and the surface therefore named itself twice.
Its rule now follows `.req-pane__header`'s pattern, and the duplication is settled by deciding it: the host names no
pane. All five panes draw their own `<h2 class="req-pane__title">`, so the host's business is the way back, and the
pane's identity travels on the Close control's accessible name.

**Found (8) — `R2-8`: three token-shaped names that the token set does not define.** `--rt-control-sm`,
`--rt-focus-width` and `--rt-focus-offset` occur nowhere in `packages/contracts/src/theme/themes.ts` and nowhere in
`docs/design/system/`; each appeared exactly once in the repository, in this Part's own two rules, so what rendered was
the fallback literal beside it. **A token-shaped name that resolves to nothing IS the literal** the design rule
forbids, and it is worse than an honest literal because it reads as compliance. The focus rule is dropped outright —
the house rule `:where(button, …):focus-visible` already rings these buttons with the real `--rt-focus-ring-width` and
`--rt-focus` — and the depth input's height is dropped with a stated reason: **the token set holds no control-height
token at all**, and the one compact-control height in `shell.css` is a bare `24px` in the board's own header, which is
a violation to raise rather than to copy. Raised as a ruling request in the handoff.

**Found (9) — `R2-9`, in the proof: a `REQ-TRACE-497` clause that asserted nothing.** The rotated-text-on-a-folded-rail
clause was written in the `panes` stage as `if (shapes.rail !== null) expect(…)`, and the `panes` profile folds no
column — so the read answered `null` and the clause was vacuous in every run that reported it as met. It is asserted in
`fold`, which folds a column, together with `REQ-TRACE-493`'s two accessible names and the rail's operability without a
pointer; the `panes` stage now asserts the rail's ABSENCE, so a rail arriving there fails rather than re-guarding. In
the same finding: `expect(deeper.nodes.length >= graph.nodes.length)` passed with ten against ten, because the fixture's
neighbourhood of REQ-101 is exhausted at depth 2 — an assertion a depth control that ignored the value would also pass.
The saturation is asserted as the fact it is, and the claim that a deeper walk admits more is asserted on a chain
fixture built for it in `graph.test.ts`.

**Readings recorded.**

- *`REQ-TRACE-465`'s stop control is met by navigation, and that is a reading rather than a repair.* The second
  execution left the button missing. The specification requires pause, steer, stop and answer to operate on a
  board-started run for the whole of its life; `REQ-TRACE-475` separately forbids the requirements view to build a
  transcript, an agent tree or a worktree listing of its own and requires it to link out, carrying the session
  identifier, to the surface that owns each aspect. Those two together say the board's obligation is to make the
  session reachable, not to grow a second set of run controls; the workspace view's stop operates on the same live
  handle (`REQ-TRACE-464`). The board offers the session opener on the card, in the detail's execution section and on
  the queue row that is waiting on a person. What is NOT built is a stop button on the board, and the reason is
  stated here rather than left as an omission.
- *The detail's "read-only" sentence was falsified and is replaced.* It read "writing into the source is Part AP's and
  not built in this version". Part AP built it and this execution hosts it; the sentence now states the source's
  actual writability and what to do when it is read-only (`REQ-TRACE-498`'s source row). The falsified reason is kept
  here beside its replacement, as the record's standing rule requires.
- *A reading of this record's own that turned out wrong, corrected here beside it.* The first version of this note
  reported `REQ-TRACE-499` as "released at about 11 s, running by 18 s, at review by 23 s, accepted at about 36 s,
  resting in `done` at 38 s". **Those were not durations the product produced.** They were the moments in the proof's
  `ROTARIS_CAPTURE_EVAL_AT` schedule at which the script LOOKED — 13000, 18000, 23000, 29000, 38000 ms after the
  launch — so every one of them is an upper bound on when a state was first observed and nothing more. The gate
  demonstrated it by running the same work on a different schedule and getting different figures. The proof now reads
  the transition times from the store's own rows (`delivery_history.at`, `delivery_runs.started_at` and `ended_at`),
  which is where the product records what it did, and reports the schedule as a schedule.
- *Measured, with the machine's state beside every figure* (two other agents were building and proving on this
  machine throughout; free physical memory is the variable that moved). **`REQ-TRACE-499` end to end, in the built
  application, read from the delivery store** (run of 2026-09-11 at 1.6 GB free): release recorded at
  `11:14:54.154Z`, the run's own row started at `11:14:58.256Z` and ended at `11:15:03.119Z`, the accept recorded at
  `11:15:18.560Z` — **4.1 s from the release to the run starting, a 4.9 s run, 24.4 s from the release to the
  acceptance**. Across four runs of the repaired proof the same three figures read **3.4 to 4.9 s**, **4.8 to 5.0 s**
  and **24.39 to 24.41 s**, which is the difference a measurement makes: the acceptance figure is the proof's own
  scripted wait and is therefore nearly constant, while the two the product owns move with the machine. *Observed by*
  the proof's schedule, which is a different kind of statement: backlog by 13 s, running by 18 s, at review by 23 s,
  `done` by 38 s. The delivery store afterwards holds **exactly
  one** release entry for two launches — the first disclosure was abandoned — an accept entry, and **one** run row
  carrying its session identifier and the permissions it was granted, which is `REQ-TRACE-472` and `405/464` read
  from the store rather than from the screen. **The pane registry:** `review` installed with a single `openedAt`
  that does not move when the pane is opened again, the other four `installed: false` after being asked about.
  **`REQ-TRACE-300/239`'s axis switch** — the one number in this lane never taken on a quiet machine — read 76 ms on
  the base commit at 2.93 GB free, 107 ms and 122 ms on this branch at low memory with two other agents' Electron
  proofs live (1.26 GB free for the second), and under the budget again on this branch at 2.53 GB free; Part AK′
  recorded 72, 87, 89, 89 and 134 ms for it. **The budget was not lowered and the assertion was not relaxed**: a
  breach is reported at the end of the script instead of stopping it, so a load-sensitive figure can no longer hide
  the evidence that follows it. Whoever merges should re-measure it idle.
- *The graph is not a tab.* The mockup's `REQUIREMENTS` screen carries Kanban / List / Graph tabs, which is craft; the
  specification fixes the axes (`REQ-TRACE-293`) and asks for a graph "centred on one requirement" (`REQ-TRACE-322`),
  which is not an axis value. Opening it from a requirement's detail is what makes a centre exist before the graph
  does, which is also what `REQ-TRACE-333` requires — no graph content and no contents summary before a centre has
  been chosen.

**Not built here, stated.** `accept-proposal` and `accept-change-work` remain the refusals this record's first
execution wrote, naming OQ-45's improvement store; the derived technical proposals of spec 08 §1116 are read and
shown by the review (the run's `proposed-requirements.json`, `REQ-TRACE-427/430`) and cannot be ACCEPTED, because
accepting is what causes the write (`REQ-TRACE-429`) and there is no store to write into. `REQ-TRACE-465`'s stop
button (above). `REQ-TRACE-409..416`'s offers, `278..280`'s source revisions and `REQ-TRACE-514`'s export, all where
the earlier executions left them.

## Repair — 2026-10-02: a unit's worktree is provisioned once

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`](../../defects/fixed/a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md).*

Part AP's second execution reads: "a run-starting action provisions its worktree inside the transition's single-flight
window and hands the row back." **That held only for a unit with no tree, and is kept above as it was written.** A card
held out of `ready` before its run began, then resumed, derives the same unit (its `Units` fact has not moved). It
provisioned that unit again, `createWorktree` refused the existing path (REQ-GIT-140), the soft failure of
REQ-TRACE-463 replaced the launch with one that had no worktree, and no claim could take the card. REQ-TRACE-464 decides
it: "The run SHALL take over the worktree already provisioned for it and SHALL never provision a second one." So
`beforeCommit` takes over the tree of the launch it holds for that unit, or, after a restart, the tree the store's
worktree row records for it. It does that through `takeOverUnitWorktree` (`runs.ts`), which admits only a tree Git
lists at that path on that branch and which passes REQ-GIT-140's read-back. It provisions only a unit with no tree.
`provisionUnitWorktree` is unchanged: an existing directory still fails provisioning rather than being reused.
`requirements-proof`'s `blocker-resume` stage now asserts the dispatch.

## Repair — 2026-10-02: a card resting in `ready` keeps a way to start after a restart

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-card-resting-in-ready-across-a-restart-can-never-be-started.md`](../../defects/fixed/a-card-resting-in-ready-across-a-restart-can-never-be-started.md).*

The repair above takes over a recorded tree from `beforeCommit`, so it reached only a transition. **It left the queue's
release, which has no transition, holding the launch the restart lost, and is kept above as it was written.** A card
released with the queue stopped (or resting under `manual`) rests in `ready`; the launch (unit, disclosure, tree) lived
in the service's memory only, the queue's "Disclose and start" recorded its disclosure only on a launch it held, and no
claim could take the card. Now `recoverLaunch` (`workspace-service/delivery.ts`) rebuilds such a launch from the store's
worktree row through `RunGitPort.takeOver`, sharing `takeOverRecorded` with `beforeCommit`. It runs once on the first pass
after a start, undisclosed, so an unattended workspace's scheduler claims the card with no release (REQ-TRACE-474), and
on the queue's release, which records the disclosure it carries and arms the card (REQ-TRACE-472/482). It never
provisions: the queue's release writes no worktree row, and REQ-TRACE-464 forbids a second tree. A tree it cannot take
over is stated on the entry as the last start's stall (REQ-TRACE-463), and the claim still refuses the card.
`requirements-proof`'s `ready-restart` stage shows it across a quit and a relaunch of the built app.

**Two clauses of that repair were falsified by the verifier the same day, and are kept above as written.** "Once on
the first pass after a start": the pass was the restart reap's, which runs whether or not the store parses, so a first
parse that failed used the recovery up for the session. Now every pass that parses recovers each card in `ready` that
holds no launch. "Undisclosed, so an unattended workspace's scheduler claims the card": only an unattended workspace,
because the service cannot read the two preferences REQ-TRACE-472 names. A card whose disclosure was suppressed
permanently, or whose elevation was switched off, was never claimed by automatic scheduling after a restart. Now main's
coordinator sends its standing disclosure (`StandingDisclosure`: `due`, `suppressed`, `off`) on every
`requirements.run.claim`. The service treats an undisclosed launch as disclosed when that is not `due`, and gives the run
the workspace's own mode when it is `off`. `requirements-runs-proof`'s seventh assertion shows it. Nothing dispatches
when the application launches, so the pick-up waits for the first kick; that gap is recorded as its own defect note.

**The verifier falsified "on every `requirements.run.claim`" in a second round, kept above as written.** Sent on the
claim alone, the standing disclosure split the scheduler in two: the queue the board published was still computed as
if the disclosure were `due`, and called "deferred, open it to see the disclosure" a card the next claim took with the
disclosure suppressed (REQ-TRACE-478, REQ-TRACE-472). Now main stamps the value on every `requirements.command`
envelope it sends, beside the actor, from the relay and the coordinator alike; the claim command carries no field of
its own. The service holds the last value it received and schedules the published queue, the launch preview and the
claim under it; a command whose value moved republishes the queue before answering and its reply carries `changed`. A
permanent acceptance reads the board at once, so the service learns of it without waiting for another act. The seventh
assertion now also requires the published entry to read `next` before the dispatch.

## Repair — 2026-10-02: a card's next unit is provisioned at the claim

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`](../../defects/fixed/a-rejected-card-back-in-ready-can-never-start-its-next-unit.md).*

**One clause of the repair above is replaced, and kept above as written: "It never provisions: the queue's release
writes no worktree row, and REQ-TRACE-464 forbids a second tree."** It held for the card that repair was about — a
card released and resting in `ready`, whose unit a run-starting action had provisioned — and not for a card resting in
`ready` on a unit nothing provisioned. A reject (review → `ready`, not run-starting, REQ-TRACE-386) and a run ending
classified `cancelled` (a run stopped at its iteration limit persists `stopped`, which main's `outcomeOf` reads as
`cancelled`) both rest a card in `ready` after a run began, so its `Units` fact has moved and its next unit has no
tree. The launch the service held was the finished unit's: under `automatic` the scheduler named the card `next` on the
finished unit, the claim handed that launch out, main started a session in the rejected unit's kept tree, and
`requirements.run.started` was refused by `delivery_runs`' primary key, which also skipped `claimed.delete` and left the
card `next` holding a slot; under `manual` the queue's release found no row for the next unit and stated the stall.

Now the held launch of an earlier unit is **spent**: the scheduler names the card's current unit (`unitOfCard`), and the
claim never hands the finished unit out. Its disclosure carries to the next unit (it was given in this launch of the
application, REQ-TRACE-472); its tree stays where REQ-TRACE-423 keeps it, and a send-back's instructions do not carry.
**The claim provisions** the card's current unit when the store records no tree row for it at all — the system's
dispatch, under both modes; the queue's release only records the disclosure and arms — and writes the row at once
through the writer's new `recordWorktreeProvisioned` (`workspace/src/delivery/transition.ts`), so a restart before the
run starts takes the tree over rather than provisioning a second one (REQ-TRACE-464). A recorded row whose tree is gone
stays the stated stall. The read pass never provisions (REQ-TRACE-408), and neither does the reject (REQ-TRACE-389 and
REQ-TRACE-422 fix what it says it does to the worktree). `requirements.run.started` settles the claim whatever its write
does (pinned by a `delivery.test.ts` case whose start the primary key refuses: the next candidate takes the freed slot). A claim made before the first pass under `manual` with nothing armed answers `null` without parsing the store, so a
kick at a workspace open costs a `manual` workspace no parse. `requirements-runs-proof`'s eighth assertion shows it
against a real scratch repository: a reviewed card rejected, `runs.dispatch()`, and u2 runs on its own worktree beside
the kept u1.

## Repair — 2026-10-02: an automatic queue resumes at a workspace open

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`](../../defects/fixed/an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md).*

**The clause "Nothing dispatches when the application launches, so the pick-up waits for the first kick" (the second
round of the repair of a card resting in `ready`) is replaced, and kept above as written.** It described the build and
named the gap; REQ-TRACE-476 ("The queue SHALL resume where it stopped") and REQ-TRACE-482 ("the system itself picks up
the next candidate as capacity becomes available") leave no reading in which a relaunch waits for a person. Main's
post-open slot now kicks the coordinator once per workspace open, after the window is interactive, through
`requirementsRuns.opened(root, workspaceId)`: a dispatch for the workspace just opened, not for the most recently focused
window. The coordinator's dispatches are serialised per workspace root, so a kick for one workspace is never swallowed by
another's in flight. The board's first read is not the placement (REQ-TRACE-408: a read creates no execution unit;
REQ-TRACE-512: nothing starts on its own initiative from opening the view). The claim's parse runs in the workspace
service, off main's thread, and a `manual` workspace with nothing armed is answered without one (the claim's guard, from
the repair before). A sibling gap of the same shape is closed with it: under automatic scheduling the board now kicks the
coordinator after an act that rests a card in `ready` without starting a run, a `reject` chiefly (`dispatchesAfter`).
`requirements-proof`'s `ready-restart-automatic` stage shows it across a quit and a relaunch of the built app.

## Repair — 2026-10-02: one acceptance holds for the rest of the launch

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md`](../../defects/fixed/accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md).*

Part AP's second execution built REQ-TRACE-472's disclosure with **two** desktop preferences and **one** reading of a
launch nobody disclosed — `due`, `suppressed` (accepted permanently) or `off` — and the repairs above stamped that value
on every command. **Only the permanent half of "Accepting SHALL suppress the disclosure for the remainder of that launch,
and accepting it permanently SHALL suppress it in subsequent launches too" was built**: a plain acceptance wrote no
preference, main held nothing for it, and the next card's preview read `due` again. The launch is read as the
application's, as "subsequent launches" requires, and main's lifetime is that launch. So main's coordinator now holds a
plain acceptance in memory, told by the board through `requirements.runs {op: 'accept'}`, and reads `accepted` — a new
value of `StandingDisclosure` and of `LaunchPreview.disclosure` — in the standing disclosure it stamps on every service
command and in the launch preview, which the board answers without the dialog (`disclosureFor`) and passes straight
through as the act's or release's payload. The workspace service needed no change: it already treats any standing
value but `due` and `off` as disclosed and permissive. The next launch reads `due` again. `requirements-proof`'s
`disclosure-launch` stage shows it.

## Repair — 2026-10-02: a board run is settled against its own workspace

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-board-run-is-settled-against-the-focused-windows-workspace-not-its-own.md`](../../defects/fixed/a-board-run-is-settled-against-the-focused-windows-workspace-not-its-own.md).*

Part AP's second execution has main's coordinator settle "the row from the run host's own terminal event (REQ-TRACE-477)"
and mark a run waiting on a person from its snapshots. It addressed both, the dispatch after a run's end and the run host's
exit reap, to the most recently focused window's workspace, which is the run's own only while one workspace is open. Now
the coordinator keeps each board run's workspace root and id, and addresses that workspace's service; the run host's exit
reaps every workspace that held a run, beside the focused one. `requirements-runs.test.ts` pins it with two workspaces and
the focus moved to the other; `requirements-runs-proof` has no two-window stage.

