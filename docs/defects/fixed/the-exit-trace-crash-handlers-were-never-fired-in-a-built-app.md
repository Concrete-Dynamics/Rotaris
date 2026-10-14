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

## Repaired — 2026-10-13

Repaired by fin42 (`fin42-live-gaps`) with a proof; no product code changed. `apps/desktop/scripts/exit-trace-proof.mjs`
(`pnpm exit-trace-proof`, new) drives two launches of the built application with the scripted client. Run 2026-10-13 under
`xvfb-run` on Linux at load 3.6, 11 checks green:

- `orderly`: launched and quit through the driver; exit 0, `quit: exiting with status 0` and `main process exiting with
  status 0` written, no GONE line at `error` — the control.
- `crash`: the run host's pid read from main's `run host hello` line and killed with SIGKILL from outside: main wrote
  `error   run host exited (9); NOT re-forked …` and `error   CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)`,
  not "main ended it", and still answered its driver. The main window's renderer, found in the launch's process tree by
  `--type=renderer`, crashed with SIGSEGV: main wrote `error   RENDERER GONE (crashed, exit 11) for file:///…/index.html`. The
  immediate exit then ended the launch, exit 0, `main process exiting with status 0` after the losses.

So `render-process-gone` and `child-process-gone` are measured on the built product, not argued. `unhandledRejection` and
`uncaughtException` in main are still argued: neither can be raised in main from outside the process, and a seam that throws in
main only to watch a log call was not added. The `frictions` scenario of `live-run.mjs` no longer prints its "needs a crash"
NOTE; a comment there names the proof instead.

Found by building it, recorded and not repaired: the application's quit after the renderer crash was held for good by the dead
renderer's close guard (`docs/defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`). The proof
asked that quit, bounded, and reported a held one as a NOTE naming that note; its repair (2026-10-14, fin43) made it a check:
the quit after the crash now ends the process, exit 0, through the orderly path.
