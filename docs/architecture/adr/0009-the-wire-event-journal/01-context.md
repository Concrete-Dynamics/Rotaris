# ADR-0009 — The event history as a table, with the line-delimited form as an export — Context

Part 1 of 7 of [ADR-0009](../0009-the-wire-event-journal.md), which indexes every part.

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
