# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Decision 2 and the per-run history — 2026-10-14 (`PD-LIBRARY-002` revision 3 (h), OQ-271, R-072)

Part 9 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Decision 2 and the per-run history — 2026-10-14 (`PD-LIBRARY-002` revision 3 (h), OQ-271, R-072)

Reported back by fin43 (`fin43-analysis-and-artifacts`). Decision 2 kept `source_run_type` at `task_run` on a retrospective
artifact so that REQ-SESSION-021's marker stayed whole and "`REQ-LIBRARY-034`'s history filter keeps meaning what it means";
that stamp did not settle whether a later run's history should hold a retrospective's artifact, and by REQ-LIBRARY-034's letter
it did, with no session for REQ-LIBRARY-025 to record (fin42's
[`a-post-run-analysis-after-a-retrospective-is-never-captured`](../../../defects/fixed/a-post-run-analysis-after-a-retrospective-is-never-captured.md)).
`source_kind` now settles it: `captureImprovementJob` keeps only `post_run` artifacts, dropping the retrospective's before the
bound of five. **Measured:** `analyst.test.ts`'s two revision-3 cases (red on the code before), and `pnpm retrospective-proof`
54 of 54 at a load average of 1.3 to 2.2 on four CPUs, launch 8 (`live-shape-timeout`) still capturing the later run's analysis
after a retrospective with no capture failure in its log. **Not measured:** a live run after a retrospective.
