# ADR-0050 — history

The passages of [ADR-0050](../../../architecture/adr/0050-theming-and-the-accessibility-floors.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="struck-2026-09-30"></a>

**The struck text of 2026-09-30**, from [0050-theming-and-the-accessibility-floors/12-fifth-execution-2026-09-29-r-067-the-four.md](../../../architecture/adr/0050-theming-and-the-accessibility-floors/12-fifth-execution-2026-09-29-r-067-the-four.md), “Fifth execution — 2026-09-29 (R-067), the four derived on the ground the dock paints”:

~~Its full matrix on the branch failed only on `rotaris-dim` at 150 % and 175 %, both times on status-strip text and
never on a slash role. Rebuilt with `highlight.ts` reverted, the 150 % case still failed. The same case passed on
origin/main built in a checkout whose path is five characters longer, which shifts the elided strip item across the
device-pixel grid.~~
