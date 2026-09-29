## The driver's quit skips the application's shutdown

`pnpm app:drive stop` sends the driver's `quit`, which calls `exitCleanly(0)`. That is the immediate exit the capture
seam uses, and it bypasses `window-all-closed`, where main asks the run host and each workspace service to shut down.
So a driven "quit" is a crash as far as a run is concerned. The run host exits with main, a live run never comes to
rest, and the session stays `running` until it is repaired or continued. A driver user who wants a user's quit has to
close the main window (`click "button[aria-label='Close window']"`).

Noticed 2026-09-27 by PD-ORCH-005's phase 7 rehearsal. It meant to quit and relaunch, and found the session crashed.

## Specs

None. The driver is verification tooling. AGENTS.md describes `stop` as ending the driven app, without saying how.

## Relevant files

- `apps/desktop/src/main/driver.ts` — `case 'quit'`.
- `apps/desktop/src/main/index.ts` — `exitCleanly`, and the quit path on `window-all-closed`.
- `apps/desktop/scripts/drive.mjs` — `stop`.

## Measured live — the duress run's deadline quit, 2026-09-29

The live run's harness ends a launch whose wait has timed out through the same immediate exit (`exitCleanly`, the
capture seam's), so its quit is a crash to the run as well. Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: the wait fell at 2,406 s of
2,400 s; the session was left `running` with `stop_reason` NULL and `iterations_completed` 0, the child `f` still
`running`, and the session's token row 36,253 input and 3,784 output tokens short of the last `usage.update` the
transcript carries. A user's quit, which `PD-ORCH-005` clause 3 brings to rest by `quit`, was not what the harness
performed; the product side of the deadline quit is built (clause 3, `sessions.ts:2258-2263`, `run.ts:522`, `:536`), so the
evidence is the harness's. Live-run finding: the deadline quit, harness side (duress, 2026-09-29).
