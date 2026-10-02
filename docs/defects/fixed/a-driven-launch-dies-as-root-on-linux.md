## A driven launch dies as root on Linux

`pnpm app:drive start`, and every proof that launches through `startApp`, never reached the driver seam when run
as root on Linux. Chromium refuses to start as root with its sandbox on and exits at once
(`FATAL:electron_main_delegate.cc … Running as root without --no-sandbox is not supported`), so no endpoint file
was written and the launch failed at its 60 s deadline. A cloud container runs everything as root, which made the
driver unusable there. `startApp` already took `electronArgs`, but the `drive` CLI passes none.

Found 2026-09-27 starting the app in a cloud container.

## Specs

None. The harness is verification tooling and no requirement names it.

## Relevant files

- `apps/desktop/scripts/lib/harness.mjs`: where the Electron executable a launch spawns is resolved.
- `apps/desktop/scripts/lib/driver.mjs`: `startApp`, the one launch `pnpm app:drive` and six proof scripts share.

## Repaired — 2026-09-27

`harness.mjs` exports `hostSwitches` beside `electron`: `['--no-sandbox']` when the process runs as root, empty on
any other host (Windows has no `getuid`). `startApp` puts it ahead of the caller's `electronArgs`. Evidence, as
root under Xvfb: `pnpm app:drive start` answers with a window and `waitFor ".app-shell"` succeeds; `pnpm driver-proof`
passes 14 of 14; `theme-proof`, `layout-proof` (19 of 19) and `retrospective-proof` (29 of 29) pass. The scripts
that spawn Electron themselves keep their own launches, as the harness header says, and still die as root. That
includes `workspace-proof`'s secondary launch: the proof passes 31 of 33, and both reds are that second instance
exiting with SIGTRAP.
