## The exit trace's crash handlers were never fired in a built app

`apps/desktop/src/main/index.ts` writes why the process goes away: `before-quit`, `quit`, `render-process-gone`,
`child-process-gone`, `unhandledRejection` and `process.on('exit')`
(`docs/defects/fixed/process-exit-left-no-diagnosable-trace.md`). The orderly half was measured on the built app when it
landed (`quit: exiting with status 0`, `main process exiting with status 0`), but the repaired note says of the three crash
handlers: "**Argued, not measured** … they are wired from Electron's documented events rather than exercised". A run host
killed with SIGKILL was once driven by hand (`first-executions.md`'s 2026-09-27 PD-MONITOR-002 row: `run host exited (9)`
and `CHILD PROCESS GONE (… killed, exit 9)`), but no proof script and no live launch kills a process, so nothing re-verifies
the lines: a grep for `GONE`, `child-process-gone` and a kill across `apps/desktop/scripts` finds none. The `frictions`
scenario of `pnpm live-run` still prints "the exit-trace gap is not covered here — it needs a crash" on every run.

## Specs

- PD-MONITOR-002 (the application log keeps `info` and above; a renderer or child lost for any reason but `clean-exit` is an
  `error`): its loss lines are unmeasured on the built product. No requirement is contradicted.

## Relevant files

- `apps/desktop/src/main/index.ts` — the exit-trace handlers.
- `apps/desktop/src/main/exit.ts` — `ChildrenEndedByMain.gone`, the line and level for a child gone.
- `apps/desktop/scripts/live-run.mjs` — the `frictions` scenario's "needs a crash" NOTE.
- `docs/defects/fixed/process-exit-left-no-diagnosable-trace.md` — "Argued, not measured".

Noticed 2026-10-13 by the survey of what is left (item N60 (c)); recorded by fin42 before its repair.
