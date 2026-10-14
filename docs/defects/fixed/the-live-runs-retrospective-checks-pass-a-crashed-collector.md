## The live run's retrospective checks pass a crashed collector

**Outcome: repaired 2026-10-14 by fin43 (`fin43-live-findings`).** `passOutcome` reads REQ-LIBRARY-023's "collector crashed: <exc>"
as its own outcome, `crashed`, which no notice matches (which notice it owes is [OQ-285](../../architecture/open-questions.md#oq-285)'s),
so the notice check fails on it and `postRunVerdict` returns `fail`; the retrospective's artifact check requires a collector that did
not crash. Two log readers join it: `unauthorizedRequests` (the run host's "model request … (no authorization header)" line) and
`runsStarted` (its "session <id> started;" line), from which `ask-retrospective` now FAILs a launch that started a run before the
gesture or sent any model request with no credential, and `ask` FAILs any such request too. Pinned by `analysis-reading.test.ts`'s
two new cases (red before: the crashed artifact read `empty`, the readers did not exist). Not run live here: the orchestrator's
`ask` scenario; over the `ce5f952` pack's `ask-retrospective/app.log` the readers give one unauthenticated request and no run started.

`live-run.mjs`'s `ask-retrospective` checks PASSed "one retrospective artifact, belonging to no session and having read the ask
session" and "the notice on screen is the one the retrospective's outcome owes" over an artifact whose notes read "collector
crashed: Unauthorized" beside the notice "The retrospective found nothing to propose" (the live scenario run at `ce5f952`, finding
F4). `passOutcome` (`lib/analysis-reading.mjs`) reads any empty artifact that is not timed out as `empty` — "no proposal for another
reason" — whose owed notice is the zero-proposal one, so a pass that never reached the model read as a right product; the post-run
verdict would have taken the same artifact as a NOTE. Nothing checked that the pass's model request carried a credential, and the
scenario's shape that exposed F2 — no run started in the launch before the retrospective — was the scenario's by accident, asserted
nowhere. Noticed 2026-10-14 by the orchestrator's reading of the `ce5f952` pack; recorded by fin43 (`fin43-live-findings`).

## Specs

None contradicted by the product. The harness's own discipline: a check FAILs on a product that did not do what was asked
(`references/live-runs.md`); REQ-LIBRARY-023's "collector crashed" artifact is a pass that failed, whatever notice OQ-285 rules it owes.

## Relevant files

- `apps/desktop/scripts/lib/analysis-reading.mjs` — `passOutcome`, `postRunVerdict`.
- `apps/desktop/scripts/live-run.mjs` — the `ask` scenario's post-run checks and the `ask-retrospective` launch.
