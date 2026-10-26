# ADR-0009 — The event history as a table, with the line-delimited form as an export — Decision

Part 3 of 7 of [ADR-0009](../0009-the-wire-event-journal.md), which indexes every part.

## Decision

**The session's event history is a table in the workspace store of ADR-0058.** It is owned by the
`SessionWriter` of ADR-0008, in the run host, by a run holding that session's **lock row** (ADR-0005).
The line-delimited form becomes an **export**.

### What a row holds

- **The serialised form itself, verbatim** — exactly the bytes the live channel emitted for that event,
  produced by **one serialiser** shared by the live channel and the write path, so `REQ-EVENTS-080`'s
  byte-identity is true by construction rather than by two code paths agreeing. `REQ-EVENTS-104`'s
  byte-identical line is then not a rebuild at all: it is the stored value. `REQ-EVENTS-095` holds
  literally, because what is stored is what the schema already masked.
- **A per-session `ordinal`**, assigned by the writer inside the transaction that inserts the row,
  monotonic and contiguous, which is what "position in the stored history" becomes for
  `REQ-EVENTS-076`'s within-run orderings and for `REQ-EVENTS-083`'s emission order. A resumed session
  continues the same ordinal series in the same table, which is `REQ-EVENTS-097`'s "a resumed session
  adds its events to the same history".
- **Derived envelope columns** — `event`, `session_id`, `timestamp`, `schema_version`, `iteration` —
  extracted from that same value at write time, **for querying only**, so `REQ-EVENTS-117`'s four
  filter axes, `REQ-EVENTS-119`'s iteration attribution and `REQ-EVENTS-126`'s first-and-last summary
  are queries rather than full scans. That is what makes `REQ-EVENTS-175`'s 100 ms filter budget
  reachable on a long history and `REQ-EVENTS-126`'s listing bound reachable on a workspace full of
  them.

> **The stored form governs, and this is now the requirement's own wording rather than this record's.**
> `REQ-EVENTS-080`: a derived value "MUST NOT be read back in place of it, nor written into an export",
> and "where a derived value and the stored form disagree, the stored form is the record".
> `REQ-EVENTS-085` is the precedent: a session's resolved identity must not change because a recorded
> event carries a different `session_id`, and the stored form must not be altered to impose it.

The trailing line feed of `REQ-EVENTS-090` is **not** part of the stored value. The requirement now
says so itself: it is the export's format and a store that does not separate its records by newlines
does not violate it.

### Where `REQ-EVENTS-166` lives

`REQ-EVENTS-166` is an obligation on the **export path**, and the specification now states that rather
than leaving it inherited from a file. Two already-specified surfaces discharge it and no new capability
is invented:

1. **The history export.** `REQ-EVENTS-172` requires the surface to hand the user the currently selected
   events as JSON lines, each byte-identical to what the live stream emitted and terminated by a single
   line feed, **"emitted from what the stored record holds, in stored order — a concatenation, never a
   re-serialization"**, carrying events and nothing else. An unfiltered selection must equal the run's
   lines exactly, in number and in bytes. `REQ-SESSION-189` requires the same of the export surface and
   requires it "for any session the application can list, whether or not that session is live". Under
   this decision that output is each row's stored value in ordinal order, each followed by one line
   feed. **This file is what a copy of the history to another machine now is.**
2. **The trajectory document.** `REQ-EVENTS-132` to `REQ-EVENTS-145` and `REQ-SESSION-153` fix a
   self-contained JSON document readable with any standard parser, carrying the stored payloads in order
   "copied exactly as stored and never rebuilt by re-serializing a decoded copy" with no second masking
   pass (`REQ-EVENTS-134`), and made visible at its destination in one step with parents created
   (`REQ-EVENTS-145`).

`REQ-EVENTS-162` has been amended to say what it is for: an exported trajectory's event list must equal
the lines the live stream emitted for the same run, and "**this is the conformance test for
`REQ-EVENTS-166`**: because the export rather than the write path is now what a third party reads, an
export that drifts from the wire breaks the guarantee outright, and this equality is what detects
that." This record names it as the test it must pass on every build.

`REQ-EVENTS-099` supplies the second half of that defence and is new: **one reader must serve a
session's stored history and any sequence of lines the caller supplies alike**, because "reading an
export with the same reader that reads the store is what keeps the export a first-class record rather
than a write-only formality". The exporter's output is therefore read back by the same reader that
reads the store, and that round trip is a structural test rather than a bolted-on one.

### Append: one committed transaction per event

`REQ-EVENTS-029`'s "made durable individually at the moment it is raised" becomes **one committed
transaction per event**, and the two observables it now fixes are met by construction: a transaction
commits or it does not, so an event is wholly in the history or wholly absent; and the commit precedes
the forward and the publish, so durability is reached before the event is observable anywhere.

- **No group commit across events.** `REQ-EVENTS-029` forbids "any arrangement that defers several
  events' durability to one later step … whatever it costs", and batching would additionally install a
  delay floor on `REQ-MONITOR-218` through ADR-0010's publish rule.
- **Commit durability must be at least what the flush provided.** ADR-0058 fixes it: ordinary commits
  write the transaction to the write-ahead log without an `fsync` and are recovered on the next open, so
  they survive a process crash or force-quit — exactly the failure `REQ-EVENTS-029` names — but not a
  power loss. Whether the corpus wants power-loss durability anywhere is **OQ-12**, which was open under
  the file design, where a userspace flush gave no more than this either, and is not made worse here. No
  append forces the stronger setting; the two writes that do are ADR-0058's and are
  `REQ-SESSION-070`'s terminal-status save and `REQ-SESSION-068`'s explicit flush.
- **Where the transaction is wider than one event.** For the pairs `REQ-EVENTS-072` enumerates, the
  durable record and the event go in **one** transaction (ADR-0008). The requirement now instructs this
  rather than permitting it: "where the store can make the durable record and the event one indivisible
  step, it MUST". The event is forwarded only after that transaction commits (`REQ-SESSION-147`).

### Ordering and the single writer — stated, not assumed

- **One writer per session's event rows**, in the run host, holding the session lock —
  `REQ-EVENTS-098`. The store is shared by every session in the workspace, so the rule is scoped to a
  session's rows rather than to the store; what makes it hold is ADR-0002 putting every session lock in
  one process and ADR-0058's table-ownership rule.
- **The writer assigns the ordinal**, on its serialised queue, in emission order. Nothing else may.
- **`REQ-EVENTS-030` is discharged structurally for content and by the queue for order.** A row is
  inserted whole or not at all, so two concurrently raised events cannot produce a record containing
  fragments of both; the requirement's *ordering* half — the history holds concurrently raised events in
  the order they were raised — is the queue's.
- **The queue is required, not merely convenient.** `REQ-EVENTS-098` now says serialisation is needed
  "even where the store's own guarantees already make two writers unable to corrupt one another". A
  reader who finds the queue and concludes it is redundant beside a transaction is reading only half the
  requirement.

### Retention: what bounding means for a table

The cap bounds **events per session**, not bytes of a file. `REQ-CONFIG-473` and `REQ-EVENTS-091` are
unchanged in every figure.

- **A cap of `0` means never trim**, no headroom applies, and the truncation record carries the cap as
  null.
- **The headroom survives, for a different reason than it was written for.** `REQ-EVENTS-091` permits
  the history to hold up to `cap + (cap ÷ 8)` events and requires a trim before any further event is
  recorded once it exceeds that. Under a file the headroom amortised an O(file) rewrite; a row delete is
  O(rows deleted), so nothing forces it now. It is kept because one batched delete every `cap ÷ 8`
  appends is cheaper than a delete on every append, because the permission is stated behaviour, and
  because keeping it lets `REQ-EVENTS-091` be cited unamended. The default still trims once the history
  exceeds 22,500 events.
- **A trim keeps the newest `cap` events** and counts from the history's current contents, never from a
  figure carried over from earlier appends.
- **The trim is its own transaction, on the same queue, immediately after the commit of the append that
  overflowed the headroom and before the next event is recorded.** `REQ-EVENTS-091`'s "observable only
  as a single step" and its interruption rule are the transaction; its sequencing rule — the trim
  follows the overflowing record and precedes any further one — is the queue.
  **This is a deliberate change from the previous form of this record, which put the `DELETE` inside the
  append's own transaction, and the reason is `REQ-EVENTS-091`'s stated failure semantics.** A trim
  inside the append's transaction cannot fail without rolling back the append, which would discard an
  event the requirement wanted recorded; a separate transaction lets a failed trim do exactly what
  `REQ-EVENTS-091` says it must — leave the previous contents in force, stay out of the truncation
  record, record a warning, and leave the history over its cap as "a bounded and visible cost".
  `REQ-EVENTS-098`'s "a trim cannot race the recording of an event" is held by the queue, which that
  requirement independently requires.
- **The truncation record is inside the trim's transaction.** `REQ-EVENTS-092` requires it made durable
  "in the same indivisible step as the trim that produced it, so it can never report a trim that did not
  happen or omit one that did". See consequence 4: this closes a crash window the file design accepted,
  and the window has been measured.

### The disagreement with ADR-0004 — settled, 2026-09-02

Both records stated this from their own side and neither settled it, so it sat in the corpus as a
contradiction two documents had agreed to disagree about. **It is settled in favour of this record, and
ADR-0004 has withdrawn the sentence.** What follows is the argument, not the outcome alone, because the
outcome without the argument is what a later reader would undo.

**What ADR-0004 said, preserved as the reading it now is.** *A trim is a `DELETE` inside the transaction
that made the insert (`REQ-SESSION-133` requires exactly that), so `REQ-EVENTS-098`'s "a trim cannot race
the recording of an event" is discharged by the transaction rather than by a queue discipline.* Its case
was real: one rule for every ring in the product is simpler than two, `REQ-SESSION-133` states that rule
in terms, and `REQ-EVENTS-091` states no competing rule about transactions at all. On a plain reading of
what each requirement *says about transactions*, the event history is silent and the rings are explicit,
and generalising from the explicit one to the silent one is the ordinary move.

**Why it is wrong, and the decisive argument is not the one either record was making.** Both records were
arguing about whether a failed trim would discard the overflowing event. It would — but that
under-states it by a whole run. **Under a shared transaction a failed trim *is* a failed recording**, and
`REQ-EVENTS-088` makes a failed recording sticky: the store is "marked failed for the remainder of that
run, no further event may be recorded for it", with exactly one warning stating the history is incomplete
from that point. So the shared transaction does not cost one event. It ends the history.

`REQ-EVENTS-091` and `REQ-EVENTS-088` are deliberately different outcomes for deliberately different
failures — a failed *trim* leaves "the history then exceeds its cap, which is a bounded and visible cost",
while a failed *recording* stops the history — and a shared transaction is precisely the arrangement that
cannot tell them apart. That is not a preference between two designs. It is one design that satisfies both
requirements and one that converts the recoverable failure into the terminal one.

**The amendment a reader will reach for does not decide this, and it is worth saying why.**
`REQ-EVENTS-092` now requires the truncation record "made durable in the same indivisible step as the trim
that produced it". That binds the truncation record to the **trim**; it says nothing about binding the trim
to the **append**, and it is satisfied identically either way. What it settles is a different and older
question — the two-step marker — and it settles it in this record's favour; see consequence 4.

**The second half was not in dispute and is wrong independently.** `REQ-EVENTS-098` has since been
amended to require serialisation "even where the store's own guarantees already make two writers unable to
corrupt one another, because what is at stake is emission **order** (`REQ-EVENTS-076`) as much as record
integrity, and no store supplies that on its own". A transaction gives atomicity and isolation and does not
give emission order. The claim that the queue is discharged by the transaction is refused by the
requirement in terms.

**What generalises.** Put the trim inside the recording transaction exactly where a requirement says the
trim and the record are one durable operation, and nowhere else. `REQ-SESSION-133` says it and ADR-0024
obeys it; `REQ-EVENTS-091` does not say it and states a failure mode that depends on its not being said.
**The two stores are not unified on this point and should not be** — `REQ-EVENTS-091` *states* a permitted
headroom of `cap ÷ 8` and tolerates a failed trim; `REQ-TOOLS-078` and `REQ-SESSION-133` state no headroom
and permit none. The divergence is in the requirements, it is deliberate on both sides, and a future reader
who notices the asymmetry and unifies it will be unifying two behaviours the specification separated.

### The truncation record: the data survives, the file does not

The marker was doing two jobs and only one was withdrawn.

- **Trim detection for a follower** — `REQ-EVENTS-111`'s restart flag — is gone with the followers under
  SR-2. No reader carries a position between reads (`REQ-EVENTS-108`).
- **Reporting cumulative loss** is not gone. `REQ-EVENTS-111` enumerated the surviving consumers before
  withdrawing the flag: the listing (`REQ-EVENTS-129`), the history surface beside the event count
  (`REQ-EVENTS-168`), the export document and its disclosure (`REQ-EVENTS-140`, `REQ-EVENTS-173`), and
  `REQ-SESSION-144`, `REQ-SESSION-153` and `REQ-SESSION-188` from the sessions domain.

The truncation record becomes **four columns on the session's own row**: `truncated`, the cumulative
dropped count, the cap in force (null for unbounded) and the ISO-8601 UTC instant of the last trim —
the exact inventory `REQ-EVENTS-092` fixes. Its **absence reads as not truncated with zero drops**, and
the requirement now insists that absence "is a definite answer and MUST NOT be reported as an unknown
figure or raised as a failure". `REQ-EVENTS-094`'s accumulation across processes and application
launches for one session id becomes an increment of a column that was never reset; it no longer needs
seeding from a separate record at store open, which the requirement now names as "exactly the failure
this requirement exists to prevent".

`REQ-EVENTS-093` is withdrawn with the three interchangeable paths it fixed, and the one behavioural
guarantee it carried was moved into `REQ-EVENTS-092` before the identifier went.

### Store lifecycle and failure

- **The history is brought into existence before the first event lands** (`REQ-EVENTS-087`), as a
  session row marking the history open and empty, which is what preserves `REQ-EVENTS-125`'s observable:
  a run that recorded nothing stays distinguishable from a session that has no history at all. **No
  per-kind placeholder is created**, because `REQ-SESSION-132` forbids one and requires a record kind
  the session never wrote to read as empty rather than missing. The two requirements meet at the session
  row: the fact that the history is open is a column, and every record kind reads empty without anything
  being written for it. `REQ-EVENTS-087` also holds that no truncation record may exist until a trim has
  actually dropped events.
- **A store that cannot be opened refuses the run, and this is a definite user-visible outcome rather
  than an unreachable branch.** `REQ-EVENTS-084` has been amended and now requires it: the session must
  not start, the entire event sequence is exactly one `result` with status `error` on
  `REQ-EVENTS-021`'s terms, no `session.start` is emitted, no session is left behind, and the reason
  reported to the user must state that the session's durable store could not be opened and **carry the
  store's own reported reason unaltered**. `REQ-SESSION-089` says the same from the sessions side and
  gives the reason: the state, the lock and the history are one object, so there is no coherent partial
  failure left. **The previous form of this record called this branch "unreachable" and reported it for
  amendment. That was wrong twice over — the amendment has landed, and it gives the case an outcome
  rather than removing it.** `REQ-EVENTS-035` now names it as the one exception to establishing the
  store before any part of run start-up can fail.
- **A successful open is not evidence of a working store, and this record must not assume the open is
  where failure surfaces.** `REQ-EVENTS-084` says in terms that it "governs opening the store only; a
  write that fails *during* a run is `REQ-EVENTS-088`'s". Measured, there is a state between the two:
  `../spikes/remote-and-synchronised-storage.md` found a store that **opened successfully, reported
  `journal_mode = WAL`, read the pragma back as `wal`, owned a 32 KiB `-shm` file, and then threw on the
  first statement afterwards** — `SQLITE_IOERR_IN_PAGE`, on **30 of 30 opens**, after which 6,000 of 6,000
  commits succeeded with zero rows lost. The open succeeded, so `REQ-EVENTS-084` does not reach it; no run
  has started and no event is being recorded, so `REQ-EVENTS-088` does not obviously reach it either.
  `REQ-EVENTS-087`'s "initialization failure MUST be reported as a failure rather than raising" is the
  nearest thing the corpus has to an owner and it is not stated as one.

  **This record does not settle that and must not**, and it is named because the natural implementation is
  the dangerous one: catch the first throw, retry, and carry on — which *works*, and which is precisely
  the silent degradation `REQ-EVENTS-084` exists to forbid. **The specification gap is being closed
  elsewhere.** What this record owes is only that nothing in it treats "the store opened" as "the store
  works": the history is brought into existence before the first event lands (`REQ-EVENTS-087`), and that
  step is the first thing to touch a page, so it is where such a failure will actually appear — not at
  open, and not on the first event.
- **A serialisation failure drops that one event** with a warning naming the type and the reason, leaves
  delivery open, and lets every later event land, "so the history carries exactly one record fewer than
  the number of events the run raised" (`REQ-EVENTS-032`). Unchanged — serialisation still precedes the
  write.
- **A recording failure is sticky for the remainder of the run** (`REQ-EVENTS-088`): a failed commit
  produces a warning and a failure return value rather than an exception, marks that session's history
  failed, and no further event is recorded, with exactly one warning for the run.
  **The reason for the sticky rule changed and the requirement now states the new one.** Under a file it
  kept a full volume from accumulating partial lines; the requirement now says it "keeps the instant from
  which a history is incomplete a single reportable fact" and stops a store that has already failed being
  asked again on every event. `REQ-EVENTS-088` also now states the bound: a failed recording step leaves
  no partial record behind, "so a history this product wrote ends at its last whole event rather than at
  a fragment of one".
- **Failure never propagates outward** (`REQ-EVENTS-078`, `REQ-SESSION-175`).

### Reading

The reader is a separate, read-only object (`REQ-EVENTS-100`, `REQ-EVENTS-123`), used by replay, by the
listing, by the history surface and by both exports. It is streaming and lazy (`REQ-EVENTS-099`,
`REQ-EVENTS-122`) — a cursor over the session's rows in ordinal order, which is what "pull no further
than the caller has consumed" becomes. The recognised set is derived from the catalogue, one enumeration
consumed by the validator, the reader and the exporter (`REQ-EVENTS-102`). `REQ-EVENTS-101`'s missing
store reading as an empty session becomes an absent session row.

Reading is unrestricted and needs no lock, and `REQ-EVENTS-098` now makes the store's side of that a
requirement: **a reader must not be able to delay or block the writer, and the writer must not be able
to make a reader fail.** This is where the store change pays for itself on the read side, and the
measurement is on record: under the file design a reader holding a descriptor blocked the writer's
replace 200/200 times, and a reader's per-poll duty cycle was enough to fail 2/250 to 19/300 trims at
realistic cadences (`../spikes/windows-writer-handle-compaction.md`, §3.1 and §4.2). That store did not
satisfy `REQ-EVENTS-098` as the requirement is now written. ADR-0058's write-ahead journal mode, set at
open and read back, is what makes it satisfiable. See consequence 7 for the one place ADR-0058 has not
yet caught up with ESC-15 on this point.

### The two terminal-result paths

`REQ-EVENTS-021` and `REQ-EVENTS-070` fix two mutually exclusive delivery paths for a terminal result:
a run **refused before it starts** emits exactly one `result` with status `error`, no `session.start`,
by a direct path; a run that started delivers its terminal pair over the bus while the sink is still
attached, exactly once. Both are implemented and a test asserts they cannot both fire.

**What has changed is which failures reach the direct path.** `REQ-EVENTS-084`'s store-open failure is
now one of them, and it is the failure most likely to occur in practice. The direct path is therefore no
longer only for an invalid run configuration; it is the path a user meets when a workspace store is
damaged, and the reason it carries must be the store's own (`REQ-EVENTS-019`, `REQ-EVENTS-084`) rather
than a generic refusal.
