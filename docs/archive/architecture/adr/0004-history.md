# ADR-0004 — history

The passages of [ADR-0004](../../../architecture/adr/0004-the-atomic-document-primitive.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0004-the-atomic-document-primitive.md](../../../architecture/adr/0004-the-atomic-document-primitive.md), the header:

Two things. **The recorded contradiction with ADR-0009 over the trim's transaction
boundary is settled here and in ADR-0009, and it is settled against this record** — the generalisation this
record made is withdrawn and preserved below as the reading it now is. And the remaining file surface has
been re-derived from the specification rather than carried forward: it was **wrong in four places and short
in three**, and the corrected inventory is the other substance of this revision.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0004-the-atomic-document-primitive.md](../../../architecture/adr/0004-the-atomic-document-primitive.md), the header:

**No decision changes. Two of them stop being inherited and become
evidence-backed** — the bounded retry ladder, and the refusal to `fsync` the containing directory — and
the open question this record raised in consequence 9 now has the measurement it was waiting for, which
makes the specification gap it names materially worse than the record estimated. One factual error about
ADR-0058's backup mechanism is corrected, and ESC-26's exception to the exclusive-create shape is
recorded.
