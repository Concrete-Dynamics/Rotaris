# ADR-0009 — The event history as a table, with the line-delimited form as an export

- **Status:** proposed
- **Date:** 2026-09-02
- **Revised 2026-09-02.** The trim's transaction boundary, recorded as a disagreement with ADR-0004 and
  settled by neither, is **settled here in this record's favour** on an argument neither record had made.
  ADR-0004 has withdrawn its sentence and preserved it as the reading it now is; this record does the same
  from its side, in the new section under *Retention*.
- **Revised again 2026-09-02**, against `../spikes/commit-on-the-publish-path.md`. **Consequence 2's
  "still not measured" is discharged, and the measurement changes a reason rather than a conclusion.**
  Per-event durability stays, and no longer stays because `REQ-EVENTS-029` forecloses batching "whatever
  it costs" — **there is no cost to absorb**: the event insert rides the row's transaction at a marginal
  p50 of **−4 to +31 µs**, inside the noise. A second measured result belongs to this record because the
  history is the store's highest-volume writer: **one commit in 136 costs 9–11 ms** while the rest cost
  179–220 µs at p50. And one thing this record must *stop* assuming is corrected under *Store lifecycle
  and failure*: a successful open is not evidence of a working store.
- **Origin:** RUNTIME (constraints C4, ADR-RUNTIME-03)
- **Authority:** `owner-decisions.md` **SR-4** and **SR-6**, read with **SR-2**; and the specification
  as amended on 2026-09-01, which rewrote `REQ-EVENTS-166` as an export obligation, made the trim and
  its truncation record one indivisible step, and turned `REQ-EVENTS-084` from a degradation into a
  refusal
- **Depends on:** ADR-0003 (the line between a file and a row), ADR-0058 (the workspace store),
  ADR-0005, ADR-0008
- **Depends on ADR-0004 for the export document only** — `REQ-EVENTS-145` still requires an exported
  document to become visible at its destination in one step, and now says it is "the only place this
  document requires a file to be replaced in one step"
- **Supersedes** the line-delimited-file form of this record dated 2026-08-31, preserved below as
  alternative B

## Context

SR-4 rules that a database is the store for what only the application reads and names *the event
history* among the things that move. This record is where that lands, because the history is the one
store in the product whose **bytes** were part of a stated contract, and a change of store must not
quietly become a change of contract.

**Three obligations were carried by the file, and the amended specification has now separated them for
us rather than leaving the separation to this record.**

- **What is stored.** `REQ-EVENTS-080` fixes a stored event as holding, verbatim, the serialised form
  the live stream would have emitted — same field names, same schema version, same key ordering, byte
  for byte — and adds that any value derived from it for querying or presentation "is a copy and MUST
  NOT be read back in place of it, nor written into an export". `REQ-EVENTS-104` requires a stored
  record to yield a byte-identical line **taken from what the record itself holds and never rebuilt by
  re-serializing a decoded copy**, and states why: rebuilding would make byte-identity a property of a
  serialiser confronted with payload shapes it has never seen. `REQ-EVENTS-095` forbids a second
  masking pass. These survive here unchanged and they now settle alternative C by requirement rather
  than by argument.
- **The serialiser and the terminator.** `REQ-EVENTS-064`, `REQ-EVENTS-065` and `REQ-EVENTS-089` fix
  compact JSON with sorted keys and non-ASCII escaped, one line per event, and refuse a serialised form
  containing a carriage return or line feed. `REQ-EVENTS-090` has been amended to say what it now
  governs: a single line feed is the record terminator "in any line-delimited rendering of a history",
  this is **the export's format**, "it is not a property of how the history is stored, and a store that
  does not separate its records by newlines does not violate it".
- **Getting the history out.** `REQ-EVENTS-166` has been rewritten and is now the single definition of
  what an export of a session record must guarantee, for domain 20 and for every other domain. It
  requires two exports to exist — the line-delimited history export of `REQ-EVENTS-172` and the
  trajectory document of `REQ-EVENTS-132` — and binds both: decoding an exported line, an exported
  history or an exported document must require nothing beyond a standard JSON parser and the
  specification, with no access to the store it came from; a copy on another machine must yield every
  field of every event unaltered and in the order the run emitted them. Three obligations attach.
  **Reachable whether or not the session is live.** **An export is not a channel** — a user-initiated
  action yielding a file the user then holds, never repeated on a timer, never the way any part of this
  product learns what a run is doing (`REQ-SESSION-071`, `REQ-EVENTS-123`). And **the export carries
  the record's own integrity properties**: whatever ordering, append-only character or completeness the
  record has where it is stored must be evident in what is exported, "because an export a reader cannot
  check against what the record claims to be is decorative".

`REQ-SESSION-143` states the same division from the sessions side: the durable history is part of the
session's record, "getting that history out of the product is the export's obligation and not the write
path's", and `REQ-SESSION-189` is where the line-delimited form is discharged — for any session the
application can list, live or not.

**The rest of the domain's contract is indifferent to the store and is carried across intact, but two
requirements have been restated in ways that bind this record.**

`REQ-EVENTS-029` no longer describes a write followed by a flush. It requires each event to be added
"as exactly one record, made durable individually at the moment it is raised and never in accumulated
batches", states what that is *for* — the durable record `REQ-EVENTS-072` binds an event to is written
and readable at the moment the event can be observed on any channel, and a session abandoned by a crash
holds its history complete to the last event raised — and then fixes **two observables that must hold
however the history is stored**: an event is wholly in the history or wholly absent from it, and the
durability that makes an event readable is reached before that event is observable anywhere, so "no
arrangement that defers several events' durability to one later step is permitted, whatever it costs".

`REQ-EVENTS-098` keeps the single writer, keeps the right to write as exactly the right to hold the
session's lock (`REQ-SESSION-056`), and adds two clauses that are now hard constraints on the store:
serialisation is required **even where the store's own guarantees already make two writers unable to
corrupt one another**, because emission order (`REQ-EVENTS-076`) is as much at stake as record
integrity; and **a reader must not be able to delay or block the writer, and the writer must not be
able to make a reader fail — "a store in which one blocks the other does not satisfy this
requirement"**.

Appending never raises (`REQ-EVENTS-088`, `REQ-EVENTS-032`, `REQ-EVENTS-078`). Retention is capped by
`runtime.event_retention_per_session` (`REQ-CONFIG-473`: integer ≥ 0, default **20000**, `0` never
trims, negative rejected at load), with the trim rules fixed by `REQ-EVENTS-091` and the truncation
record by `REQ-EVENTS-092` and `REQ-EVENTS-094`. Reading is streaming, lazy, read-only and
forward-compatible (`REQ-EVENTS-099` to `REQ-EVENTS-107`). The catalogue is **closed at 23 types** and
deliberately not extended for the verification-gate record (`REQ-EVENTS-041`, `REQ-EVENTS-177`).

**What SR-2 already removed from this record's problem.** `REQ-EVENTS-108` is withdrawn: no session
executes where this application can only watch it, so nothing reads a history a piece at a time while
it grows and no reader carries a position from one read into a later one. `REQ-EVENTS-111` is withdrawn
with it and is explicit that the truncation record is **not** withdrawn — it enumerates the consumers
that keep it before withdrawing the flag.

## Alternatives considered

**A — The history as the storage substrate, with all session state projected from it.** Rejected in
ADR-0003 and again here, on the domain's own evidence rather than on taste: the catalogue is closed at
23 types and `REQ-EVENTS-177` refuses to add one for a decision that *is* durably recorded elsewhere,
so the event stream is provably not a complete description of session state. A store that cannot
describe the state cannot be the state.

**B — Keep the line-delimited file as the runtime write path.** *This record's own previous decision,
preserved as the alternative it now is, because its argument was real and it is what this record gave
up.*

Its case: the bytes were the contract, and the guarantee that a third party could read a history with a
stock parser held **of the write path itself**. There was no export step to build, to test, or to get
wrong, and the guarantee held even for a build that never implemented an exporter.

**What changed is a ruling and then four measurements, and the measurements are the part worth stating,
because three of the four objections had been arguments until the spike ran.**
`../spikes/windows-writer-handle-compaction.md` measured the design this alternative describes, on the
target platform, and it is cited here as **history** — it documents the mechanism SR-4 replaced, not a
rule to carry forward:

1. **A compaction that renames a staged file over a target the writer holds open cannot work.** With a
   long-lived append descriptor held across the rename, **200/200 attempts failed with `EPERM`**, and
   the blocker is the replace-by-rename mechanism rather than the open's share mode: `fs.renameSync`
   fails even against a holder that explicitly permits delete, while `ReplaceFileW` — unreachable from
   the runtime's core, and priced at a 767 ms p50 out of process — succeeds (§3.1, §3.2). Driven under
   concurrency, the naive shape completed **0 of 115 trims**, ran 115 lines over its limit and still
   growing, and produced **zero observable symptoms at any reader** (§4.1).
2. **The failure compounds rather than degrading.** Because `REQ-EVENTS-091` requires a trim before any
   further event is recorded, a persistently failing trim makes every subsequent append carry a whole
   failed retry ladder: measured **3.76 events/s against 276 events/s**, a ~73× throughput collapse
   (§4.1).
3. **Closing the writer's handle is necessary and not sufficient.** A reader holding a descriptor for
   the duration of one read is enough to block the replace, at a duty cycle of 0.11–0.44 % per reader;
   2/250, 10/250 and 19/300 trims needed a second attempt at realistic cadences (§4.2). This is the
   condition `REQ-EVENTS-098` now forbids outright: a store in which a reader can delay the writer does
   not satisfy the requirement.
4. **The truncation marker as a second file left a measured window.** Between a completed trim and its
   marker landing, the history was trimmed and the marker stale for **p50 2.6–3.2 ms, p95 3.6–6.8 ms,
   max 99 ms**, and p50 95 ms under stress; a second window is structural, because the marker and the
   history are two files read at two instants (§5). Under-reporting drops inside that window is exactly
   what `REQ-EVENTS-094` now calls "the failure this requirement exists to prevent".

**C — Decompose each event into typed columns and re-serialise the line on read.** Queryable, compact,
and the natural relational shape. **Now rejected by requirement rather than by argument.**
`REQ-EVENTS-104` forbids rebuilding a line by re-serializing a decoded copy in terms, and states the
reason this record used to have to supply: byte-identity would become a property of a serialiser facing
payload shapes it has never seen. `REQ-EVENTS-102` makes it fatal — a stored event carrying a type
absent from this build's catalogue must be returned with its raw payload untouched — and
`REQ-EVENTS-080` adds that a derived value may never be read back in place of the stored form.

**D — One row per event holding the wire line verbatim, with derived envelope columns beside it.**
Chosen.

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

## Consequences accepted

1. **`REQ-EVENTS-166` is discharged by code that can be wrong.** Under a file the guarantee held even for
   a build with no exporter; now an export bug can break it. **The specification supplies two mitigations
   and this record relies on both rather than inventing one.** `REQ-EVENTS-162` makes the exported event
   list's equality with the emitted lines the conformance test for `REQ-EVENTS-166` by name, and
   `REQ-EVENTS-099` requires the same reader to read the store and the export, so the round trip is
   structural. Both must run on every build; the guarantee has moved from a property of the medium to a
   property that is tested.
2. **`REQ-EVENTS-029`'s per-event durability is free, not a cost this design absorbs. Measured
   2026-09-02; the conclusion is unchanged and the reason it rested on is withdrawn.**

   The previous text of this consequence read: *"Per-event commit is a real cost on the run host's loop,
   and it is still not measured. It is the reason ADR-0002 keeps the run host off the window layer."* It
   went on to price the file design's per-event durable write at 0.518 ms p50 with an `fsync`, to infer
   that an ordinary commit "should therefore cost less", and to say that no measurement of a commit on
   this path existed. **It does now** (`../spikes/commit-on-the-publish-path.md`), and the inference was
   right about the direction and wrong about the size of the thing being weighed.

   - **The event's own marginal cost is inside the noise: −4 to +31 µs at p50.** That is the step from a
     transaction inserting only the transcript row to the same transaction inserting the row *and* the
     event (spike §5.2, 3,000 commits per arm, at both 0 and 10,000 pre-existing rows). Making an event
     durable individually costs nothing once the row's commit is being paid for.
   - **The commit that carries it costs p50 185.4 µs / p95 362.8 µs** at `synchronous = NORMAL` for the
     three-statement publish-path transaction, 9,000 samples per arm, and **p50 182.2 µs / p95 329.0 µs**
     against a 10,000-row table — no growth term. With the periodic checkpointing commits removed (see
     consequence 11) the body of the distribution is **p50 179–220 µs, p95 301–386 µs**.
   - **End to end, commit then publish**, run host → main → renderer over ADR-0002's relay: **p95
     1.774 ms** at 0 recorded rows and **1.723 ms** at 10,000, against a no-commit control measured on the
     same harness in the same session at p95 1.161 / 1.220 ms. **Zero of 20,000 measured publications
     exceeded 250 ms.** The commit is ~39 % of the end-to-end p95 and **0.28 % of `REQ-MONITOR-222`'s
     budget**.

   **Which reason survives.** "Per-event commit is a real cost on the run host's loop" is disproved *as a
   statement about the event*. What the transaction costs is real but small, and this record withdraws its
   own contribution to ADR-0002's placement argument: **ADR-0002 keeps the run host off the window layer
   on its own reasons, and per-event commit cost is no longer one of them.** What replaces it as this
   record's reason for refusing group commit is simply that `REQ-EVENTS-029` forbids it and there is
   nothing to trade — the "whatever it costs" clause never has to be invoked, which is a stronger position
   than accepting a cost.

   **Three qualifications, because each of them could make the figure wrong later.**

   - **The −4 to +31 µs is the *paired* case.** It is the marginal cost of adding an event insert to a
     transaction that is already committing a durable record — `REQ-EVENTS-072`'s pairs, which this record
     puts in one transaction. An event raised with **no** paired durable record pays a whole transaction of
     its own. The nearest measured proxy is the single-insert shape at **p50 105–131 µs, p95 221–302 µs**,
     and it is a proxy: it inserts a transcript row (mean 2,234 JSON bytes) rather than an event row. Cited
     as an order of magnitude, not as the event's own figure.
   - **The measured schema is not this record's schema.** The harness's `event` table is a `WITHOUT ROWID`
     table keyed `(session_id, seq)` with no other index. This record's decision puts five **derived
     envelope columns** on the event row so that `REQ-EVENTS-117`'s four filter axes and `REQ-EVENTS-126`'s
     summary are queries rather than scans, and `REQ-EVENTS-175` puts a 100 ms budget on the filter. **Any
     index built to serve those is not in the measured shape**, and the spike states the mechanism
     plainly: every additional index adds WAL frames per insert, and therefore adds both commit cost and
     checkpoint frequency. The insert cost and the filter budget are one trade-off and nothing has measured
     it.
   - **`NORMAL` still buys no power-loss durability**, as stated under *Append*. `FULL` was measured at
     **4.4× the `NORMAL` p50** (812.1 µs), and the delta is one `fsync` on this device (559.3 µs p50). No
     append forces it, so the history never pays it — which is a consequence of the durability decision,
     not evidence for it. **Instrumented 2026-09-04** (`spikes/power-loss.md`): how much a `NORMAL` frame
     loses under a real cut — in commits and in milliseconds — is the number the harness's `verify` phase
     reports once the owner has performed the fault; a process death alone lost none, ten of ten.
3. **Three branches of the specification are unreachable from our own store, and the specification now
   says so rather than this record reporting it for amendment.** `REQ-EVENTS-106` states it directly:
   its four damage cases "remain implemented in full, because the reader also reads line sequences the
   caller supplies … What they no longer describe is this product's own store: a history this product
   wrote holds no partial record". `REQ-EVENTS-126` states the corollary — "a listing therefore no longer
   differs from replay on any session" — and `REQ-EVENTS-088` states the third. The damage handling must
   still be built in full, for exported histories copied between machines, edited by hand or truncated in
   transit; it must not be built as dead code guarding our own reads.
4. **The trim/truncation-record crash window is closed, and this is a genuine improvement rather than a
   neutral re-homing.** The file design accepted under-reported drops after a crash between a completed
   trim and its marker write, and the window has since been measured: **p50 2.6–3.2 ms, p95 3.6–6.8 ms,
   max 99 ms** at realistic cadences and p50 95 ms under stress, plus a second, structural window
   because the marker and the history were two files read at two instants
   (`../spikes/windows-writer-handle-compaction.md`, §5). `REQ-EVENTS-092` now requires the record made
   durable in the same indivisible step as the trim, and one transaction gives that. **Recorded as an
   improvement so that a future reader does not reinstate the two-step form**, and so that the closure is
   attributed to the requirement that demands it rather than to a convenience of the store.
5. **One database per workspace is one corruption domain**, where per-session directories lost one
   session at a time. SR-4 requires this stated rather than assumed, and it is stated here for the store
   this record owns: a workspace store that becomes unreadable takes every session's history in that
   workspace with it, not one. Scoping per workspace is the bound. **The user's copy out is the export**,
   which is the second reason the export matters and not only `REQ-EVENTS-166`.

   ***Citation corrected 2026-09-02, and the correction matters because it changes what the export is
   for.*** This consequence went on to say: "under `REQ-SESSION-198`'s machine-local store the export is
   now also the only way a history travels with a backup of the workspace, which SR-9(b) mints a
   requirement for." **Both halves are false and must not be cited.** The requirement exists —
   `REQ-SESSION-200` states the disclosure — and it names a *different* remedy as the one that carries
   the store: `REQ-SESSION-201`'s whole-store backup, which is valid while runs are live and which
   restores. So the export is **not** the only way a history travels, and the specification insists the
   two are not interchangeable: "an **export** is a record rendered so that software knowing nothing
   about this product can read it … a **backup** is the store rendered so that this product can put it
   back", neither may be collapsed into the other, and no export may be offered as a way to restore one.
   The export's availability is a **transparency** property again rather than also a durability one,
   which is the division `REQ-SESSION-201` insists on.
6. **A store failure is workspace-wide, not per target.** ADR-0008 consequence 3's per-target isolation
   held because the targets were separate files. The per-*event* isolation of `REQ-EVENTS-032` is
   unaffected and the degrade-to-a-log-line rules of `REQ-EVENTS-078`, `REQ-SESSION-175` and
   `REQ-HOOKS-128` still hold, but a diagnostics failure and a history failure are no longer independent
   events.
7. **The degraded read-only branch for a workspace on shared storage is withdrawn, not narrowed.** The
   previous form of this record said that where write-ahead logging cannot be enabled — a network share,
   some cloud-sync folders — the workspace store opens read-only and degraded, and the history with it.
   **ESC-15 removes the premise**: `REQ-SESSION-198` requires the store to be machine-local always, held
   in this machine's own per-user storage, never inside the workspace and never anywhere the workspace's
   location may be synchronised from, and requires a workspace on a share or in a sync folder to be
   **fully usable**. There is therefore no ordinary configuration in which the history opens degraded, and
   ADR-0058 as rewritten reaches the same place from the store's side: a failure to enable write-ahead
   logging is now a fault reported on `REQ-SESSION-089`'s terms rather than a mode.

   ***Correction, 2026-09-02, and it is a correction to the paragraph above rather than to the
   conclusion.*** The mechanism quoted in the first sentence — *write-ahead logging cannot be enabled, so
   the store opens read-only and degraded* — has since been **measured and found false in both clauses**,
   and ADR-0058 now carries a per-link verdict table in place of the chain. Logging worked over a UNC path
   in 320 process-trials with no failures and no rows lost, while failing on a mapped drive letter to the
   same share, so the behaviour depends on the **path spelling**; and the store never reported itself
   read-only in any network configuration measured — the real failure opens read-**write** and fails reads
   as well as writes, which is larger than read-only rather than smaller. **This record's withdrawal of the
   branch stands and is now over-determined**: the branch is withdrawn because ESC-15 removed the premise,
   *and* the state it described was never observed. **Do not cite the quoted mechanism as a fact about the
   platform** — it is quoted here only as what this record used to say. See
   `spikes/remote-and-synchronised-storage.md` §4.1–4.4 and ADR-0058 alternative J.

   ***One consequence of that measurement does land on this record and is not covered above.*** A
   successful open is **not** evidence of a working store: measured, a store opened, reported and read
   back its journal mode, created its shared-memory companion at the expected size, and threw on the first
   statement, 30 times out of 30. `REQ-EVENTS-179` now requires the store to be **exercised** — a write
   made and then undone — before the run starts, resolving a failure there into `REQ-EVENTS-084` and
   refusing on exactly its terms, with **exactly one attempt and no retry**. `REQ-EVENTS-087`'s
   initialization step is where such a failure will actually appear in this record's own sequence.

   **The history's read-side guarantee is not weakened by any of that**; `REQ-EVENTS-098`'s "a reader must
   not be able to delay or block the writer" is met by the journal mode, and where the journal mode cannot
   be established there is no store and therefore no run (`REQ-EVENTS-084`). *Read that clause on the
   **blocking** reading this record takes in consequence 12: a compliant reader measurably raises the
   writer's commit latency while never blocking it, so the literal reading is unsatisfiable by any store.*
8. **OQ-8 survives untouched.** Journal volume against the cap for `usage.update` is a question about how
   many events a run raises, which the store does not change.
9. **The trim is two commits where a shared transaction would have been one, and that cost is accepted
   without a measurement.** Separating the trim from the append adds one transaction per `cap ÷ 8`
   appends — one in every 2,500 at the cap `REQ-CONFIG-473` registers — so the amortised cost is small by
   construction and the argument does not rest on a number. What is *not* established by inference is the
   trim's own latency: a delete of up to `cap ÷ 8` rows runs on the writer's queue and therefore ahead of
   the next event's commit, and `REQ-EVENTS-091` requires it "before any further event is recorded", so it
   cannot be moved off the path. Against the file design this is the direction of improvement — an O(rows
   deleted) delete replacing an O(file) rewrite that measured **0 of 115 trims completed** — but the
   magnitude on the store is unmeasured and is named in *Revisit if* rather than asserted.
10. **A failed trim is now a state the product can be in, and something must notice it.** This is the price
    of reading `REQ-EVENTS-091` correctly rather than a defect in doing so: a history may sit above its cap
    behind a warning, indefinitely, while the run carries on recording normally. The requirement calls that
    "a bounded and visible cost" — **bounded** because the headroom means a trim is retried on the next
    overflow rather than abandoned, and **visible** because a warning is required. Visible in a log is the
    weakest reading of visible, and no requirement asks for more, so no more is built here; but a
    persistently failing trim on a long run is a growing table with a single warning behind it, which is
    the shape of the silent failure ADR-0024's alternative A had to name. It is recorded so that a
    diagnostics surface has somewhere to look, not because the requirement is defective.
11. **One commit in 136 costs 9–11 ms, deterministically, and this record is where that lands, because
    the history is the store's highest-volume writer.** Measured
    (`../spikes/commit-on-the-publish-path.md`, §6): with SQLite's default `wal_autocheckpoint = 1000`,
    the publish-path transaction writes **7.44 WAL frames**, so the automatic checkpoint fires every
    **135–136 commits** — an observed period so regular that it is what identifies the spikes as the
    checkpoint rather than as scheduler noise. Those commits cost **p50 9,066–10,994 µs, p95
    11,463–14,428 µs, max 53,102 µs**; the other 99.27 % cost **179–220 µs at p50**. On the end-to-end
    path the same period is visible at **6.5–9.2 ms p50** and a worst observed 24.66 ms.

    - **Nothing about it threatens a budget.** A typical checkpointing commit is 3.6 % of
      `REQ-MONITOR-222`'s 250 ms and the worst observed end to end is 9.9 %.
    - **What it does change is what "normal" looks like.** Without the commit the end-to-end interval had
      a maximum of 2.426 ms over 4,000 samples; with it, 63 of 6,000 exceed 5 ms and 29 exceed 10 ms. **Any
      conformance test, diagnostic threshold or alarm built on "an event append takes about two hundred
      microseconds" will see routine excursions of fifty times that, on a fixed period, and must not treat
      them as faults.** That is this record's to state because it is this record's writer that will absorb
      most of them.
    - **Do not turn the autocheckpoint off, and do not make it configurable.** Measured: disabling it
      makes the ordinary commit **31 % slower at p50 and 87 % slower at p95**, because every commit then
      searches a WAL that never resets; grows the WAL to **91 MB in 3,000 commits**; and converts the
      periodic 9 ms spike into a single **155 ms** stall the moment anything checkpoints. The tuning knob
      that looks available here is a trap, and the evidence is on record.
    - **The period moves with the transaction.** 7.44 frames is the *measured* shape — one transcript row,
      one event, one narrow session update. A wider publish-path transaction, or an added index (see
      consequence 2), checkpoints proportionally more often and the tail follows.
12. **A concurrent reader does not block this writer, and the honest reading of `REQ-EVENTS-098` has to be
    stated rather than assumed.** The requirement says "a reader must not be able to delay or block the
    writer". Measured across two OS processes on one store (spike §8): a reader doing whole-session reads
    back to back — 147–1,603 ms per pass, 47,695–82,405 rows over the run — took the writer's commit from
    **p50 163.6 → 345.9 µs and p95 271.7 → 898.9 µs**, with **zero errors and zero `SQLITE_BUSY`**.

    **So a compliant reader measurably raises the writer's latency while never blocking it.** The reading
    this record takes — and it is a reading — is that the requirement's own following sentence fixes its
    sense: *"a store in which one blocks the other does not satisfy this requirement"*. The prohibition is
    on blocking, not on having no measurable effect on scheduling, which no store could offer. On the
    literal reading a doubled median commit is a "delay" and the requirement is unsatisfiable by
    construction. **Named as a reading so that a conformance test is not written against the literal one.**

    Two measured hazards attach. Both are ADR-0058's rules rather than this record's, and they are
    recorded here because this record's writer is what suffers them. A reader that holds a **write**
    transaction — which ADR-0058 rule 4 forbids — produced a single commit of **205.4 ms** for a 200 ms
    hold, and, with no gap between holds, starved the writer indefinitely. And with `busy_timeout = 0`,
    **2,967 of 3,000 commits raised `SQLITE_BUSY`**. The second is this record's worst case rather than a
    slow path: under `REQ-EVENTS-088` the *first* such failure marks the session's history failed for the
    remainder of the run and no further event may be recorded, with one warning. **A contention setting
    therefore turns into a permanently truncated history rather than into a delay**, and the sticky rule is
    what puts the two outcomes so far apart.

## Revisit if

The event catalogue stops being closed, or a requirement asks the history to carry state that is not
also durably recorded elsewhere — either would reopen alternative A. Or a requirement appears that puts
`REQ-EVENTS-166` back on the **write path** — that a third party must read the history *as it is being
written* rather than as an exported copy — which would reopen alternative B and would not be satisfiable
by any export.

**On the trim boundary, which is now settled rather than open:** it reopens only on an amendment, and only
on one of two. If `REQ-EVENTS-091`'s tolerated failed trim is amended away — or if `REQ-EVENTS-088`'s
sticky-failure rule is relaxed so that a rolled-back trim no longer ends the history — the argument above
loses its decisive step and the trim may move back inside the append's transaction, converging with
`REQ-SESSION-133`'s rings. If instead `REQ-SESSION-133`'s "same durable operation" clause is withdrawn, the
two converge the other way. **An argument does not reopen it; the requirements do.**

**On the measurements: one of the two has landed and one has not.**

**The commit figure is in hand and the trigger it guarded did not fire.** The escalation this section
anticipated — *"if the commit figure lands high enough that per-event durability threatens
`REQ-MONITOR-218`'s no-delay publish, that is a conflict between two requirements"* — is **closed on
evidence**. `REQ-MONITOR-218` forbids a minimum wait, debounce or delay floor; a commit is work rather
than a wait; and the whole persist-then-publish interval measured **p95 1.774 ms against
`REQ-MONITOR-222`'s 250 ms**, with zero of 20,000 publications exceeding it. `REQ-EVENTS-029` and
`REQ-MONITOR-218` do not conflict on this path and no escalation is raised.

**But the spike found a way to manufacture the floor `REQ-MONITOR-218` forbids, and it is not ours.** A
second process holding a write transaction turns this record's commit into a wait of exactly that
transaction's length — **205.4 ms measured for a 200 ms hold**, before the transport has done anything.
That is a floor a user would experience, imposed by another process, and what keeps `REQ-MONITOR-218` true
is ADR-0058 rule 4 rather than anything in this record. **Rule 4 is a conformance obligation with a number
attached, not hygiene.** If it is ever relaxed, this trigger reopens immediately.

**The delete figure is still not in hand.** The latency of a `cap ÷ 8` row delete on the writer's queue
(consequence 9) is what prices keeping the headroom, and the commit spike did not measure it — it measured
inserts and one narrow update, and states in terms that it modelled no trim of any kind. Unchanged: if that
figure lands high enough to sit on a budgeted path, the headroom is the tuning knob, since
`REQ-EVENTS-091` permits it rather than requiring it.

**And one figure nobody has asked for yet.** Consequence 2 records that this record's derived envelope
columns will need indexes the measured schema did not have, and that each index adds WAL frames per insert
— which moves both the commit cost and the checkpoint period of consequence 11. **`REQ-EVENTS-175`'s
100 ms filter budget and `REQ-EVENTS-029`'s per-event insert are one trade-off**, and it is unmeasured. If
the indexes needed for the filter axes move the append materially, that is a decision this record must
take rather than inherit.

## First execution — 2026-09-03, the history as a table, and spike 8

*Recorded under GD-10. Two of this record's owed figures landed and one of its declared indexes was dead.*

**Built and run:** schema v2 (`packages/store/src/schema.ts`) — the derived envelope columns, the
truncation record as four columns on the session row, the three filter-axis indexes — and the one
serialiser (`packages/engine/src/events.ts`): compact, keys sorted at every depth, non-ASCII escaped,
a line break refused; the stored `payload` is the wire line and the reader reads it back unchanged.
The trim runs as decided under *Retention* and the truncation record rides inside it.

**Found: the iteration index as first declared was never used.** It was partial (`WHERE iteration IS
NOT NULL`) and lacked the ordinal; the planner chose the primary key and the filter cost **137.7 ms** —
the same as a scan and over `REQ-EVENTS-175`'s 100 ms — while the index sat present and useless in a
migrated store that passed every test. Corrected to a full index with the ordinal last: **7.9 ms** over
2,928 matching events. The lesson is in the spike report and is repeated here because it is this
record's: **a declared index is a claim about a query plan, and the plan must be asserted, not the
declaration.** `store.test.ts` now asserts the plan of every budgeted query.

**Consequence 2's trade-off is now measured and taken.** The three event indexes and the resident
partial index cost **+37 % at p50 and +42 % at p95** on the publish-path commit (205.8 against
149.5 µs), and they move the checkpoint period of consequence 11 **below 100 commits** (the 9–10 ms
checkpoint now sits inside p99). What they buy is every filter axis inside the budget where a scan is
120–135 ms and outside it. The append is still 0.08 % of `REQ-MONITOR-222`.

**The delete figure (consequence 9, *Revisit if*) is in hand: ~35 ms** to drop 2,501 events at the
default cap, on the writer's queue, once per 2,500 appends — 170× a commit, 14 % of the budget,
14 µs amortised. About 30 % of it is index maintenance. It does not sit on a budgeted path often
enough to move one; the headroom stays as the knob and is not turned.

**`REQ-EVENTS-029` held under a real kill:** 3,724 rows and 3,724 events recovered from a 4.2 MB log,
none torn. `REQ-EVENTS-179`'s probe costs 0.15 ms.

**Not exercised:** `REQ-EVENTS-032`'s serialisation-failure path beyond a unit test; the export
(`REQ-EVENTS-172`) and the reader's four damage cases (`REQ-EVENTS-106`); the trim under a concurrent
reader.
