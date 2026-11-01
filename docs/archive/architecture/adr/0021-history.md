# ADR-0021 — history

The passages of [ADR-0021](../../../architecture/adr/0021-the-terminal-screen-model-and-stream-fan-out.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0021-the-terminal-screen-model-and-stream-fan-out.md](../../../architecture/adr/0021-the-terminal-screen-model-and-stream-fan-out.md), the header:

**This record's frame-rate cap has
become load-bearing for `REQ-MONITOR-222` and is no longer a display concern**, because the mechanism
ADR-0044 relied on for the same protection was measured and does not work. Nothing about the screen
model, the placement of the authoritative emulator, or the frame vocabulary changes.
