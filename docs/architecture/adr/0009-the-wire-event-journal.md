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

## Parts

Since 2026-10-26 the rest of this document is in [`0009-the-wire-event-journal/`](0009-the-wire-event-journal/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0009-the-wire-event-journal/01-context.md) | Context |
| [02](0009-the-wire-event-journal/02-alternatives-considered.md) | Alternatives considered |
| [03](0009-the-wire-event-journal/03-decision.md) | Decision; What a row holds; Where `REQ-EVENTS-166` lives; Append: one committed transaction per event; Ordering and the single writer — stated, not assumed; Retention: what bounding means for a table; The disagreement with ADR-0004 — settled, 2026-09-02; The truncation record: the data survives, the file does not; Store lifecycle and failure; Reading; The two terminal-result paths |
| [04](0009-the-wire-event-journal/04-consequences-accepted.md) | Consequences accepted |
| [05](0009-the-wire-event-journal/05-revisit-if.md) | Revisit if |
| [06](0009-the-wire-event-journal/06-first-execution-2026-09-03-the-history-as-a.md) | First execution — 2026-09-03, the history as a table, and spike 8 |
| [07](0009-the-wire-event-journal/07-second-execution-2026-09-05-one-ordinal-series.md) | Second execution — 2026-09-05, one ordinal series across a resumed session |
