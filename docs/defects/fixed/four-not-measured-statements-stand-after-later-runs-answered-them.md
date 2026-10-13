## Four "not measured" statements stand after later runs answered them

Four first-execution blocks in `docs/product/directives.md` (and the first-executions rows that point at them) still
say a thing was not measured that a later live run or proof measured, with no dated report-back beside them:

- `PD-TOOLS-003`: "the guard has not run against a real endpoint; the next live run of `terminal` is its first". The
  default live run at `0bc3eee` (2026-10-13) passed it against the self-hosted endpoint: the docker line printed at
  exit 0, not `suspicious_success`, no failure-marker warning.
- `PD-SESSION-002`: "a non-zero line has been seen in unit tests only". `artifacts-proof` launch 7 read "Mostly-elided
  artifacts: 1" in the built app (`PD-TOOLS-006` revision 5's first execution). No live run has attached artifacts, so
  that half stays open.
- `PD-ORCH-005` revision 7: "No live run: the orchestrator's default run's `resume` scenario is the evidence still owed".
  The default runs at `552d346` and `0bc3eee` paused and continued that scenario; at `552d346` the Continue logged
  "Intent classified: moderate_feature (continued from previous run)", the intent being the classifier's 12 s fallback.
- `PD-TOOLS-006` revision 2: "No built-app run declared a scope". Scoped delegations have run in every default live run's
  `edit` scenario since the harness check landed (`d8ede92`), and the `resume` scenario's two children carried write
  scopes through a pause and a Continue at `552d346` and `0bc3eee`.

Found by the 2026-10-13 survey at `6de2a67` (item N46). OQ-213's report-back already exists in place and is not part of
this.

## Specs

- None contradicted. CLAUDE.md's report-back rule; `docs/architecture/first-executions.md`'s "a correction is a new row
  citing the old one".

## Relevant files

- `docs/product/directives.md` — the four first-execution blocks.
- `docs/architecture/first-executions.md` — the rows of 2026-09-27 (PD-TOOLS-003, PD-TOOLS-006 revision 2), 2026-10-06
  (PD-ORCH-005 revision 7) and 2026-10-07 (PD-SESSION-002).
- `apps/desktop/scripts/live-run.mjs` — the `failed-word`, scope and resume checks.

## Repaired — 2026-10-13 (fin41)

Each statement keeps its words and gains a dated "Reported back 2026-10-13" block beside it in
`docs/product/directives.md`, and `docs/architecture/first-executions.md` gains four correction rows citing the rows they
answer (its rule: "a correction is a new row citing the old one").

- `PD-TOOLS-003`: the guard's earliest recorded live pack is `2026-09-29T02-41-56-779Z`, and it passed in every default
  live run since, the last at `552d346` and `0bc3eee`.
- `PD-SESSION-002`: the built-app half answered by `artifacts-proof` launch 7; the live half stays open.
- `PD-ORCH-005` revision 7: carried at `552d346` (the fallback's `moderate_feature`) and at `0bc3eee` (a real
  `small_feature` 0.72), read from each pack's `resume/app.log` and `session.log`.
- `PD-TOOLS-006` revision 2 (the survey called it revision 1): scoped children live since `d8ede92`; the `resume`
  scenario's two children carried `children.write_scope` through the pause at both heads and wrote inside their scopes,
  read from each pack's `workspace.db` (copied, opened read-only). A sibling's write into a resumed scope was never
  tried, so the refusal half stays shown by `children.test.ts` alone.

No test: record only. The evidence is the git-ignored packs under the orchestrator's live tree
(`.live-run/runs/2026-10-13T07-25-27-766Z`, `2026-10-13T12-18-40-282Z`) and the 2026-09-29 sweep pack.
