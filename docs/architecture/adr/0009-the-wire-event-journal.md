# ADR-0009 — The event history as a table, with the line-delimited form as an export

- **Status:** proposed
- **Date:** 2026-09-01
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
  **ADR-0004 and this record disagree here, narrowly and reportably.** ADR-0004 as rewritten says "a trim
  is a `DELETE` inside the transaction that made the insert", cites `REQ-SESSION-133` for it, and
  concludes that `REQ-EVENTS-098`'s no-racing rule "is discharged by the transaction rather than by a
  queue discipline". Both halves are right for the audit and evidence rings ADR-0024 owns, where
  `REQ-SESSION-133` requires exactly that. Neither is right for the event history: `REQ-EVENTS-091` states
  no such rule, tolerates a failed trim in a way a shared transaction cannot express, and
  `REQ-EVENTS-098` has since been amended to require the serialisation "even where the store's own
  guarantees already make two writers unable to corrupt one another". The two stores diverge here and the
  divergence is in the requirements. This is reported rather than settled unilaterally.
- **The truncation record is inside the trim's transaction.** `REQ-EVENTS-092` requires it made durable
  "in the same indivisible step as the trim that produced it, so it can never report a trim that did not
  happen or omit one that did". See consequence 4: this closes a crash window the file design accepted,
  and the window has been measured.

ADR-0024 reaches the opposite arrangement for the audit and evidence rings — per-entry displacement
inside the entry's own transaction — and the difference is in the requirements rather than in taste.
`REQ-EVENTS-091` *states* a permitted headroom and tolerates a failed trim; `REQ-SESSION-133` and
`REQ-TOOLS-078` state no headroom and `REQ-SESSION-133` now *requires* the trim to take effect in the
same durable operation that records the entry. The two stores are not unified on this point and should
not be.

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
2. **Per-event commit is a real cost on the run host's loop, and it is still not measured.** It is the
   reason ADR-0002 keeps the run host off the window layer. The file design's per-event durable write
   cost **0.518 ms p50** with an `fsync` and 0.0135 ms without one
   (`../spikes/windows-writer-handle-compaction.md`, §3.3); ADR-0058's ordinary commit performs no
   `fsync` and should therefore cost less, but that is inference. The transport spike measured from the
   publish call onward and states in terms that "the database commit `REQ-MONITOR-221` requires before
   publication" is outside its interval, so every figure it reports is a lower bound on the
   requirement's own interval (`../spikes/ipc-hop-latency.md`, §8). **No measurement of a commit on this
   path exists**, and this record does not claim one.
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
   which is the second reason the export matters and not only `REQ-EVENTS-166` — and under
   `REQ-SESSION-198`'s machine-local store the export is now also the only way a history travels with a
   backup of the workspace, which SR-9(b) mints a requirement for.
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
   logging is now a fault reported on `REQ-SESSION-089`'s terms rather than a mode. **The history's
   read-side guarantee is not weakened by that**; `REQ-EVENTS-098`'s "a reader must not be able to delay
   or block the writer" is met by the journal mode, and where the journal mode cannot be established there
   is no store and therefore no run (`REQ-EVENTS-084`).
8. **OQ-8 survives untouched.** Journal volume against the cap for `usage.update` is a question about how
   many events a run raises, which the store does not change.

## Revisit if

The event catalogue stops being closed, or a requirement asks the history to carry state that is not
also durably recorded elsewhere — either would reopen alternative A. Or a requirement appears that puts
`REQ-EVENTS-166` back on the **write path** — that a third party must read the history *as it is being
written* rather than as an exported copy — which would reopen alternative B and would not be satisfiable
by any export. Or `REQ-EVENTS-091`'s tolerated failed trim is amended away, in which case the trim may
move back inside the append's transaction and this record's disagreement with ADR-0004 disappears.
