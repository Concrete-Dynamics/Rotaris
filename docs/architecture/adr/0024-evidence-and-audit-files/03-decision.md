# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — Decision

Part 3 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

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

**That O(1) is a complexity argument and not a measurement, and the record should say which.** What has
been measured is the neighbouring claim — that a third statement inside this transaction is cheap — and
the measured third statement was an `UPDATE` by primary key rather than a `DELETE`; see *The side effects,
and `REQ-EVENTS-072`*. Nothing has priced the displacement itself.

That is a deliberate difference from the event history, and the difference is in the requirements rather
than in taste: `REQ-EVENTS-091` *states* a permitted headroom of `cap ÷ 8`, permits a history to sit
above its cap, and tolerates a failed trim as "a bounded and visible cost"; `REQ-TOOLS-078`,
`REQ-TOOLS-190` and `REQ-SESSION-133` state no headroom, permit none, and require the trim inside the
recording operation. ADR-0009 accordingly runs the event-history trim as its own transaction after the
append, and this record runs the ring displacement inside the insert. **The two stores are not unified
on this point and should not be.** ADR-0004 previously generalised this record's arrangement to the event
history as well, ADR-0009 disputed it, and neither settled it; **it is settled as of 2026-09-02 in ADR-0009's
favour**, on the ground that `REQ-EVENTS-088` makes a rolled-back trim a *sticky recording failure* that
would end the history rather than costing one event. Nothing about this record's side changes; what changes
is that the divergence is now decided rather than recorded.

**The conformance question the spike raised is closed by that pairing.** Because insert and displacement
are one transaction, a failed trim is a failed insert: either both happen or neither does. There is no
state in which entries keep being accepted while the ring stops trimming, so `REQ-TOOLS-078`'s
unqualified invariant has no failure mode left that would put the record over its cap.

**The price of that pairing, stated because this is a security record.** It is the mirror image of the
event history's: there a failed trim leaves the history over its cap and loses nothing, here a failed trim
loses the entry that was being recorded. That is not a defect introduced by this design — `REQ-TOOLS-027`
and `REQ-TOOLS-076` already make every audit write best-effort with respect to the caller, so an entry that
cannot be written is lost and dispatch proceeds either way — but the shared transaction adds one route to
it. Two things follow and both are handled: the failure is counted, so a persistently failing store becomes
a session issue rather than a silent hole (see *Failure*); and **an entry lost this way is invisible to the
export's completeness arithmetic**, because the ordinal is assigned inside the transaction and a rollback
un-assigns it, leaving the series contiguous. That is the concrete case behind the limit stated under *What
the export does not prove*: the arithmetic detects entries that **left** the record and cannot detect one
that never landed.

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

### The export boundary, and the one line that must never move

This is a security property, and the reason it needs a mechanism rather than a rule is that **nothing about
exporting the tool-call evidence would look like a mistake.** It is an evidence kind beside four others; it
has a ring, an ordinal, a serialised entry and a drop count exactly as they do; a diagnostics surface
renders it; a user could plausibly ask for it. Every argument that produced the other exports — SR-6's "a
straight reduction in what a user owns about their own runs", `REQ-SESSION-133`'s retain-enough-to-say-it
clause, `REQ-SESSION-191`'s file-manager reveal no longer reaching a row — applies to it word for word. The
*only* thing that distinguishes it is its **content**, and content is invisible at the moment someone is
adding a menu item.

**Four mechanisms, in the order in which they would have to fail.**

**1. The redaction-safety test lives on the write path, not the export path.** The audit exports safely
because `REQ-TOOLS-079` gives an entry no argument values — a property of what the writer put in the row,
which the exporter cannot inspect and must not try to. So the writer for each kind validates its entry
against that kind's closed field inventory before insert: `REQ-TOOLS-079`'s eleven fields plus the
conditional `request_id`, `REQ-TOOLS-082`'s mode-change shape with `skipped_personas` always present, and
`REQ-TOOLS-190`'s nine. **A field the inventory does not name is a fault, not a passthrough.** This looks
like ordinary schema hygiene and it is the load-bearing half of the boundary: the accident this defends
against is not someone exporting the tool-call record, it is someone adding `args` to an *audit* entry for
debugging, after which the audit's existing, blameless, already-shipped export becomes a disclosure surface
with no change to any export code. `REQ-TOOLS-079` states that consequence itself — such a change "would
withdraw the audit's export with it" — and a validation that fails loudly is what makes a requirement's
"would" into something a build notices.

**2. Export reachability is structural, not a value.** Alternative D is the version of this that fails. The
tool-call evidence table is reached through the diagnostics reader and the store backup and by nothing
else; **there is no exporter object that can name it**, and adding its export is therefore writing one, not
setting one. `REQ-SESSION-133`'s remaining ring kinds — model inputs, context selections, report
validations, memory snapshots — sit on the same side of that line. They have no export today for the same
reason the tool-call record has none, and if the redaction-safety test is later applied to one of them and
it passes, the work is to write it an exporter, which is exactly the amount of deliberation
`REQ-TOOLS-190`'s "settled by applying the test above to that record's own content" is asking for.

**3. No export resolves a reference into the record it names.** This is the leak that does not require
anyone to intend anything, and the specification has already met it once: `REQ-LIBRARY-176` requires the
improvement export not to resolve an evidence entry's `source_session_id`, `source_artifact_id` or
`source_task_id`, "because a session's tool-call evidence deliberately holds unredacted arguments and never
gains an export of its own … An export that followed those ids would become the export that record is
denied." **The same hazard is inside a record this decision owns.** `REQ-SESSION-136` files outcome-driven
issues — `terminal_shell_failure`, `terminal_suspicious_success`, `terminal_timeout`, `tool_error` — "each
referencing the tool-call record", and `REQ-SESSION-135` gives every issue an `evidence_ref`. So **the
exported issues record is full of pointers into the record that must never be exported**, and a
helpful-looking change that inlines what a pointer names — to make the export self-contained, which is a
virtue everywhere else — is the disclosure. The rule: **a locator exports as the opaque
`<record kind>#<record id>` string `REQ-EVENTS-056` fixes, and an exporter never dereferences one.** It is
followable inside the application and inside another export of the same kind; where the kind has no export,
it names something the user must come back to the application to see, and that is the intended outcome
rather than a defect to fix.

**4. Four documents, never one.** `REQ-SESSION-199` requires each of its four records to be obtainable as a
file, and `REQ-EVENTS-163` requires that where exports exist "they are as distinct as the records behind
them and MUST NOT be presented as one document or reconciled against each other". A single
"export this session" artifact is the other natural simplification, and it is the one that would pull an
unexportable kind in by completeness rather than by decision. It is refused by requirement, and this record
names the reason so the refusal is not mistaken for fussiness.

**What the boundary is not, stated so nobody reads it as broader than it is.** Unredacted tool arguments
**do** leave this machine under `REQ-SESSION-201`, because the whole-store backup is the store whole and
necessarily carries them; the requirement says so and obliges the product to convey it where the action is
offered. That is not an inconsistency and must not be cited as precedent for widening an export. The
distinction the specification draws is between **readable material handed to other software** and **an
artifact only this product can put back**: an export "is a record rendered so that software knowing nothing
about this product can read it"; a backup "is the store rendered so that this product can put it back, and
discharges nothing about readability". The tool-call evidence may travel in the second and never in the
first. A future reader who notices the backup and concludes the export prohibition is already porous has
found the two artifacts' purposes, not a hole.

### How the export carries the record's integrity properties

`REQ-SESSION-137`, `REQ-SESSION-199` and `REQ-EVENTS-166`'s third obligation all require the audit's
ordering and append-only character to be **evident in what is exported**. An export that merely emits
entries in the right order asserts the property; it does not evidence it — and `REQ-EVENTS-166` states the
consequence: "an export that a reader cannot check against the record it claims to be is decorative."

**Form: one JSON document per record kind, pretty-printed with sorted keys and a trailing newline, with a
header and an entries array.** Nothing fixes the encoding — `REQ-SESSION-199` and `REQ-TOOLS-078` require
only that it "yields every field of every entry to a stock parser on a machine carrying none of this
product's code" — so this record chooses, and chooses against the line-delimited form the event history
uses. Two reasons, both about the obligations rather than about taste. The ring's own state has nowhere to
live in a pure line stream except as a line that is not an entry, which is the shape `REQ-EVENTS-172`
forbids for the history's export and which a reader would have to be told about out of band. And
`REQ-SESSION-199` requires a kind with no entries to export "an empty record of that kind rather than
nothing at all, so that absence is distinguishable from failure" — a document with an empty array does
that; a zero-byte file is exactly what a failed write also produces.

Five things make the record's properties checkable, and they are the substance of this decision:

1. **The stored entry, verbatim, and nothing derived.** Each exported entry is the stored serialised
   object, byte for byte, never rebuilt from the query columns (`REQ-TOOLS-078`, and the same rule
   `REQ-EVENTS-080` and `REQ-EVENTS-104` state for the event history). A reader comparing an exported
   entry against what a surface rendered is comparing against the record and not against a second
   rendering of it — which is the whole point `REQ-SESSION-199` makes when it says the export "exists to
   be checked against".
2. **The ordinal travels *beside* the entry, and the distinction is not pedantry.** Order stops being a
   property of the file's line order — which a reader must take on trust — and becomes a value a reader can
   sort by, check for contiguity, and compare between two exports taken at different times. A reordering is
   visible; a silently removed entry is visible as a hole. But `REQ-TOOLS-079` fixes the decision entry's
   field set exactly and `REQ-TOOLS-078` promises every retained entry "exactly as it was recorded — every
   field, adding nothing and dropping nothing", so **the ordinal may not be merged into the entry object**:
   doing so would add a field to the thing whose fidelity the export exists to demonstrate, and a reader
   comparing an exported entry against the eleven fields the specification lists would find twelve. Each
   element of the array is therefore the position and the entry as two members, the entry object untouched
   and byte-identical to what was stored. The same discipline is what keeps a query column out of an export
   (`REQ-EVENTS-080`'s rule, adopted in *What an entry is*).
3. **The ring's own state travels with the export, in the header**: the cap in force, the cumulative count
   of entries the cap dropped, the ordinal of the oldest retained entry and of the newest. That turns
   `REQ-SESSION-199`'s "a statement that it has and how many" from a sentence into an **arithmetic a reader
   performs with a stock parser and no trust in us**:

   > `dropped + retained == newest ordinal`, and the retained ordinals are contiguous from
   > `oldest` to `newest`, and `oldest − 1 == dropped`.

   Every term is in the document. The identity holds because the ordinal comes from a counter that is never
   reset for the life of the session and **is never reused after a displacement** — which is why that clause
   is stated in *What an entry is* rather than left as an implementation detail. If the arithmetic fails,
   entries left the record by some route other than the cap: exactly the failure `REQ-TOOLS-078`'s
   append-only promise exists to exclude, and one that no amount of ordering in the emitted list would
   reveal on its own. This is the concrete answer to `REQ-EVENTS-166`'s "decorative" — an export a reader
   can only read is decorative; an export a reader can *audit against its own declared figures* is not.
4. **Decisions and mode changes export interleaved, in the one ordinal series.** `REQ-TOOLS-082`'s
   guarantee is that a reader working through the record in order recovers which mode governed any
   decision from the nearest preceding mode-change entry. An export that split the two kinds into
   separate lists, or that emitted them in two passes, would destroy that property while preserving
   every individual entry. They are one record and they export as one. `REQ-SHELL-107`'s terminal-input
   entries are in the same series for the same reason (consequence 4).
5. **A live session exports what it had at one instant, and says which.** `REQ-SESSION-199` requires the
   export whether or not the session is live, and `REQ-EVENTS-166` that "a live session exports its record
   as it stands at the moment the action was taken". The read runs in one transaction, so the entries and
   the header figures come from one consistent state — otherwise the arithmetic above could fail on a
   perfectly healthy record simply because a displacement landed between reading the entries and reading
   the drop count, and a user checking a security record would be handed a false alarm by the exporter.
   The header carries the instant the export was taken, which is also what makes `REQ-SESSION-199`'s
   "diff two exports taken at two moments" a defined operation rather than a hopeful one.

**The ordinal is also the audit entry's record id, and that is this record's choice rather than the
specification's.** `REQ-TOOLS-081` requires a denial's issue to carry an evidence reference "locating the
decision in the permission audit, on the `<record kind>#<record id>` pattern `REQ-EVENTS-056` fixes", and
`REQ-EVENTS-056` requires that locator to work "whether the consumer reads it through this application or
through the export of that record kind". So the locator is a **cross-export contract**: a reader holding the
exported issues record must be able to resolve it against the exported audit, on a machine with none of our
code. `REQ-EVENTS-056` fixes the form for issues only — `issues#` plus the issue's twelve hexadecimal
characters — and no requirement fixes a record-kind token for the audit or an id form for its entries. This
record fixes both: **the id is the ordinal**, which is already the thing the export carries and already the
thing a reader can check for contiguity, so the locator and the completeness arithmetic are the same value
serving twice; and the record-kind tokens are one enumeration shared by the writer, the locator and every
exporter, so a token cannot drift between the record that emits a reference and the record it points into.
Two things follow that a later reader should not have to rediscover. The token set is part of the export
contract even though no requirement lists it, so renaming one breaks exports already in users' hands. And if
the specification later fixes tokens, ours must match rather than the other way round — this is a gap being
filled, not a decision being taken.

**What the export does not prove, stated so it is not overclaimed.** It is produced by this application
from this application's store, so it is not an attestation against an adversary who has the store; it
cannot show that an entry was never written. The arithmetic above detects entries that *left* the record by
some route other than the cap; it cannot detect an entry that was never inserted, because the ordinal series
would simply be one shorter and still contiguous. No requirement asks for more, and inventing a signature
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

**And it is free, which is now measured rather than assumed.**
`../spikes/commit-on-the-publish-path.md` §5.2 priced exactly this shape: the step from a transaction
holding one insert to the same transaction holding **two** inserts cost **−4 to +31 µs at p50** — inside
the noise — at both 0 and 10,000 pre-existing rows, over 3,000 commits per arm. Adding a third statement,
a narrow `UPDATE` by primary key, cost a further **+46 to +59 µs at p50**, and widening that `UPDATE` to
rewrite a 68 KB column added only **4–8 µs** on top. The whole three-statement transaction committed at
**p50 185 µs, p95 363 µs** at `synchronous = NORMAL`.

Two qualifications, because this record's transaction is not literally the measured one. **The
displacement is a `DELETE`, and no delete was measured** — the third statement in the measured shape was
an update by key, so the figure above is the nearest evidence for "a third statement in this transaction
is cheap" and is not a measurement of the ring. And the measured store carried no trigger; this record's
`UPDATE`-refusing trigger (see *How append-only is enforced*) fires on no statement the writer issues, so
it should cost nothing, but that is inference.

**What the figures license and what they do not.** They license retiring the idea that pairing the entry
with its issue and its timeline event is a cost to be justified: it is not. They do **not** license
widening the transaction on the strength of "statements are cheap" — every statement adds write-ahead-log
frames, and the store's automatic checkpoint fires on a frame count rather than a commit count, so a wider
transaction moves the periodic 9–11 ms checkpoint commit closer together for **every** writer sharing the
store (ADR-0009 consequence 11). The audit is a low-volume writer on a write-ahead log dominated by the
event history; it inherits that periodic cost and contributes little to it, and that asymmetry is a reason
to keep it that way.

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

**But a different silent mode exists, and this record must not assume the open is where a store failure
surfaces.** `REQ-EVENTS-084` refuses a run whose store cannot be opened and says in terms that it "governs
opening the store only"; `REQ-EVENTS-088` governs a write failing during a run. Measured, there is a state
between them: `../spikes/remote-and-synchronised-storage.md` found a store that **opened successfully,
reported and read back `journal_mode = WAL`, owned a 32 KiB `-shm`, and then threw `SQLITE_IOERR_IN_PAGE`
on the first statement afterwards — 30 opens out of 30** — and, if the throw was swallowed, then completed
6,000 of 6,000 commits with no rows lost. **No pragma read-back detects this; only a write does.**

**Why that lands harder here than anywhere else in the record.** Every write on this path is best-effort
with respect to the caller by requirement (`REQ-TOOLS-027`, `REQ-TOOLS-076`) — a failed audit write logs a
warning and dispatch proceeds. So a store that opens and does not work does not refuse a run, does not
raise, and does not stop anything: **it produces a run whose permission decisions were all taken and none
recorded**, behind counted warnings. That is the security record's worst failure mode and it is reached
without anything malfunctioning visibly. The event history, by contrast, is protected by
`REQ-EVENTS-088`'s sticky rule, which at least makes the instant of failure a single reportable fact.

**The specification gap is being closed elsewhere and is not this record's to fix.** What this record owes
is stated rather than assumed: the failure counter of the paragraph above is the only thing standing
between this state and silence, so **it is load-bearing rather than diagnostic**, and the session issue it
raises must be raised on the *first* failure of a run rather than on a threshold. A security record that
recorded nothing for a whole session, and said so only in a log line, would be worse than one that refused.
