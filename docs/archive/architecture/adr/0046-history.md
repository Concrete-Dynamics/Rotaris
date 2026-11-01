# ADR-0046 — history

The passages of [ADR-0046](../../../architecture/adr/0046-the-transcript-apply-pipeline.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="struck-2026-10-13"></a>

**The struck text of 2026-10-13**, from [0046-the-transcript-apply-pipeline/06-first-execution-2026-09-07-the-whole-pipeline.md](../../../architecture/adr/0046-the-transcript-apply-pipeline/06-first-execution-2026-09-07-the-whole-pipeline.md), “First execution — 2026-09-07, the whole pipeline (Part Z)”:

~~**REQ-CHAT-073 is met in one clause of two.** Its second clause — "and the Clear action MUST be disabled" — names
  an action section 14 would have built. `clearTranscript` answers `false` and no Clear action exists anywhere in
  this build, so the clause has nothing to be true of. It is not a defect and not a waiver.~~
