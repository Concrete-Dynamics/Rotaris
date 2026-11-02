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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067.

The coherence line now comes from `apps/desktop/scripts/lib/autopsy-coherence.mjs` (`zeroCostLine`). It reads the
session row's `cost_qualifier`:

- **`unknown`**: no request had a figure, so the line reads `false` and says the question does not apply.
- **`incomplete`, `reported` or `configured`**: a figure existed, so a total of `0` beside counted tokens reads `true`.
- **No `cost_qualifier` column** (a store written before the qualifier existed): the question is asked as before.

The `true|false` token still comes first, which is what the live run reads. The reason follows in parentheses.

The workaround in `live-run.mjs` is removed. `duress` now asserts `false` whatever the endpoint's accounting kind.
The in-place corrections are in `first-executions.md` (the 2026-09-22 row) and `codebase.md`. `AGENTS.md`'s `duress`
row names the qualifier.

Pinned by `apps/desktop/scripts/lib/autopsy-coherence.test.ts`:

- The qualifier cases, the decimal spellings of zero and the line's shape.
- Two cases that run `autopsy.mjs` itself over a migrated store. The `unknown` one fails on the reader before the
  repair (it read `true`).

Over a copy of the 2026-09-29T02-41-56 pack's store:

- Before the repair, all seven sessions read `zero cost with tokens: true`.
- After it, all seven read `false (not a question: cost_qualifier unknown, …)`.

The edit session of this branch's live run (pack `2026-09-29T23-26-20-433Z`) read `true` in the pack's own
`autopsy.txt`, written by the old reader. Re-read with the new one, it reads `false`.

The `duress` scenario itself was not re-run: it takes forty minutes. Its check is now the plain `=== 'false'` over
the same line.

K2(a), an aborted auxiliary call's tokens not being counted, is by design (REQ-EVENTS-053) and is not changed.
