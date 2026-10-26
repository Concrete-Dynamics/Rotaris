# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool

- **Status:** proposed — **no longer blocked.** `owner-decisions.md` **ESC-13** is ruled, and the
  `renderer-invariance-and-benchmark-cadence` spike measured everything this record said it could not
  yet demonstrate.
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **Two things changed and both are of the kind worth naming.** A **ruling**
  removed OQ-28's power to withdraw this record: ESC-13 decides that if OQ-28 resolves to the
  framework-neutral reading then `REQ-UIBENCH-054` is relaxed and the canvas is refused outright — so
  the answer to OQ-28 now changes a benchmark field and nothing a user can see. A **measurement**
  converted four of this record's open risks into settled facts and confirmed one of its predictions
  against a running window. One thing got worse: the settle signal this record owes the benchmark
  cannot be the offscreen paint event, and that is measured too.
- **Origin:** UI (ADR-UI-03)
- **Depends on:** ADR-0001, ADR-0043
- **This is the tightest constraint in the interface, and the one most likely to be got wrong by
  defaulting to the obvious answer.**

## Parts

Since 2026-10-26 the rest of this document is in [`0045-what-paints-the-transcript/`](0045-what-paints-the-transcript/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0045-what-paints-the-transcript/01-context.md) | Context |
| [02](0045-what-paints-the-transcript/02-alternatives-considered.md) | Alternatives considered |
| [03](0045-what-paints-the-transcript/03-decision.md) | Decision; What ESC-13 settled, and why it de-blocks this record |
| [04](0045-what-paints-the-transcript/04-consequences-accepted.md) | Consequences accepted |
| [05](0045-what-paints-the-transcript/05-revisit-if.md) | Revisit if |
| [06](0045-what-paints-the-transcript/06-first-execution-2026-09-07-the-recycled-pool-in.md) | First execution — 2026-09-07, the recycled pool in the product (Part Z); Found — the first defect, and it is the record's rather than the code's: the rule cannot count a conditional pane; Measured, in the product, at REQ-UIBENCH-060's own sizes; The other measurements the record asked for; Carried, and owed |
| [07](0045-what-paints-the-transcript/07-the-merge-with-part-aa-2026-09-07-two-defects.md) | The merge with Part AA — 2026-09-07: two defects the recycler only has when a real row is in the slot; Rendering finding — 2026-09-14; The measurement point under a burst — 2026-09-28, the round R-048 authorized, taken under R-062 |
