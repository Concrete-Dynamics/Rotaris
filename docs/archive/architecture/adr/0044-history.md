# ADR-0044 — history

The passages of [ADR-0044](../../../architecture/adr/0044-the-ipc-contract.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0044-the-ipc-contract.md](../../../architecture/adr/0044-the-ipc-contract.md), the header:

**This record was wrong about a mechanism and now says so.** Measurement
falsified the premise that a distinct Electron IPC channel name gives terminal frames a lane of their
own. The outcome the premise was defending still holds, but it is supplied by ADR-0021's coalescing
cap, not by the channel split, and that cap is therefore now load-bearing for `REQ-MONITOR-222`.
