## A process exit after an orderly run-end left no diagnosable trace

Observed 2026-09-20, run `7bd9c19d` (punchclock_v2, launched via `pnpm --filter @rotaris/desktop dev`): the store ends orderly — `session.end`, `result`, and transcript row 912 all written 2026-09-20T23:09:05.039Z — and afterwards no `electron` process, no dev-server `node` process, no `Crashpad` or dump directory under `%APPDATA%/@rotaris/desktop`, and no main-process log for the dev run (the detached launch's stdio redirect captured nothing; `.autopsy-app.log` predates the run, `.drive/app.log` covers only the earlier scripted run). The owner-reported "crashed somehow" can neither be confirmed nor refuted from any artifact: a crash and a quiet quit look identical here.

## Specs

No requirement contradicted from this autopsy — recorded for the gap: the store's power-loss work (OQ-12) covers the session record, but nothing covers the process exit itself.

## Relevant files

- `packages/store/spike/power-loss-writer.cjs`, `packages/store/src/power-loss.spike.test.ts` — the store-level power-loss coverage that does exist.
- `apps/desktop/src` — no crash-reporter registration found there at the time of this note.

Noticed 2026-09-20 by the run-autopsy of run `7bd9c19d`.

**Repaired 2026-09-22.** The gap this note names is that a crash and a quiet quit left the same trace —
none — so the owner's "crashed somehow" could be neither confirmed nor refuted. `apps/desktop/src/main/index.ts`
now writes the exit path while it still can:

- `before-quit` and `quit` — an orderly close, and the status it exits with;
- `render-process-gone` — the renderer's own `reason` (`crashed`, `oom`, `killed`, …) and exit code;
- `child-process-gone` — the same for a utility or GPU child, with its type and name;
- `unhandledRejection` beside the `uncaughtException` handler that was already there;
- `process.on('exit')` — the last line the main process can write.

The fifth is what makes the other four diagnostic rather than merely present: a log that ends with **none**
of these lines is itself the finding, because the process went away without passing through its own
shutdown. That is precisely the state run `7bd9c19d` left and could not report.

**Measured** on the built app: a launch and a close wrote
`quit: exiting with status 0` and `main process exiting with status 0`, where the same sequence wrote
nothing before. (`before-quit` does not appear on that path and should not: the driver stops the app with
`app.exit`, which bypasses it by design — which is itself worth knowing from the log.)

**Argued, not measured:** the three crash handlers. A renderer crash could not be forced from here —
navigating to `chrome://crash` is refused, as it ought to be — so they are wired from Electron's documented
events rather than exercised. A session that wants that evidence wants `webContents.forcefullyCrashRenderer()`
behind a capture seam, which is a surface this note does not justify adding.

**Not in scope, and still true:** the second half of this note — that the dev run's detached launch captured
no stdio at all — is a property of how the process was launched, not of the product. What the product writes
is now worth capturing, which was not the case before.
