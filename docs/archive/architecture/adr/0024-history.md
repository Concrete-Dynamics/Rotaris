# ADR-0024 — history

The passages of [ADR-0024](../../../architecture/adr/0024-evidence-and-audit-files.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0024-evidence-and-audit-files.md](../../../architecture/adr/0024-evidence-and-audit-files.md), the header:

**The export boundary is a
security property of this record and it now carries the mechanism as well as the reason** — see *The
export boundary, and the one line that must never move*. The gap the previous version reported is
**closed**: `REQ-TOOLS-190` now states the redaction-safety test and grants the verification-gate record
an export, `REQ-EVENTS-163` has been narrowed because it had accidentally granted one to a record that
must never have it, and SR-9(a)'s two exports have landed as `REQ-LIBRARY-176` and `REQ-TRACE-514`.
Consequence 6 was stale in three places and is rewritten.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0024-evidence-and-audit-files.md](../../../architecture/adr/0024-evidence-and-audit-files.md), the header:

Three things land here. **The pairing this record makes
between an entry and its two durable side effects is measured to be free** — a second insert inside a
transaction that is already committing costs **−4 to +31 µs at p50**, so `REQ-EVENTS-072`'s indivisible
step is not a cost this design absorbs. **The first of the two unmeasured export dependencies is now
partly measured and the answer is favourable** — see *Two dependencies of this record's export design*
at the end. And **this record must stop treating a successful store open as evidence of a working
store**, because every write on this path is best-effort with respect to the caller and a store that
opens and then fails is the one configuration in which a security record goes silent without anything
refusing.
