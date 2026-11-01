# ADR-0023 — history

The passages of [ADR-0023](../../../architecture/adr/0023-network-egress-and-fetch.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="struck-2026-10-13"></a>

**The struck text of 2026-10-13**, from [0023-network-egress-and-fetch.md](../../../architecture/adr/0023-network-egress-and-fetch.md), “Second execution — 2026-09-05, the `fetch` tool and the egress it enforces (Part N)”:

~~The run's own abort mid-fetch is
`network_error` ("cancelled by the run"), never `timeout`.~~
