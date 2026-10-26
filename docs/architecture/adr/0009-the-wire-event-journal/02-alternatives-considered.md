# ADR-0009 — The event history as a table, with the line-delimited form as an export — Alternatives considered

Part 2 of 7 of [ADR-0009](../0009-the-wire-event-journal.md), which indexes every part.

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
