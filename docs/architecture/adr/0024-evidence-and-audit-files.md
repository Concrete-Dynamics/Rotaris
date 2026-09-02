# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported

- **Status:** proposed
- **Date:** 2026-09-02
- **Origin:** EXEC (ADR-EXEC-11), UI (ADR-UI-10, on terminal input)
- **Authority:** `owner-decisions.md` **SR-4**, **SR-6**, **SR-9(a)** and **ESC-20**; and the
  specification as amended on 2026-09-01, which minted `REQ-SESSION-199`, put the audit's integrity
  properties inside `REQ-SESSION-137`, and made the ring trim part of the operation that records the entry
- **Revised 2026-09-02** against ESC-20 as the specification now carries it. **The export boundary is a
  security property of this record and it now carries the mechanism as well as the reason** — see *The
  export boundary, and the one line that must never move*. The gap the previous version reported is
  **closed**: `REQ-TOOLS-190` now states the redaction-safety test and grants the verification-gate record
  an export, `REQ-EVENTS-163` has been narrowed because it had accidentally granted one to a record that
  must never have it, and SR-9(a)'s two exports have landed as `REQ-LIBRARY-176` and `REQ-TRACE-514`.
  Consequence 6 was stale in three places and is rewritten.
- **Revised again 2026-09-02**, against `../spikes/commit-on-the-publish-path.md` and
  `../spikes/remote-and-synchronised-storage.md`. Three things land here. **The pairing this record makes
  between an entry and its two durable side effects is measured to be free** — a second insert inside a
  transaction that is already committing costs **−4 to +31 µs at p50**, so `REQ-EVENTS-072`'s indivisible
  step is not a cost this design absorbs. **The first of the two unmeasured export dependencies is now
  partly measured and the answer is favourable** — see *Two dependencies of this record's export design*
  at the end. And **this record must stop treating a successful store open as evidence of a working
  store**, because every write on this path is best-effort with respect to the caller and a store that
  opens and then fails is the one configuration in which a security record goes silent without anything
  refusing.
- **Depends on:** ADR-0003 (the line between a file and a row), ADR-0058 (the workspace store),
  ADR-0005, ADR-0007, ADR-0008
- **Supersedes** the line-delimited-file form of this record dated 2026-08-31, preserved below as
  alternative A
- **Contains an unresolved conflict between slices** over which process holds the pen for terminal input

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

**Under SR-4's principle these records belong in the database**, because the three per-session evidence
records are distinct contracts whose figures are not comparable with one another (`REQ-EVENTS-163`). What
must not move is the record's **character** — append-only, ordered, immutable — and what SR-6 added is that
the character must survive the move in a form a user can inspect.

### Which records export, and why that is not a list

ESC-20 replaced the test the previous version of this record worked from, and the specification now carries
the replacement rather than the ruling. `REQ-TOOLS-190` is "the product's single statement of that test, and
no requirement in any other domain holds a second copy of it":

> **A record gains an export when it carries no unredacted user or tool content, and does not gain one when
> it does.**

Three things about that sentence bind this record, and each is a correction of something the previous
version relied on.

- **The old test is refused by name.** "That only this application reads a record is *not* a reason to
  withhold an export and never was — a record only this application can read is exactly the record a user
  needs their own copy of." The previous version of this record quoted `REQ-TOOLS-190`'s readership
  argument and observed that it sat against SR-6's own reasoning. It no longer sits against it; it is gone.
- **The verification-gate record has an export.** `REQ-TOOLS-190` now requires one, on
  `REQ-SESSION-199`'s terms, carrying declines as well as writes in attempt order and stating how many
  entries the cap dropped. It qualifies "because everything it holds is the caller's own stated reason, the
  check set it proposed, and the product's own validation detail".
- **The permission audit qualifies for a property, not for being an audit.** `REQ-TOOLS-190` says so in
  terms — "it is the property and not the record that earns the export: `REQ-TOOLS-079` gives an entry no
  argument values at all beyond the redacted command facet inside `summary`" — and `REQ-TOOLS-079` closes
  the loop from its own side: that absence "is the property that makes the audit safe to hand to the user
  as a file … A change to this requirement that let argument values into an entry would withdraw the
  audit's export with it."

And the line that does not move: **`REQ-SESSION-136`'s tool-call evidence "does not qualify, and MUST NEVER
gain an export — not under this rule, and not under any later widening of it."** `REQ-EVENTS-163`, which had
read as though it granted one, has been narrowed to say the opposite in terms. The mechanism this record
owes that prohibition is below.

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

**D — One exporter over every evidence kind, driven by a per-kind policy row carrying an `exportable`
flag.** The natural shape once several kinds export, and the one a later simplification will propose,
because it is genuinely better on every axis except the one that matters. One code path, one document
envelope, one place to fix a bug, and adding a kind's export is a data change rather than a code change.
**Rejected, and rejected on the security property rather than on cost.**

Under it, the entire distance between "the audit, whose entries carry no argument values" and "the
tool-call evidence, which holds the arguments an agent passed exactly as they were passed" is one boolean
in a table. `REQ-TOOLS-190` does not merely decline that export; it says such a proposal "MUST be refused
rather than reconciled". A design in which refusing it means noticing a `false` has been changed to a
`true` — in a data row, by anyone, at any time, with the diff reading as configuration — is a design that
has moved a MUST-NEVER into the place least likely to be read carefully. The field's live hazard is on
record and is not hypothetical: Codex rollouts are documented as carrying "prompts, command output, file
paths, code, and accidental secrets", and opencode ships a `--sanitize` flag because of it (ESC-20).

The cost of rejecting it is real and is accepted: the ring logic, the ordinal discipline and the document
envelope are still written once and shared, but **the export path is not**, so a bug fixed in one exporter
is not automatically fixed in another. That is the trade — a little duplication on a path that produces
files a user asked for, against a boundary that cannot be crossed by editing a value.

**E — One append-only table per evidence kind, holding both the serialised entry and the columns a
query needs, behind one serialised writer per session, with the ring's own state exported beside the
entries, and with export reachability a structural property rather than a flag.** Chosen.

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
   database is scoped per workspace; there is no per-session bound left. **The export is the only *readable*
   copy a user can hold outside that domain**, and under `REQ-SESSION-198`'s machine-local store neither the
   audit nor any other record travels with a backup of the workspace — `REQ-SESSION-200` now names the audit
   explicitly among what sits outside such a backup, and obliges the product to state that rather than let a
   user infer it. **SR-9(b)'s gap has since been answered twice over and the second answer changes this
   consequence**: `REQ-SESSION-201` mints a whole-store backup, so carrying the audit off the machine no
   longer depends on the export. That makes the export's availability a **transparency** property again
   rather than also a durability one — which is the right division, since `REQ-SESSION-201` says in terms
   that the two artifacts do not substitute for each other and that neither may be offered as the other.
   The audit is unusual in needing both: the backup is how it survives the loss of a machine, the export is
   how it is checked by someone who does not trust us.
6. **The "a human can no longer read it" gap is closed, and the line left open is now drawn by one test
   applied once rather than case by case.** The previous version of this record reported the opposite and
   is superseded on every point of it: it said the verification-gate record had no export and that this
   "sits against SR-6's own reasoning"; it said SR-9(a)'s two exports "have not landed"; and it said the
   export list "is being drawn case by case against one argument rather than by applying the argument
   once". **All three have been overtaken.** `REQ-TOOLS-190` grants the verification-gate record an export
   and states the general test; `REQ-LIBRARY-176` and `REQ-TRACE-514` mint SR-9(a)'s two; and the test is
   now stated once, in one requirement, with `REQ-EVENTS-163` narrowed to stop reading as a second grant.
   The concern was correct and it has been answered by amendment — recorded that way rather than deleted,
   because the pattern is worth keeping: what looked like an inconsistent list was a missing rule.
   - What exports: the event history's two forms (`REQ-EVENTS-166`), the timeline, the issues record, the
     metrics document and the permission audit (`REQ-SESSION-199`), the verification-gate record
     (`REQ-TOOLS-190`), the improvement store (`REQ-LIBRARY-176`) and the delivery store
     (`REQ-TRACE-514`). `REQ-SESSION-191` keeps the file-manager reveal for the log, the summary and the
     artifact bodies (`REQ-SESSION-002`).
   - What does not, and why it is a property rather than a policy: `REQ-SESSION-136`'s tool-call evidence,
     absolutely and permanently, because it holds the arguments an agent passed exactly as they were
     passed; and the remaining ring-capped kinds of `REQ-SESSION-133` — model inputs, context selections,
     report validations, memory snapshots — which have not been put to the test and would be settled "by
     applying the test above to that record's own content, and never by arguing from this list"
     (`REQ-TOOLS-190`).
   - **Two of those four are worth naming as likely to fail the test rather than pass it**, so that a later
     reader does not treat the residue as an oversight to tidy up: a model-input record is by definition the
     text sent to a model, and a memory snapshot is workspace content. Neither is this record's to decide
     and neither is decided here.
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
an interface anything is built on. Or a requirement asks the audit's integrity to be provable against
someone who has the store, which is a different problem from the one this record solves and would need a
mechanism no ruling has yet authorised.

**Or one of `REQ-SESSION-133`'s remaining ring kinds passes `REQ-TOOLS-190`'s redaction-safety test**, in
which case it uses the five mechanisms above and this record needs no new decision, only an exporter of its
own — deliberately not a flag on a shared one (alternative D). The previous version listed the
verification-gate record here; that trigger has fired and is now discharged in the decision.

**What would NOT reopen the boundary, named because it is what a reopening would look like.** A user asking
for the tool-call evidence; a support workflow that would be easier with it; a redaction pass proposed for
it, since `REQ-SESSION-136` keeps the arguments unredacted deliberately and a redacted copy is not that
record; or an argument from `REQ-SESSION-201` that unredacted content already leaves in the backup.
`REQ-TOOLS-190` disposes of the class: a proposal to export that record "is in conflict with this one and
MUST be refused rather than reconciled". This record has nothing to add to that and adds nothing.

**Two dependencies of this record's export design. One is now partly measured; the other is not.**

**(a) The export taken during a busy run — measured in direction, and the expectation this record stated
was too strong.** The previous text read: *"a 5,000-entry read is a read, so under write-ahead logging it
should not delay the writer at all, which `REQ-EVENTS-098` requires of the store as a conformance
property."* `../spikes/commit-on-the-publish-path.md` §8 measured a second OS process reading this store
while the run host committed: a reader doing whole-session reads back to back — **147–1,603 ms per pass,
47,695–82,405 rows over the run** — **never blocked the writer** (zero errors, zero `SQLITE_BUSY`) but took
its commit from **p50 163.6 → 345.9 µs and p95 271.7 → 898.9 µs**.

So **the conclusion holds and the wording does not**: a read does not block the writer, which is what
`REQ-EVENTS-098` forbids on the reading its own following sentence fixes — *"a store in which one blocks
the other does not satisfy this requirement"* — but "does not delay the writer at all" is measurably false
and should never have been written. ADR-0009 consequence 12 carries that reading; this record adopts it
rather than restating it. **The conditional in the previous text — "if an export is shown to delay a
writer, the fix is in the store" — must not be triggered by the doubled median above**, or the store gets
blamed for a property no store has.

What is *not* measured: the reader in the spike was a whole-session transcript read rather than an audit
export, it read continuously rather than once, and a single 5,000-entry read is smaller than any pass it
took. The **direction** is established; the specific number for this export is not.

**And one sharp thing the same section establishes, which mechanism 5 leaves ambiguous.** Mechanism 5 says
the export's read "runs in one transaction". **It must be a read transaction and never a write one.** The
spike measured what happens when a second process holds a *write* transaction against this store — which
ADR-0058 rule 4 forbids — and it is not a matter of degree: a 200 ms hold produced a single writer commit
of **205.4 ms**, 82 % of `REQ-MONITOR-222`'s entire budget, and a run with no gaps between holds starved
the writer indefinitely. "One transaction, for consistency" is exactly the phrase under which someone
writes `BEGIN IMMEDIATE`. **The distance between the right reading and the wrong one is 346 µs against
205 ms**, and it is stated here rather than left to rule 4 to catch.

**(b) Whether the export's document form is tolerable at the caps `REQ-SESSION-133` sets is still not
measured**, and the commit spike does not touch it. Unchanged.
