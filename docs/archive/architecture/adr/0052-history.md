# ADR-0052 — history

The passages of [ADR-0052](../../../architecture/adr/0052-one-instrumentation-registry.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0052-one-instrumentation-registry.md](../../../architecture/adr/0052-one-instrumentation-registry.md), the header:

The one-registry decision is unchanged. Three things it did not account for
are now on it: **SR-4** moves the session stores this registry must count out of memory and into a
database, and the `ipc-hop-latency` spike establishes both **what** the relay's failure actually looks
like — which is not what ADR-0044 consequence 4 assumes — and that **`performance.timeOrigin` is not a
shared clock**, which invalidates any interval this registry assembles from two processes' stamps.
