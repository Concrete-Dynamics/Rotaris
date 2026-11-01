# ADR-0032 — history

The passages of [ADR-0032](../../../architecture/adr/0032-discovery-snapshot-effective-configuration.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0032-discovery-snapshot-effective-configuration.md](../../../architecture/adr/0032-discovery-snapshot-effective-configuration.md), the header:

**This record needed less correction than any other in its group and that is
worth saying plainly: the four pure functions, the provenance-carrying entries, the two-types rule and
the type-level unconstructibility are all unchanged.** Two things did move — why the snapshot stays a
file is now stated in the specification rather than inherited from a ruling whose grounds were
withdrawn (`REQ-CONFIG-477`, `owner-decisions.md` ESC-14), and `REQ-PROVIDER-152` was rewritten under
**SR-1**, which makes consequence 4's description of the lock wrong on three counts.
