# ADR-0056 — history

The passages of [ADR-0056](../../../architecture/adr/0056-the-build-toolchain.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0056-the-build-toolchain.md](../../../architecture/adr/0056-the-build-toolchain.md), the header:

The build gains an output this record did not contemplate — the Windows
portable's launcher stub — because SR-7 moved that artifact off the packaging tool's own portable
target (ADR-0054 alternative P4). The bundle-size revisit clause is restated on measurement, which
points somewhere other than where it pointed.

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0056-the-build-toolchain.md](../../../architecture/adr/0056-the-build-toolchain.md), the header:

The build gains an **obligation** it did not carry: rebuilding the product's
native modules against the Electron binary interface, for every target, proved at build time. ESC-21's
comparison surfaced the store binding failing silently under an Electron runtime through an ABI
mismatch, and the owner recorded that as this record's to design for rather than to discover.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0056-the-build-toolchain.md](../../../architecture/adr/0056-the-build-toolchain.md), the header:

Rule 1 gains 1a: the rebuild's exit status
is not evidence anything was rebuilt. `electron-rebuild` against the chosen store binding exits 0, prints
success and produces no compiled binary, and the binding's loader would prefer a prebuilt one over
anything built beside it. **Rule 4's load is no longer one check among several; it is the check.**
