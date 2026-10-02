## The duress deadline check fails without saying where the time went, and its default is too short for this endpoint

"The long run reached its result inside the wait" failed at 2,406 s of 2,400 s. The failure is genuine, but the check
reports the two figures and nothing else, and the overrun was about 98 % the endpoint generating: `d` and its
continuation `d2` together spent 1,683 s with 132,973 reasoning tokens, and the run was still progressing (`f` streaming
at the deadline, a ninth request 3.4 s after it). The wait also includes the launch (4.7 s). With this endpoint's
reasoning throughput the 40-minute default is too short for the scenario's three waves.

Live-run finding: H-h (live runs of 2026-09-29)

## Specs

- None; harness. The time the specification spends on the critical path is OQ-114's question.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), `results.json`: `elapsedMs` 2,405,704, `budgetMs` 2,400,000, status `running`; session `379f1490`.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:229` — `DURESS_MS`, default 2,400,000.
- `apps/desktop/scripts/live-run.mjs:1848` — the check, with no time attribution.
