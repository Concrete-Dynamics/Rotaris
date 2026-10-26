# ADR-0046 — The transcript apply pipeline, and where determinism is enforced

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-3: the sequence check becomes step 0 of this stage, and the
  interaction between gap recovery and the benchmark's determinism claim is settled here rather than
  left to the implementation.
- **Origin:** UI (ADR-UI-04)
- **Depends on:** ADR-0006, ADR-0010, ADR-0043, ADR-0045
- **Governed by:** `owner-decisions.md` SR-3

## Parts

Since 2026-10-26 the rest of this document is in [`0046-the-transcript-apply-pipeline/`](0046-the-transcript-apply-pipeline/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0046-the-transcript-apply-pipeline/01-context.md) | Context |
| [02](0046-the-transcript-apply-pipeline/02-alternatives-considered.md) | Alternatives considered |
| [03](0046-the-transcript-apply-pipeline/03-decision.md) | Decision; What happens during a burst, so recovery cannot thrash; Notes that follow from the constraints and are easy to get wrong |
| [04](0046-the-transcript-apply-pipeline/04-consequences-accepted.md) | Consequences accepted |
| [05](0046-the-transcript-apply-pipeline/05-revisit-if.md) | Revisit if |
| [06](0046-the-transcript-apply-pipeline/06-first-execution-2026-09-07-the-whole-pipeline.md) | First execution — 2026-09-07, the whole pipeline (Part Z); Steps 0–2, as they stand (built 2026-09-03, reported elsewhere); Step 3 — the row-level classification (`replica.ts`, `classifyRows`); Step 4 — the projection (`transcript/project.ts`); Step 5 — present (`transcript/TranscriptPane.tsx`); The reading-question limbs, stated rather than reported as met; The upstream slice, which a renderer cannot repair (`engine`, `model`); A third defect, found by the same measurement and fixed the same way; Measured |
| [07](0046-the-transcript-apply-pipeline/07-the-merge-with-part-aa-2026-09-07-step-4s-group.md) | The merge with Part AA — 2026-09-07: step 4's group summary was written in the wrong order |
| [08](0046-the-transcript-apply-pipeline/08-step-4s-req-chat-048-lookback-per-agent-2026-09.md) | Step 4's REQ-CHAT-048 lookback, per agent — 2026-09-28 |
