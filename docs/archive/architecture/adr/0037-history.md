# ADR-0037 — history

The passages of [ADR-0037](../../../architecture/adr/0037-when-a-configuration-change-takes-effect.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0037-when-a-configuration-change-takes-effect.md](../../../architecture/adr/0037-when-a-configuration-change-takes-effect.md), the header:

**The escalation this record carried is ruled** — `owner-decisions.md` ESC-1,
option 2 — so the Escalation section becomes a Decision with the alternatives preserved. The three
tiers are unchanged. Two other things moved: why configuration stays in files is now stated in the
specification on grounds that are **not** the ones SR-4 originally gave (`REQ-CONFIG-477`, ESC-14),
and Tier B's record of what a run actually used is a row rather than a file (SR-4).
