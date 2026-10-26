# ADR-0004 — One document primitive, three write shapes, and a guarded read side

- **Status:** proposed
- **Date:** 2026-09-02
- **Rescoped:** 2026-08-31 under SR-4 — rule 3 and the writer's-handle discipline deleted. **Revised
  2026-09-01** against the amended specification and the Windows writer-handle spike: three factual claims
  corrected, a second write shape added, and the retry-schedule field restored with exactly one value in it.
- **Revised 2026-09-02.** Two things. **The recorded contradiction with ADR-0009 over the trim's transaction
  boundary is settled here and in ADR-0009, and it is settled against this record** — the generalisation this
  record made is withdrawn and preserved below as the reading it now is. And the remaining file surface has
  been re-derived from the specification rather than carried forward: it was **wrong in four places and short
  in three**, and the corrected inventory is the other substance of this revision.
- **Revised again 2026-09-02**, against `../spikes/remote-and-synchronised-storage.md`, which measured this
  primitive on shared storage. **No decision changes. Two of them stop being inherited and become
  evidence-backed** — the bounded retry ladder, and the refusal to `fsync` the containing directory — and
  the open question this record raised in consequence 9 now has the measurement it was waiting for, which
  makes the specification gap it names materially worse than the record estimated. One factual error about
  ADR-0058's backup mechanism is corrected, and ESC-26's exception to the exclusive-create shape is
  recorded.
- **Origin:** DATA (ADR-DATA-02, Spike 1); the writer-handle-and-compaction spike, 2026-08-31;
  the remote-and-synchronised-storage spike, 2026-09-02
- **Depends on:** ADR-0003, ADR-0058
- **Constrains:** ADR-0029, ADR-0032, ADR-0036, ADR-0040, ADR-0042

## Parts

Since 2026-10-26 the rest of this document is in [`0004-the-atomic-document-primitive/`](0004-the-atomic-document-primitive/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0004-the-atomic-document-primitive/01-context.md) | Context; The remaining file surface; What was wrong, and what was missing; Spike evidence |
| [02](0004-the-atomic-document-primitive/02-alternatives-considered.md) | Alternatives considered |
| [03](0004-the-atomic-document-primitive/03-decision.md) | Decision; The trim's transaction boundary — settled, against this record |
| [04](0004-the-atomic-document-primitive/04-consequences-accepted.md) | Consequences accepted |
| [05](0004-the-atomic-document-primitive/05-revisit-if.md) | Revisit if |
