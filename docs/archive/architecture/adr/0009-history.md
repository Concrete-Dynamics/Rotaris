# ADR-0009 — history

The passages of [ADR-0009](../../../architecture/adr/0009-the-wire-event-journal.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0009-the-wire-event-journal.md](../../../architecture/adr/0009-the-wire-event-journal.md), the header:

The trim's transaction boundary, recorded as a disagreement with ADR-0004 and
settled by neither, is **settled here in this record's favour** on an argument neither record had made.
ADR-0004 has withdrawn its sentence and preserved it as the reading it now is; this record does the same
from its side, in the new section under *Retention*.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0009-the-wire-event-journal.md](../../../architecture/adr/0009-the-wire-event-journal.md), the header:

**Consequence 2's
"still not measured" is discharged, and the measurement changes a reason rather than a conclusion.**
Per-event durability stays, and no longer stays because `REQ-EVENTS-029` forecloses batching "whatever
it costs" — **there is no cost to absorb**: the event insert rides the row's transaction at a marginal
p50 of **−4 to +31 µs**, inside the noise. A second measured result belongs to this record because the
history is the store's highest-volume writer: **one commit in 136 costs 9–11 ms** while the rest cost
179–220 µs at p50. And one thing this record must *stop* assuming is corrected under *Store lifecycle
and failure*: a successful open is not evidence of a working store.
