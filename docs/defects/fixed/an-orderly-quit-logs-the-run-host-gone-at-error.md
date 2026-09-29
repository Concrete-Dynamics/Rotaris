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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Main now records the children it ends itself: `ChildrenEndedByMain`
(`apps/desktop/src/main/exit.ts`) wraps the run host's `kill` that `endBeforeMain` sends — on an immediate exit, and on
an orderly quit whose run host had not exited within its grace — under the service name Electron reports it by. The
`child-process-gone` handler (`apps/desktop/src/main/index.ts`) takes its line and level from `ChildrenEndedByMain.gone`:
`clean-exit` is `info` as before; `killed` for a child main ended is `info` and says "main ended it at its exit"; every
other end — a child killed from outside, one that crashed, one main never ended — stays `error`. The loss a kill of
main's could cover is written elsewhere at `error` already: the unanswered or refused `shutdown`, and the run host
still running past its bound.

Pinned by `apps/desktop/src/main/exit.test.ts` (the three cases "PD-MONITOR-002: a child process main ended itself is not
a loss (live-run finding L13)": the run host an immediate exit ended; a SIGKILL from outside, a crash, another child and
another process type still at `error`; a run host that exits by itself inside the grace is never recorded as main's).
Measured on the built product by `pnpm live-run --only=ask` (endpoint `katalyst`, 2026-09-29T20-26-35-558Z, git-ignored
pack in the branch's worktree): both launches, `sign-in` and `ask`, ended through the capture seam's immediate exit and
wrote `info    CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 15); main ended it at its exit`, and no line
of main's at `error`. The last-window close was not re-driven.
