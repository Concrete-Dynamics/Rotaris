# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-1. *History: [the revision of 2026-08-31](../../archive/architecture/adr/0055-history.md#revision-2026-08-31).*
- **Revised:** 2026-09-01, to carry SR-7 and the first-paint measurement. *History: [the revision of 2026-09-01](../../archive/architecture/adr/0055-history.md#revision-2026-09-01).*
- **Revised:** 2026-09-02, against the settled specification. *History: [the revision of 2026-09-02](../../archive/architecture/adr/0055-history.md#revision-2026-09-02).*
- **Revised:** 2026-09-02, a second time. *History: [the revision of 2026-09-02](../../archive/architecture/adr/0055-history.md#revision-2026-09-02-2).*
- **Origin:** UI (ADR-UI-13)
- **Depends on:** ADR-0002, ADR-0042, ADR-0048, ADR-0049, ADR-0050, ADR-0054, ADR-0056, ADR-0058
- **Governed by:** `owner-decisions.md` SR-1, SR-7, and the consequence for ADR-0058 recorded with ESC-21
- **Evidence:** `../spikes/presenter-liveness-and-instance-claim.md` §5 — the measurement that discharges
  and fails this record's verification obligation on the instance claim;
  `../spikes/cached-portable-launch.md` — the portable's steady-state launch, which fixes phase −1's cost
  and the budget arithmetic of consequence 8; `../spikes/packaged-first-paint.md` for the installed
  flavours and for the portable target SR-7 replaced.

## Parts

Since 2026-10-26 the rest of this document is in [`0055-startup-sequencing/`](0055-startup-sequencing/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0055-startup-sequencing/01-context.md) | Context |
| [02](0055-startup-sequencing/02-alternatives-considered.md) | Alternatives considered; For the instance claim; For the paint sequence |
| [03](0055-startup-sequencing/03-decision.md) | Decision; Phase −1 — the launch preparation, on the `onefile` portable only; Phase 0 — the instance claim, before anything else |
| [04](0055-startup-sequencing/04-the-update-restart-is-a-hand-over-of-the-record.md) | The update restart is a hand-over of the record — and with the claim moved, we have a verb for it; Verification obligation on `REQ-STARTUP-164` — taken, 2026-09-02, and it fired; Phase 1 onward — the paint sequence |
| [05](0055-startup-sequencing/05-consequences-accepted.md) | Consequences accepted |
| [06](0055-startup-sequencing/06-open-question.md) | Open question |
| [07](0055-startup-sequencing/07-discharged-the-slowest-artifact-clause-retired.md) | Discharged — the slowest-artifact clause, retired 2026-09-01 |
| [08](0055-startup-sequencing/08-discharged-the-two-clauses-that-fired-retired.md) | Discharged — the two clauses that fired, retired 2026-09-02 |
| [09](0055-startup-sequencing/09-revisit-if.md) | Revisit if |
| [10](0055-startup-sequencing/10-first-execution-2026-09-03-the-walking-skeleton.md) | First execution — 2026-09-03, the walking skeleton |
| [11](0055-startup-sequencing/11-corrected-on-the-overviews-first-execution-2026.md) | Corrected on the Overview's first execution — 2026-09-05: a view's start-time read arrives before the workspace is open |
| [12](0055-startup-sequencing/12-preceded-by-the-reserved-token-branch-2026-09.md) | Preceded by the reserved-token branch — 2026-09-06, Part T (ADR-0035's first execution) |
| [13](0055-startup-sequencing/13-the-builder-first-executed-2026-09-12-and.md) | The builder — first executed 2026-09-12, and consequence 6 is what it cost |
| [14](0055-startup-sequencing/14-the-resolution-precedence-and-the-deferred.md) | The resolution precedence and the deferred offer — first executed 2026-09-12 |
| [15](0055-startup-sequencing/15-corrected-2026-10-07-fin30-where-the-unix.md) | Corrected 2026-10-07 (fin30): where the unix socket lives, and a claim that cannot listen |
| [16](0055-startup-sequencing/16-the-unit-suite-on-windows-11-arm64-2026-10-15.md) | The unit suite on Windows 11 ARM64 — 2026-10-15: the claim's Windows spellings ran, the pipe's order cases did not |
| [17](0055-startup-sequencing/17-the-claim-over-a-named-pipe-measured-2026-10-21.md) | The claim over a named pipe, measured — 2026-10-21 (the Windows ARM64 session's C6) |
