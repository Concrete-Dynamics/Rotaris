## The live run's `faultsFired` figure is reset before it is read

`results.json`'s `traffic.faultsFired` is `[]` and `faultsDeclared` is `0` although three faults fired. The `faults`
scenario clears its rules with `proxy.setFaults([])` when it ends, and `setFaults` also empties the list of faults that
fired; the summary reads `proxy.stats()` only after that.

Live-run finding: H4 (live runs of 2026-09-29)

This note is H4's `faultsFired` half. The console-ceiling half ("… of the 500000 token
ceiling" on an unmetered endpoint) was repaired in f043877. H-f names H4's recurrence in the duress run, where the
console half recurred at fa377e6, before that repair; the duress run declares no faults, so this half did not arise
there.

## Specs

- None; harness.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), `results.json`: `"traffic": {"recorded": 169, "failed": 0, "faultsFired": [], "faultsDeclared": 0}`; the
  `faults` scenario fired a 429, a 500 and a stall.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:1633` — `proxy.setFaults([])` at the scenario's end.
- `apps/desktop/scripts/lib/model-traffic.mjs:236` — `setFaults` clears `fired`.
- `apps/desktop/scripts/live-run.mjs:952` — the summary reads `proxy.stats()`.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. The proxy keeps a second pair of fault figures over its whole life, `totals()`, which
`setFaults` never resets (every rule ever declared, every one that fired, in order); `stats()` keeps the per-launch pair
each scenario reads about the launch it just ran. `finish` in `live-run.mjs` writes `results.json`'s `traffic` from
`totals()`. Pinned by "keeps the run-wide fault figures through every setFaults, while the per-launch ones reset (H4)" in
`apps/desktop/scripts/lib/model-traffic.test.ts` (red without it: `proxy.totals is not a function`, and the per-launch
pair it would otherwise read is `[]`/`0`). Shown live with `pnpm live-run --confirm --skip-build --only=faults,edit`
against `katalyst` (pack `.live-run/runs/2026-09-29T21-11-24-678Z`, git-ignored; passed): `"traffic": {"recorded": 66,
"failed": 0, "faultsFired": [status at 2, status at 3, stall at 2], "faultsDeclared": 3}`.

Files: `apps/desktop/scripts/lib/model-traffic.mjs` (`everFired`, `everDeclared`, `totals`), `apps/desktop/scripts/live-run.mjs` (`finish`).
