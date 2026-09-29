## An orderly quit logs the run host's departure at `error`

Main logs Electron's `child-process-gone` at `error` for every reason but `clean-exit`. On an immediate exit — the
capture seam's, and any quit whose run host is ended with a grace of 0 — main kills the run host itself after it has
already reported "run host exited (0)" and "quit: exiting with status 0", and Electron reports the kill as
`killed, exit 15`. An orderly quit therefore ends with `error   CHILD PROCESS GONE (Utility rotaris-run-host: killed,
exit 15)`, the only `error` line most of these logs carry.

Live-run finding: L13 (live runs of 2026-09-29)

## Specs

- None contradicted directly. It falsifies a recorded reading: `PD-MONITOR-002`'s first execution
  (`docs/product/directives.md`, the sentence "one ended by the driver's `app.exit` at `warning` wrote nothing at all")
  and the same measurement in `docs/defects/fixed/the-application-log-keeps-every-level-because-nothing-reads-one.md`.
  Both are corrected in place under R-067, with the falsified reason kept beside the correction.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): 7 of 9 launch `app.log`s (`sign-in`, `ask`, `edit`, `requirements`, `shell`, `frictions`, `faults-ladder`)
  end with the line after "run host exited (0)" and "quit: exiting with status 0" — e.g. `ask/app.log` lines 64-68,
  02:42:24.670–.672.

## Relevant files

- `apps/desktop/src/main/index.ts:144-145` — the `child-process-gone` handler's level.
- `apps/desktop/src/main/index.ts:90` → `:276` — `exitCleanly` → `endRunHost` with `graceMs: 0`.
- `apps/desktop/src/main/exit.ts:182-193` — `endBeforeMain`, which kills at once when the grace is 0.
