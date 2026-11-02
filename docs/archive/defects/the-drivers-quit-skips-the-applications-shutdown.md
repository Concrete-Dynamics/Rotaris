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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Confirmed first on the unrepaired build (`9afe66f`): a scripted run holding its model
call, quit through the driver, left the session `running` with `stop_reason` NULL.

- The driver's `quit` sends the application's quit, `app.quit()`: every main window is closed through its close guard,
  then `window-all-closed` asks the run host and each workspace service to `shutdown`. The immediate exit is sent only
  when the request names it (`{ immediate: true }`). The driver seam stays up until `will-quit`, so a quit that a close
  guard keeps can still be seen and answered. The reply says which quit was sent (`how`). `apps/desktop/src/main/driver.ts`
  (`DriverDeps.quit` and `DriverDeps.exit`) and `main/index.ts` wire it.
- `pnpm app:drive stop` sends the application's quit and waits for the process to end. `stop --crash` sends the
  immediate exit. `stop` says which one it sent, and when a close guard kept the application it says so and leaves the
  endpoint. The client's `quit({ immediate })` is in `scripts/lib/driver.mjs`.
- The deadline quit: a capture whose wait timed out now ends through the application's quit (`CaptureHost.quit`,
  `capture/probe.ts`'s `installFinish`), because a run may still be live then. A capture whose wait was satisfied, or
  that had none, still ends by the immediate exit, and a proof may read what that exit leaves (`part-j-proof` reads a
  paused session's lock that survives it).

Pinned by `apps/desktop/src/main/driver.test.ts` (the default `quit` calls the application's quit and not the exit, and
leaves the endpoint; `immediate` calls the exit after taking the seam down) and `capture/probe.test.ts` (a timed-out
wait ends by `quit`, a satisfied one by `exit 0`). Both fail on the unrepaired code. `driver-proof`'s second launch
starts a run that holds its model call and quits it through the driver. The session reads `paused` with `stop_reason`
`application_shutdown`, and the log shows the close through the guards.

Measured live on 2026-09-29, against the unmetered `katalyst` endpoint:
`LIVE_RUN_DURESS_MS=240000 pnpm live-run --confirm --skip-build --only=duress`. The run was given a four-minute wait so
that the deadline quit would meet a live run. The pack is `.live-run/runs/2026-09-30T02-43-07-482Z/` in the driver
worktree (git-ignored).

- The wait timed out at 240 s. The log reads "capture: ending through the application's quit", then the close through
  the guards, then "quit: exiting with status 0".
- The session reads `paused` with `stop_reason` `application_shutdown`.
- Its three live children read `paused` with interruption `quit` (PD-ORCH-005 clause 3).
- `sessions.tool_calls` is 94 against 94 `tool_calls` rows.
- The session's tokens (449,512 in, 28,851 out) equal the harness's own count of the traffic.

The only failed check was "the long run reached its result inside the wait" (247 s of 240 s). That failure was
intended: the short wait was chosen so that the deadline quit would come mid-run.
