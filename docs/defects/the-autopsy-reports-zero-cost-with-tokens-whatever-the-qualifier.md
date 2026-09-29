## The autopsy's coherence line reports "zero cost with tokens: true" whatever the cost qualifier

`autopsy.mjs` prints `zero cost with tokens: true` for any session whose cost is `0` and whose tokens are not, without
reading `cost_qualifier`. On an endpoint with no price and no provider figure the qualifier is `unknown`, and a `0` cost
beside real tokens is correct, so the line reads as a product fault that is not one. The live run already knows this
and works around it in its own check. The other half of the finding — an aborted auxiliary call's tokens not counted —
is by design (REQ-EVENTS-053; `fixed/model-calls-outside-an-agents-turn-report-no-usage.md`) and is not this note.

Live-run finding: K2(b) (live runs of 2026-09-29)

## Specs

- None; harness. `REQ-MONITOR-166`'s `unknown` qualifier is what the line fails to read.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): every session's `autopsy.txt` (7 of 7) says `zero cost with tokens: true` with `cost_qualifier` `unknown`.

## Relevant files

- `apps/desktop/scripts/autopsy.mjs:203` — the coherence line.
- `apps/desktop/scripts/live-run.mjs:1869-1871` — the check that conditions on the accounting kind instead.
