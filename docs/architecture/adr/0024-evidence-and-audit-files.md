# ADR-0024 — Evidence and audit as append-only tables behind one writer, and what the audit's export must prove

- **Status:** proposed
- **Date:** 2026-09-01
- **Origin:** EXEC (ADR-EXEC-11), UI (ADR-UI-10, on terminal input)
- **Authority:** `owner-decisions.md` **SR-4**, **SR-6** and **SR-9(a)**; and the specification as
  amended on 2026-09-01, which minted `REQ-SESSION-199`, put the audit's integrity properties inside
  `REQ-SESSION-137`, and made the ring trim part of the operation that records the entry
- **Depends on:** ADR-0003 (the line between a file and a row), ADR-0058 (the workspace store),
  ADR-0005, ADR-0007, ADR-0008
- **Supersedes** the line-delimited-file form of this record dated 2026-08-31, preserved below as
  alternative A
- **Contains an unresolved conflict between slices**, and reports one gap in the export list

## Context

`REQ-TOOLS-078`, `REQ-TOOLS-082` and `REQ-SANDBOX-112`: permission decisions and mode changes are
recorded in the order the decisions were taken, **interleaved**, so a reader working through them in
order recovers which mode governed any decision from the nearest preceding mode-change entry.

`REQ-TOOLS-078` makes the record a **ring**: once recorded, an entry's content is never altered, no
entry is ever inserted ahead of one already present, and the only permitted removal is retention
trimming to the 5000 most recent entries (`REQ-SESSION-133`), each new entry beyond that displacing the
oldest still held. A reader sees a suffix of the session's decision history, in the order the decisions
were taken, every retained entry exactly as it was recorded — every field, adding nothing and dropping
nothing. It has been amended in two ways that matter here: it no longer fixes where the audit is held
("where that audit is held is the sessions domain's and is not fixed here"), and it now requires the
record to **retain enough to say that entries were dropped**.

`REQ-TOOLS-190` gives the verification-gate record the same never-altered, never-reordered, 5000-entry
rule and likewise fixes "no path, file name or directory for it". `REQ-SESSION-133` gives seven ring
caps — issues 500, tool calls 5000, model inputs 5000, context selections 2000, permission decisions
5000, report validations 2000, memory snapshots 2000 — and adds the clause that decides this record's
retention design: **"the trim MUST take effect in the same durable operation that records the entry, so
a reader never observes more than the cap and never observes a partly applied trim"**, together with
the same retain-enough-to-say-it obligation.

`REQ-TOOLS-027` and `REQ-TOOLS-076`: every resolved decision is recorded, allows included; a raising
audit sink logs a warning and **never breaks dispatch**. `REQ-TOOLS-080` and `REQ-TOOLS-176`: entries
land under the session whose call was decided and never another's; a decision taken outside every
registered session writes **no entry and reports no error**. `REQ-TOOLS-079`: a decision entry carries
exactly eleven listed fields and, beyond the redacted command facet inside `summary`, **no argument
values at all**; `REQ-TOOLS-082`'s mode-change entry always carries `skipped_personas`, present even
when empty.

`REQ-TOOLS-081` fixes per-entry side effects: a deny records a `permission_denied` issue with a named
severity, actor, message shape, metadata, and an evidence reference "locating the decision in the
permission audit, on the `<record kind>#<record id>` pattern `REQ-EVENTS-056` fixes"; a `user-once` or
`user-session` approval emits a `permission_approved` timeline event; every entry publishes
`permission.decision` on the session event bus. `REQ-EVENTS-072` binds that event to the audit entry and
now instructs the mechanism: where the store can make the durable record and the event one indivisible
step, **it must**.

Several agents in one session decide calls concurrently and every entry must land in decision order, so
a single serialised writer per session is the only straightforward way to satisfy the ordering and the
ring rule together. `REQ-SHELL-107` adds a **second producer**: user terminal input is not an agent tool
call — it bypasses permission patterns but is written to the session's permission audit as
user-originated input, redacted, one entry per submitted line, with control sequences flushing the
pending line, navigation keys unlogged, and a held key not flooding the record.

### What the audit now has to prove, and to whom

The permission audit is a **security record**, and the amended specification says what that obliges in
three places rather than leaving it to this record.

`REQ-SESSION-137` states the two properties and where they must remain visible: "The audit is
append-only in the sense a reader may rely on: a recorded decision is never altered or removed except by
the retention cap of `REQ-SESSION-133`, and entries stand in the order the decisions were taken. **Those
two properties MUST be evident in what the export of `REQ-SESSION-199` produces**, because an audit only
this application can read is a materially weaker audit."

`REQ-SESSION-199` mints that export over the timeline, the issues record, the metrics document and the
permission audit, and binds it three ways: it is **not a channel**; **the audit exports as an audit** —
"every entry in the order the decisions were taken, none omitted, and, where the retention cap of
`REQ-SESSION-133` has dropped earlier entries, a statement that it has and how many, so a capped audit
can never be mistaken for a complete one"; and **it exists to be checked against** — "the export is what
lets a user who does not trust that rendering read the record for themselves; an export that summarised,
reordered or filtered what the surface shows would defeat the only reason it exists".

`REQ-EVENTS-166`, the single definition of what any such export must guarantee, states the general rule
in its third obligation: "whatever ordering, append-only character, or completeness the record has where
it is stored MUST be evident in what is exported … because an export a reader cannot check against what
the record claims to be is decorative", and names the permission audit as "the case that decides the
shape of the rule". `REQ-SANDBOX-112` reaches the same place from the confinement side: a user must be
able to read the audit outside this application "so a confinement decision can be checked without
trusting this application's own account of it".

**Under SR-4's principle these records belong in the database**, because `REQ-EVENTS-163` is explicit
that only this product reads them and that the three per-session evidence records are distinct contracts
whose figures are not comparable with one another. What must not move is the record's **character** —
append-only, ordered, immutable — and what SR-6 added is that the character must survive the move in a
form a user can inspect.

## Alternatives considered

**A — Keep the line-delimited files.** *This record's own previous decision, preserved as the
alternative it now is.* Its case was `REQ-TOOLS-078` fixing the audit as a workspace-observable artifact
at a fixed path with byte-level properties, and the objection that a database would either be a cache
for a file that is already the contract, or would not exist between reads.

SR-4 reverses the premise the first half rested on — nothing outside this product reads the audit, so
"workspace-observable artifact" was a property of the reference product's shape rather than of a
consumer this product has — and `REQ-TOOLS-078` has since been amended to stop fixing a location at all.
SR-6 answers the second half without reinstating the file: the user gets a document, on demand, that
carries the record's properties with it.

**What the file cost is now measured rather than asserted**, and the measurement is cited as **history**
— it documents the design SR-4 replaced, not a rule to carry forward.
`../spikes/windows-writer-handle-compaction.md` shows that a compaction which renames a staged file over
a target the writer holds open for append fails on **200/200 attempts** with `EPERM`, and that the
blocker is the replace-by-rename mechanism rather than the open's share mode (§3.1, §3.2). That result
applies to these records by construction, because they used the same compaction mechanism. The
consequence is worse here than for the event history, and specifically because of a requirement in this
record's own context: every write on this path is best-effort with respect to the caller
(`REQ-TOOLS-027`, `REQ-TOOLS-076`), so **a failing compaction is silent by construction** — the ring
would never trim and the record would grow without limit behind a repeating warning while dispatch
carried on undisturbed. That was consequence 5 of the previous record and it remains the strongest
single argument against the file.

**Two honesty notes about that evidence.** The spike states in terms that it did **not** exercise
`permissions.jsonl` or `verification-gate.jsonl` separately and that this record must not cite its
21.5 ms and 29.8 ms compaction figures as if it had (§6, §8). It does not. And the spike raised a
conformance question it could not settle: `REQ-EVENTS-091` explicitly tolerates a failed trim, while
`REQ-TOOLS-078` states the ring as an invariant with no such clause, so a failed compaction left the
audit over its cap with no requirement authorising that state. **That question is closed by the store
change and by the amendment together** — see the retention section — and it is recorded here so that the
closure is visible rather than the question simply disappearing.

**B — Rows of typed columns, with no stored serialised entry.** The obvious relational shape and the
cheapest. Rejected for the audit specifically. `REQ-TOOLS-078` promises every retained entry "exactly as
it was recorded — every field, adding nothing and dropping nothing", and while that clause exists to
promise *immutability* rather than a byte contract with an outside consumer, `REQ-SESSION-199` now
requires the export to carry that property to a reader who does not trust us. Typed columns alone would
make "never altered" a claim about our code rather than about what is stored, and would make the
exported entry a re-serialisation of a decoded copy — the shape `REQ-EVENTS-104` forbids for the event
history for exactly this reason.

**C — One evidence table with a kind discriminator.** Fewer objects, one ring implementation. Rejected:
`REQ-SESSION-133` fixes **seven** caps and `REQ-TOOLS-078` and `REQ-TOOLS-190` two more, so the ring
would need a per-kind window over a shared table on every insert, which is more work and more subtle
than a per-kind ordinal. The field sets differ too — `REQ-TOOLS-079`'s eleven fields,
`REQ-TOOLS-082`'s mode-change shape, `REQ-TOOLS-190`'s nine — so a shared table would be a shared
payload column with nothing shared above it.

**D — One append-only table per evidence kind, holding both the serialised entry and the columns a
query needs, behind one serialised writer per session, with the ring's own state exported beside the
entries.** Chosen.

## Decision

One writer object per session per evidence kind, in the run host, held by a run holding that session's
**lock row** (ADR-0005), sharing the serialised queue of the `SessionWriter` of ADR-0008 — which is
already the thing that puts concurrent deciders into decision order, and is what makes mode-change
entries interleave in the same stream as decisions (`REQ-TOOLS-082`). ADR-0058's table-ownership rule
reaches the same place from the store's side: no table has two writer processes, and only the run host
writes a session's rows.

### What an entry is

- **The serialised entry itself, verbatim** — the JSON object the requirement's field inventory
  describes, produced by the same serialiser the event history uses (compact, keys sorted), stored as
  written. This is what makes `REQ-TOOLS-078`'s "exactly as it was recorded" literally true rather than
  paraphrased, and it is what the export emits. The event history makes the same choice for a different
  reason: there it is wire identity (`REQ-EVENTS-080`), here it is tamper evidence.
- **A per-session `ordinal`**, assigned by the writer inside the transaction that inserts the row, from
  a counter that is never reset for the life of the session. This is what "in the order the decisions
  were taken" and "a suffix of the history in write order" become; it is what enforces "no entry is ever
  inserted ahead of an entry already present" — under a file that was a property of append, under a
  table it must be a property of a monotonic counter no other code may set; and it is what the export
  carries so that a reader can check both properties for themselves. **The ordinal is not reused after a
  displacement**, which is the whole basis of the completeness arithmetic below.
- **Columns a query needs** — timestamp, session, agent, persona, tool, decision, rule, source, and the
  entry kind — derived from that same value at write time, so any diagnostics view is a query rather
  than a scan. As in ADR-0009, **the stored entry governs**: a column is an index, may never be read
  back in place of the entry, and may never be exported instead of it.

### How append-only is enforced, and why it is stronger than the file gave

`REQ-TOOLS-078`'s "once recorded, an entry's content is never altered" was, under a file, a promise
about what our code chose not to do; anything holding the file could have rewritten it. Under a table it
is enforced in three places:

1. **The data layer exposes no update path for these tables.** Two statements exist: insert, and the
   ring's delete-oldest. There is no third.
2. **The store rejects an update.** A trigger on each audit and evidence table that refuses `UPDATE`
   makes "never altered" a property of the store rather than of code review. This is the concrete sense
   in which the record's append-only character is *at least as strong as before*.
3. **The ordinal is assigned in one place**, inside the insert's transaction, from the session's own
   counter, so an entry cannot be given a position ahead of one already present.

**Ordering is the writer's serialised queue, not the store's isolation.** A transaction gives atomicity
and isolation; it does not give decision order, and `REQ-TOOLS-078` orders entries by the order the
decisions were taken. `REQ-EVENTS-098` now states the general rule for us: serialisation is required
"even where the store's own guarantees already make two writers unable to corrupt one another, because
what is at stake is emission order".

### Retention: the ring for a table

**The displacement happens in the same transaction as the insert**, and this is no longer a choice this
record makes on cost grounds. `REQ-SESSION-133` requires it: the trim "MUST take effect in the same
durable operation that records the entry, so a reader never observes more than the cap and never
observes a partly applied trim". `REQ-TOOLS-078` states the same shape as per-entry displacement. Under
a file that was unaffordable — a rewrite is O(file) — so the previous record used a hysteresis margin and
compacted in batches, which was an approximation of the requirement rather than the requirement. A
delete of one row by ordinal is O(1), so **the table implements the rule as written**, and the ring can
never be observed above its cap.

That is a deliberate difference from the event history, and the difference is in the requirements rather
than in taste: `REQ-EVENTS-091` *states* a permitted headroom of `cap ÷ 8`, permits a history to sit
above its cap, and tolerates a failed trim as "a bounded and visible cost"; `REQ-TOOLS-078`,
`REQ-TOOLS-190` and `REQ-SESSION-133` state no headroom, permit none, and require the trim inside the
recording operation. ADR-0009 accordingly runs the event-history trim as its own transaction after the
append, and this record runs the ring displacement inside the insert. **The two stores are not unified
on this point and should not be.**

**The conformance question the spike raised is closed by that pairing.** Because insert and displacement
are one transaction, a failed trim is a failed insert: either both happen or neither does. There is no
state in which entries keep being accepted while the ring stops trimming, so `REQ-TOOLS-078`'s
unqualified invariant has no failure mode left that would put the record over its cap.

`REQ-SESSION-133`'s seven caps are seven values in one policy table, applied by one ring implementation.
`REQ-TOOLS-190`'s verification-gate record uses the same writer with its own kind and its own 5000 cap,
so the ring logic is written once; `REQ-EVENTS-177` deliberately keeps that record out of the event
catalogue, so it has no wire counterpart and none should be added. An **uncapped** kind inserts and
never deletes; the timeline is such a kind.

**Every displacement adjusts the maintained counts.** `REQ-SESSION-139` requires the metrics document's
counts to be taken "over the entries the evidence records still hold after the retention caps of
`REQ-SESSION-133` have been applied", and ADR-0008 maintains those counts rather than recomputing them,
because with the persistence debounce withdrawn a per-save aggregate query would sit on every save. The
displacement is where a maintained count must be decremented, and it is in the same transaction as the
insert that caused it, so the counts can never disagree with the rows. **`REQ-SESSION-133`'s new
retain-enough-to-say-it clause is a second counter maintained in the same place**: the cumulative number
of entries the cap has dropped, per kind, never reset — which is what the export needs and what
`REQ-SESSION-199` obliges the export to state.

### How the export carries the record's integrity properties

`REQ-SESSION-137`, `REQ-SESSION-199` and `REQ-EVENTS-166`'s third obligation all require the audit's
ordering and append-only character to be **evident in what is exported**. An export that merely emits
entries in the right order asserts the property; it does not evidence it. Four things make it checkable,
and they are the substance of this decision:

1. **The stored entry, verbatim, and nothing derived.** Each exported entry is the stored serialised
   object, byte for byte, never rebuilt from the query columns (`REQ-TOOLS-078`, and the same rule
   `REQ-EVENTS-080` and `REQ-EVENTS-104` state for the event history). A reader comparing an exported
   entry against what a surface rendered is comparing against the record and not against a second
   rendering of it — which is the whole point `REQ-SESSION-199` makes when it says the export "exists to
   be checked against".
2. **The ordinal travels with the entry.** Order stops being a property of the file's line order — which
   a reader must take on trust — and becomes a value in each entry that a reader can sort by, check for
   contiguity, and compare between two exports taken at different times. A reordering is visible; a
   silently removed entry is visible as a hole.
3. **The ring's own state travels with the export**: the cap in force, the cumulative count of entries
   the cap dropped, and the ordinal of the oldest retained entry. That turns `REQ-SESSION-199`'s
   "a statement that it has and how many" from a sentence into an **arithmetic a reader can perform**:
   for a record whose ordinals start at 1, the oldest retained ordinal minus one must equal the dropped
   count, and the retained ordinals must be contiguous from there to the newest. If the two disagree,
   entries left the record by some route other than the cap — which is exactly the failure
   `REQ-TOOLS-078`'s append-only promise exists to exclude, and which no amount of ordering in the
   emitted list would reveal on its own.
4. **Decisions and mode changes export interleaved, in the one ordinal series.** `REQ-TOOLS-082`'s
   guarantee is that a reader working through the record in order recovers which mode governed any
   decision from the nearest preceding mode-change entry. An export that split the two kinds into
   separate lists, or that emitted them in two passes, would destroy that property while preserving
   every individual entry. They are one record and they export as one.

**What the export does not prove, stated so it is not overclaimed.** It is produced by this application
from this application's store, so it is not an attestation against an adversary who has the store; it
cannot show that an entry was never written. No requirement asks for one, and inventing a signature
scheme here would be architecture the specification did not order. What it does give is what
`REQ-SESSION-199` asks for: a user who distrusts the interface can read the record itself, check its
order and its completeness against its own declared figures, and diff two exports taken at two moments.

**The export is not a channel** (`REQ-SESSION-199`, `REQ-SESSION-071`). It is a user-initiated action
producing a file, available whether or not the session is live, writing nothing to the session's record
and pausing no run. Where a session holds no entries of a kind it produces an empty record of that kind
rather than nothing at all, so absence is distinguishable from failure — which is `REQ-SESSION-132`'s
never-a-placeholder rule surfacing on the read side.

### The side effects, and `REQ-EVENTS-072`

The three per-entry side effects of `REQ-TOOLS-081` — the `permission_denied` issue, the
`permission_approved` timeline event, the `permission.decision` wire event — are raised by the same call
that writes the entry, and **the two durable ones commit in the same transaction as the entry itself**.
The wire event is forwarded only after that transaction commits. `REQ-EVENTS-072`'s "a run killed
between the two MUST leave a record with no event, never an event with no record" therefore stops being
an ordering the writer must keep and becomes one it cannot violate — which is what the requirement now
instructs rather than permits.

`REQ-TOOLS-081`'s evidence reference has been amended and no longer names a file: it is the
`<record kind>#<record id>` locator `REQ-EVENTS-056` fixes, which resolves to the audit entry — its kind
and its ordinal — and is what makes the issue's pointer followable by the diagnostics surface and by a
reader of the exported issues record. The previous form of this record reported that for amendment; the
amendment has landed and the reinterpretation is no longer this record's to make.

### Failure

Every write is best-effort with respect to the caller: a failure logs a warning and returns, and the
decision, the mode change or the keystroke proceeds regardless (`REQ-TOOLS-027`, `REQ-TOOLS-076`,
`REQ-SESSION-175`). Failures are counted so a persistently failing store becomes a **session issue**
rather than a silent hole.

**The silent-failure mode alternative A had to name is gone.** Because the displacement is part of the
entry's own transaction, a trim cannot fail while entries keep being accepted. The specific defect the
previous record carried — a rename failing on every attempt on Windows, producing a warning and a
counted failure and nothing else while the ring never trimmed and the file grew without limit — has no
mechanism left.

## Consequences accepted

1. **Retention is O(1) per entry and runs inside the entry's transaction**, so it no longer needs to be
   kept off a latency-budgeted path. The previous consequence — compaction is O(file) and must not sit
   on such a path — is withdrawn with the compaction. Under ADR-0002 the writer is still in the run
   host, off every interface thread.
2. **The 5000-entry cap is per kind, not per session-day, so a long session loses its early history.**
   That is specified (`REQ-TOOLS-078`, `REQ-TOOLS-190`, `REQ-SESSION-133`), and it must be visible to
   whoever builds a diagnostics view or reads an export, or a truncated history is presented as a
   complete one. `REQ-SESSION-199` closes that for the exported audit by requiring the drop count to be
   stated; the same obligation must reach any in-application rendering.
3. `REQ-TOOLS-080`'s "a decision taken outside every registered session writes no entry and reports no
   error" means the writer must be **absent**, not failing, in that case — the code path is a no-op, not
   a swallowed error.
4. **Terminal-input entries cross a process boundary before being written**, so they are ordered against
   permission decisions by arrival at the writer's queue. `REQ-TOOLS-078` orders entries by the order the
   decisions were taken; for user input there is no competing definition, and arrival order is the honest
   one. A reader of the export sees them in one ordinal series with the decisions, which is what
   `REQ-SHELL-107` intends.
5. **The audit shares a corruption domain with every other session in the workspace.** Under files a
   damaged audit cost one session's; a damaged workspace store costs every session's. For a security
   record that is worth stating plainly rather than leaving to SR-4's general note. The bound is that the
   database is scoped per workspace; there is no per-session bound left. **The export is the only copy a
   user can hold outside that domain**, and under `REQ-SESSION-198`'s machine-local store it is also the
   only copy that travels with a backup of the workspace — which SR-9(b) mints a requirement for and
   which makes the export's availability a durability property and not only a transparency one.
6. **The "a human can no longer read it" gap is closed for four records and open for the rest, and the
   line between them is principled rather than accidental.** `REQ-SESSION-199` and `REQ-SESSION-191`
   close it for the timeline, the issues record, the metrics document and the permission audit, and
   `REQ-SESSION-191` keeps the file-manager reveal for the log, the summary and the artifact bodies
   (`REQ-SESSION-002`). What has **no** export is the verification-gate record of `REQ-TOOLS-190` and the
   remaining ring-capped evidence kinds of `REQ-SESSION-133` — the tool-call, model-input,
   context-selection, report-validation and memory records.
   - For the **tool-call evidence** that is right and should stay so. `REQ-SESSION-136` keeps the
     unredacted arguments in that record deliberately, "so what an agent was actually asked to run stays
     auditable even though it is never put on the wire", and `REQ-EVENTS-163` warns that the three
     evidence records are distinct contracts. An export of it would be a secret-disclosure surface. The
     audit exports safely for the opposite reason: `REQ-TOOLS-079` gives an entry **no argument values at
     all** beyond the redacted command facet inside `summary`.
   - For the **verification-gate record** it is a decision rather than an omission — `REQ-TOOLS-190` now
     states positively that "only this application reads it is why it is a record rather than a file the
     user is offered" — but it sits against SR-6's own reasoning, because under the file design a user
     could read it, and it carries no argument values that would make an export unsafe.
     **The list has already been extended once for exactly this reason and the extension has not
     landed.** SR-9(a) ruled that improvement artifacts and delivery records gain an export "on the same
     terms as the four in SR-6", having found that SR-6's argument reached them identically; no
     requirement mints either yet. So the export list is being drawn case by case against one argument
     rather than by applying the argument once. **Reported as a concern, not corrected here** — this
     record does not own any of the three records concerned, and inventing an export for one of them
     would be minting a requirement.
7. **This record has no remaining position on where these records live on disk, and that is the point.**
   `REQ-TOOLS-078` and `REQ-TOOLS-190` have both been amended to fix no path, file name or directory, so
   the coupling between this record's design and a layout is gone in the specification and not only in
   the architecture.

## Unresolved conflict between slices

**UI proposed that terminal-input audit logging "happens on the input side, in the main process".** That
contradicts two decisions and one requirement, and SR-1 narrows the disagreement without settling it.
`REQ-EVENTS-098` makes the right to write a session's history exactly the right to hold its lock, and
ADR-0002 keeps the lock in the run host; `REQ-TOOLS-078`'s ordering and immutability rules require
**one** writer per kind per session, and two producers writing from two processes would break both.

- **UI's position:** main owns the terminal input path and writes the entry there, and "it must not be
  possible for the renderer to write the audit log directly".
- **EXEC's position, adopted:** both producers go through the same writer in the run host. The
  renderer's submitted line is redacted through the shared pass of ADR-0007 and forwarded — main relays,
  the run host writes.

UI's underlying concern is satisfied by the adopted position and more strongly than before: the renderer
is sandboxed, has no filesystem, and now has no database connection either (ADR-0044). The disagreement
is only about which process holds the pen, and the lock rule settles it. **Under SR-1 the two processes
are main and the run host inside one instance** rather than two rival instances, which removes the
multi-instance framing from the argument but not the argument: one writer per kind per session is still
what the ordering and immutability rules require, and under `REQ-SESSION-199` it is additionally what
makes the exported ordinal series meaningful.

## Revisit if

A requirement adds a query over the audit that the stored-entry-plus-columns shape cannot serve without
decomposing the entry, which would reopen alternative B and would need the tamper-evidence question
answered explicitly rather than by default. Or a consumer outside this product is given a contract over
the audit, which would put a byte format back on the **write** path and reopen alternative A — note that
`REQ-SESSION-199`'s export deliberately does not do this, because it is a file a user asks for and never
an interface anything is built on. Or the verification-gate record gains an export under SR-6's
reasoning, in which case it uses the same four mechanisms as the audit and this record needs no new
decision, only the wiring. Or a requirement asks the audit's integrity to be provable against someone
who has the store, which is a different problem from the one this record solves and would need a
mechanism no ruling has yet authorised.
