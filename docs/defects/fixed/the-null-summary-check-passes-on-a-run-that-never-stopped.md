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

## Outcome

Repaired 2026-09-29 under R-067. The autopsy reader's line answers `unasked` for a session that never stopped, meaning
one whose status is `idle`, `running`, `background` or `waiting`, the same four the engine's autopsy treats so
(`nullSummaryReading` and `nullSummaryLine` in `apps/desktop/scripts/lib/autopsy-coherence.mjs`, printed by
`apps/desktop/scripts/autopsy.mjs`). The live run reports `unasked` as a NOTE, "the null-summary question is unasked: the
long run never stopped", and checks the other two readings as before. Pinned by
`apps/desktop/scripts/lib/autopsy-coherence.test.ts`: six readings, plus the reader run over a store holding a
`running` session, which printed `false` before the repair and prints `unasked` after it.
