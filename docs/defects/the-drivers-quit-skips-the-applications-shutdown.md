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
