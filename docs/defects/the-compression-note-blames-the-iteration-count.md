## The duress run's compression note blames the iteration count

When the long run never compressed, the note says "`0 iteration(s)` was not long enough". `iterations_completed` is 0
because the run's only iteration never ended, and compression was never reached because the largest prompt was 64,038
tokens, 24 % of the model's 262,144. The note names the wrong cause (and renders the literal "(s)").

Live-run finding: H-d (live runs of 2026-09-29)

## Specs

- None; harness.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: `iterations_completed` 0; largest prompt 64,038 tokens of 262,144.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:1911` — the note.
