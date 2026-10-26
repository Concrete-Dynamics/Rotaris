# ADR-0056 — The build toolchain

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. The build gains an output this record did not contemplate — the Windows
  portable's launcher stub — because SR-7 moved that artifact off the packaging tool's own portable
  target (ADR-0054 alternative P4). The bundle-size revisit clause is restated on measurement, which
  points somewhere other than where it pointed.
- **Revised:** 2026-09-02. The build gains an **obligation** it did not carry: rebuilding the product's
  native modules against the Electron binary interface, for every target, proved at build time. ESC-21's
  comparison surfaced the store binding failing silently under an Electron runtime through an ABI
  mismatch, and the owner recorded that as this record's to design for rather than to discover.
- **Revised:** 2026-09-02, second time, against defect **D10**. Rule 1 gains 1a: the rebuild's exit status
  is not evidence anything was rebuilt. `electron-rebuild` against the chosen store binding exits 0, prints
  success and produces no compiled binary, and the binding's loader would prefer a prebuilt one over
  anything built beside it. **Rule 4's load is no longer one check among several; it is the check.**
- **Origin:** UI (ADR-UI-15)
- **Depends on:** ADR-0001, ADR-0002, ADR-0020, ADR-0044, ADR-0053, ADR-0054, ADR-0058
- **Governed by:** `owner-decisions.md` SR-7, and the consequence for ADR-0058 recorded with ESC-21
- **Evidence:** `../spikes/packaged-first-paint.md` §1 for the two runtimes' versions

## Parts

Since 2026-10-26 the rest of this document is in [`0056-the-build-toolchain/`](0056-the-build-toolchain/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0056-the-build-toolchain/01-context.md) | Context |
| [02](0056-the-build-toolchain/02-alternatives-considered.md) | Alternatives considered; For the native modules — how the Electron interface is guaranteed rather than hoped for |
| [03](0056-the-build-toolchain/03-decision.md) | Decision; The native-module obligation — alternative N3, stated as five rules |
| [04](0056-the-build-toolchain/04-consequences-accepted.md) | Consequences accepted |
| [05](0056-the-build-toolchain/05-revisit-if.md) | Revisit if |
| [06](0056-the-build-toolchain/06-first-execution-2026-09-03-the-walking-skeleton.md) | First execution — 2026-09-03, the walking skeleton |
| [07](0056-the-build-toolchain/07-second-execution-2026-09-04-the-first-packaging.md) | Second execution — 2026-09-04, the first packaging, and IC-6 |
| [08](0056-the-build-toolchain/08-third-execution-2026-09-05-the-toolchains.md) | Third execution — 2026-09-05, the toolchain's fourth defect: the collector's `EMFILE` |
| [09](0056-the-build-toolchain/09-fourth-execution-2026-09-11-the-seams-stop.md) | Fourth execution — 2026-09-11, the seams stop shipping, and the build is made to say so |
| [10](0056-the-build-toolchain/10-the-electron-pin-moves-to-4430-2026-10-22-r-081.md) | The Electron pin moves to 44.3.0 — 2026-10-22 (R-081) |
