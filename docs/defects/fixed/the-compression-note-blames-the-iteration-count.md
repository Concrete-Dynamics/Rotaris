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

## Outcome

Repaired 2026-09-29 under R-067. The note now names the largest prompt any agent sent, read from the recorded traffic's
usage chunks, against the model's window and the compression trigger that REQ-CONFIG-134 resolves (the smaller of the
advertised window and `default_threshold`, times `threshold_percentage`, with REQ-CONFIG-132's defaults unless the
sandbox's `agents.yaml` sets them). It says so when a prompt reached the trigger and nothing compressed, and when no
prompt size was recorded. No count of iterations appears, and no literal "(s)" (`compressionTrigger` and
`compressionNote` in `apps/desktop/scripts/lib/duress-checks.mjs`). Pinned by
`apps/desktop/scripts/lib/duress-checks.test.ts`. Replayed over the 2026-09-29 pack, the note reads: "the largest prompt
any agent sent was 64,038 tokens, 24 % of the model's 262,144-token window and below the 60 % compression trigger,
157,286 tokens (REQ-CONFIG-134)".

**Shown live, 2026-09-30** (pack `.live-run/runs/2026-09-30T05-29-56-712Z`): "the largest prompt any agent sent was
77,043 tokens, 29 % of the model's 262,144-token window and below the 60 % compression trigger, 157,286 tokens".
