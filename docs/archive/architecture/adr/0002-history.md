# ADR-0002 — history

The passages of [ADR-0002](../../../architecture/adr/0002-process-topology.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0002-process-topology.md](../../../architecture/adr/0002-process-topology.md), the header:

The topology is **confirmed by
measurement, not reopened**: the "Revisit if" clause that turned on it is discharged and retired, and
the `MessagePort` remedy is recorded as an available option rather than as a contingency.

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0002-process-topology.md](../../../architecture/adr/0002-process-topology.md), the header:

Consequence 11 gains the three obligations
it created and did not state — the refusal to start runs must be in force **before** liveness is judged;
every acknowledgement is bounded and expiry **refuses** rather than proceeds; and the refusal is a lease
the run host expires by itself, because a process that has died cannot release anything. All three were
being carried by ADR-0058 alone, which is the wrong place for properties of this capability.
