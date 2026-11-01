# ADR-0004 — One document primitive, three write shapes, and a guarded read side

- **Status:** proposed
- **Date:** 2026-09-02
- **Rescoped:** 2026-08-31 under SR-4 — rule 3 and the writer's-handle discipline deleted. **Revised
  2026-09-01** against the amended specification and the Windows writer-handle spike: three factual claims
  corrected, a second write shape added, and the retry-schedule field restored with exactly one value in it.
- **Revised 2026-09-02.** *History: [the revision of 2026-09-02](../../archive/architecture/adr/0004-history.md#revision-2026-09-02).*
- **Revised again 2026-09-02**, against `../spikes/remote-and-synchronised-storage.md`, which measured this
  primitive on shared storage. *History: [the revision of 2026-09-02](../../archive/architecture/adr/0004-history.md#revision-2026-09-02-2).*
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
