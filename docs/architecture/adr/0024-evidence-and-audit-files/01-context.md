# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — Context

Part 1 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

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
