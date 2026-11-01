# ADR-0045 — history

The passages of [ADR-0045](../../../architecture/adr/0045-what-paints-the-transcript.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0045-what-paints-the-transcript.md](../../../architecture/adr/0045-what-paints-the-transcript.md), the header:

**Two things changed and both are of the kind worth naming.** A **ruling**
removed OQ-28's power to withdraw this record: ESC-13 decides that if OQ-28 resolves to the
framework-neutral reading then `REQ-UIBENCH-054` is relaxed and the canvas is refused outright — so
the answer to OQ-28 now changes a benchmark field and nothing a user can see. A **measurement**
converted four of this record's open risks into settled facts and confirmed one of its predictions
against a running window. One thing got worse: the settle signal this record owes the benchmark
cannot be the offscreen paint event, and that is measured too.
