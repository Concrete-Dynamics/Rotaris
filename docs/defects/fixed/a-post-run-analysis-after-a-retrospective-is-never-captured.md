## A post-run analysis after a retrospective is never captured

Once a workspace stores a retrospective artifact (PD-LIBRARY-002), every later run's post-run analysis fails at its capture
and never runs, for as long as that artifact is among the five newest prior artifacts. A retrospective artifact carries
`source_session_id` null (revision 2 (a)) and `source_run_type` `task_run`, so the post-run capture's prior-artifact filter
(REQ-LIBRARY-034: not `task_run` excluded, the current session's own excluded) keeps it, and `considered_session_ids` is
built from every kept artifact's `source_session_id`, null included. `ImprovementAnalysisJobSchema` requires each id to be
a non-empty string, so the parse throws; the run host logs "improvements: capture failed for <session>, no job: … expected
string, received null" at `warning`, and no job, no indicator, no artifact and no notice follow. Found by
`retrospective-proof`'s eighth launch on 2026-10-13 (fin42): a run after a retrospective in the same workspace, its analyst
scripted never to answer, read the notice "The run completed." and stored no artifact.

## Specs

REQ-LIBRARY-123 (a completed task run's analysis is captured and queued), REQ-LIBRARY-025 (`considered_session_ids` records
the source-session id of each prior artifact supplied as history — a retrospective artifact has none to record), and
PD-LIBRARY-002's reach clause ("Its output lands in the same store"), which a later post-run pass cannot then survive.
Whether a retrospective artifact belongs to a post-run analysis's history at all is not said; raised as OQ-271.

## Relevant files

- `packages/engine/src/improvements/capture.ts` — `captureImprovementJob`: the prior-artifact filter and
  `considered_session_ids` built from it.
- `packages/contracts/src/improvements.ts` — `ImprovementAnalysisJobSchema.considered_session_ids`: `z.array(z.string().min(1))`.
- `apps/desktop/src/run-host/improvement-capture.ts` — the capture's caller, which logs the failure and queues nothing.
- `apps/desktop/scripts/retrospective-proof.mjs` — launch 8's `live-shape-timeout`, the reproduction in the built app.

## Outcome

Repaired 2026-10-13 by fin42 (branch `fin42-timeout-and-retro`). `captureImprovementJob` records, in `considered_session_ids`,
the source session of each prior artifact that has one, so a retrospective's artifact stays in a later run's history under
REQ-LIBRARY-034's letter and contributes no session (the reading raised as
[OQ-271](../../archive/architecture/open-questions/56-spikes-and-later-questions-23.md#oq-271), left for a ruling). Pinned by `analyst.test.ts`'s case "captures a run's
analysis when a retrospective artifact is among the prior ones …", red on the code before ("expected string, received null").
Shown in the built app by `retrospective-proof`'s launch 8 (`live-shape-timeout`, a run after a retrospective in one
workspace): before, the run's notice read "The run completed." and no artifact was stored; after, the run's empty artifact
notes "collector timed out after 10 seconds" and its notice names the 10-second limit — 54 of 54 checks.

*OQ-271 was ruled 2026-10-13 under the owner's delegation ([R-072](../../product/requests.md#r-072)) as
[`PD-LIBRARY-002`](../../product/directives/pd-library-002.md#pd-library-002) revision 3 (h): a later run's prior-artifact history holds
post-run artifacts only, the retrospective's dropped before the five-artifact bound, so the reading above no longer governs;
built 2026-10-14 by fin43 (`fin43-analysis-and-artifacts`), pinned by `analyst.test.ts`'s two REQ-LIBRARY-034 / revision 3 (h)
cases, which replace the case named above.*
