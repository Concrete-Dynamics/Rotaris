# ADR-0014 — history

The passages of [ADR-0014](../../../architecture/adr/0014-cancellation-teardown-and-quit.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0014-cancellation-teardown-and-quit.md](../../../architecture/adr/0014-cancellation-teardown-and-quit.md), the header:

**The choreography is unchanged.** What changed is what a force exit can
actually lose — consequence 2 was wrong on both of its clauses — and what can make the force-exit
backstop fire for a reason that is not the run's fault.
