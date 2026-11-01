# ADR-0053 — history

The passages of [ADR-0053](../../../architecture/adr/0053-the-benchmark-harness.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0053-the-benchmark-harness.md](../../../architecture/adr/0053-the-benchmark-harness.md), the header:

**The settle mechanism this record chose does not work and is replaced.**
Offscreen rendering — the window choice — is confirmed and unchanged; the *signal* the phase timing
closed on is withdrawn on measurement. This revision also settles how a phase is driven, which the
record previously left implicit and which turns out to decide `REQ-UIBENCH-118` on its own.
