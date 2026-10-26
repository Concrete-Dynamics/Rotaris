# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-02, under `owner-decisions.md` SR-1, SR-3, SR-4 and ESC-14, and against the
  specification as amended — `REQ-TRACE-513` (new), `REQ-TRACE-089` (index clause, new),
  `REQ-TRACE-514` (new, ADR-0041's)
- **Origin:** DATA (ADR-DATA-06)
- **Depends on:** ADR-0001, ADR-0002, ADR-0003, ADR-0038
- **Evidence:** `spikes/windows-writer-handle-compaction.md` §3.1–3.2

> **Summary of what changed, and it is two things pulling in opposite directions.** The store still does
> not move — `REQ-TRACE-513` now states as a requirement that the requirement documents, the generated
> symbol artifact, the three baselines and the retired-identifier log **SHALL be plain files in the
> user's own repository and SHALL NOT be moved into any store the application keeps for itself**, on
> four independently sufficient grounds. That closes the placement question against the record's own
> earlier hedging. But `REQ-TRACE-089`, which this ADR treated as an absolute prohibition on any derived
> state, has been amended to **permit an index** — held anywhere, including in the application's own
> store — subject to exactly one distinction: an index that is *consulted* is forbidden, an index that
> is *validated against the files* is allowed. `REQ-TRACE-513` closes with the same permission and no
> other: "what MAY be held in a store is an **index** over these files, on the terms `REQ-TRACE-089`
> fixes and on no others."
>
> So alternative C is not refused wholesale any more, and this record must say which half of it survives
> and which does not. Specific 7 is rewritten to be that boundary rather than a blanket. `REQ-TRACE-502`
> is unchanged, and OQ-41 is unchanged in kind: SR-1 narrows it sharply, SR-4 does not dissolve it, and
> `REQ-TRACE-513` now makes that non-dissolution a requirement rather than this record's objection.

## Parts

Since 2026-10-26 the rest of this document is in [`0040-the-traceability-engine/`](0040-the-traceability-engine/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0040-the-traceability-engine/01-context.md) | Context |
| [02](0040-the-traceability-engine/02-alternatives-considered.md) | Alternatives considered |
| [03](0040-the-traceability-engine/03-decision.md) | Decision; What the SR rulings dissolve here |
| [04](0040-the-traceability-engine/04-consequences-accepted.md) | Consequences accepted |
| [05](0040-the-traceability-engine/05-revisit-if.md) | Revisit if |
| [06](0040-the-traceability-engine/06-first-execution-2026-09-09-part-aj.md) | First execution — 2026-09-09 (Part AJ) |
| [07](0040-the-traceability-engine/07-second-execution-2026-09-09-part-aj.md) | Second execution — 2026-09-09 (Part AJ′) |
| [08](0040-the-traceability-engine/08-third-execution-2026-09-11-part-r-the-linear.md) | Third execution — 2026-09-11 (Part R″), the linear-growth assertions made honest |
