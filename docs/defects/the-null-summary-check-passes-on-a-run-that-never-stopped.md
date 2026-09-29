## "A stopped run did not end with a null summary" passes on a run that never stopped

The autopsy's coherence line answers `false` whenever the session is not stopped (`stopped && …`), and the live run's
check passes on `false`. A session left `running` — as the duress run's was, quit at its deadline — passes a check about
how a stopped run ends.

Live-run finding: H-c (live runs of 2026-09-29)

## Specs

- None; harness.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: `execution_status` `running`, `stop_reason` NULL at the end; the check passed.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:1861` — the check.
- `apps/desktop/scripts/autopsy.mjs:202` — `null summary on stopped run: ${stopped && …}`.
