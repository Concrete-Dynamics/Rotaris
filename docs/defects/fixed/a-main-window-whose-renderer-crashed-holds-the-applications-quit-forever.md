## A main window whose renderer crashed holds the application's quit forever

Found 2026-10-13 by fin42's `exit-trace-proof` (launch `crash`, `.proof/exit-trace-proof/crash/app.log`, git-ignored), on
the build of `fin42-live-gaps` over `dd1073b`: once the main window's renderer had crashed (SIGSEGV from outside; main wrote
`RENDERER GONE (crashed, exit 11)`), the driver's quit (`app.quit()`, a person's quit) logged `quit: requested
(before-quit)` and `quit: closing 1 main window(s) through their close guards first (PD-ORCH-005 clause 9)`, then Electron's
own `Error sending from webFrameMain: Error: Render frame was disposed before WebFrameMain could be accessed … at
WebContents.executeJavaScript … at closeThroughGuards`, and nothing more. Fifteen seconds later the harness's SIGTERM wrote a
second `quit: requested (before-quit)` and still nothing closed; the launch ended only by SIGKILL. No `quit: exiting with
status` line and no `main process exiting with status` line were written: the log ends as a crash's would, although the
process was asked to quit twice and was otherwise answering (its driver, its workspace service).

The cause, read from the code: the close guard main asks of every main window is the renderer's
(`closeGuard` in `apps/desktop/src/main/index.ts`: `owner.win.webContents.executeJavaScript('… window.__rotarisCloseGuard() …')
.then(…).catch(() => true)`), and `guardClose` (`apps/desktop/src/main/main-windows.ts`) documents "a guard that cannot answer
allows". A crashed renderer's `executeJavaScript` neither resolves nor rejects, so the `catch` never runs, the guard never
answers, and `closeThroughGuards` (`exit.ts`) waits on it with no bound. A person's close of that window takes the same
`guard.ask()` from the window's own `close` handler, which prevents the close and waits on the same promise, so the window
cannot be closed either — read from the code, not measured.

## Specs

- REQ-SHELL-119 (and REQ-SHELL-121's quit): the close guards are the three it names, in order, and each can abort the close
  only by its answer; a guard that cannot answer is documented in `guardClose` to allow. Here a renderer that cannot answer
  holds the close and the quit with no answer and no bound.
- PD-ORCH-005 clause 9 (the application's quit asks every main window's guard before confirming any): the quit never reaches
  its shutdown, so the run host is never asked to `shutdown` and every run is left as a crash leaves it.

## Relevant files

- `apps/desktop/src/main/index.ts` — `closeGuard`, the renderer's guard asked by `executeJavaScript`.
- `apps/desktop/src/main/main-windows.ts` — `guardClose` ("a guard that cannot answer allows"), the window's `close` handler.
- `apps/desktop/src/main/exit.ts` — `closeThroughGuards`, which awaits every guard with no bound.
- `apps/desktop/scripts/exit-trace-proof.mjs` — launch `crash`, which reports the held quit as a NOTE naming this note and
  ends the launch by the immediate exit; its repair turns that NOTE into a check.

Noticed 2026-10-13 by fin42 while building the exit-trace proof (N60 (c)); recorded, not repaired: outside the bundle's tasks.

## Outcome — repaired 2026-10-14 (fin43, `fin43-crash-and-seams`)

Both closes now ask the renderer through one question, `askRendererGuard` (`apps/desktop/src/main/main-windows.ts`): the
window's own `close` handler (`guardClose`'s `ask`, wired in `createElectronMainWindowAdapter`) and main's `closeGuard`
dependency for REQ-SHELL-021's gate 1 (`apps/desktop/src/main/index.ts`). A renderer that is gone cannot answer, and a
guard that cannot answer allows, so the question rejects at once when `webContents.isCrashed()` or `isDestroyed()` holds,
and rejects the moment `render-process-gone` or `destroyed` is emitted while it is out, removing both listeners once it has
settled either way. A live renderer is still waited for with no bound of its own, since its guard may be a person's decision
(REQ-SHELL-119); the guard's script moved to one constant, `RENDERER_CLOSE_GUARD_SCRIPT`.

Pinned by `apps/desktop/src/main/main-windows.test.ts`, "a main window whose renderer is gone cannot hold its close or the
application's quit": a fake `webContents` whose `executeJavaScript` never settles, as Electron's does on a disposed frame.
Against the old wiring (`() => win.webContents.executeJavaScript(…)`) four of its six cases fail, each answering `held`: the
quit through `closeThroughGuards`, a person's close, a renderer that goes while asked, and contents destroyed while asked.

Shown in the built app by `pnpm exit-trace-proof` (launch `crash`), whose NOTE is now a check: after the run host's SIGKILL and
the renderer's SIGSEGV, the driver's `app.quit()` ends the process, exit 0, through the orderly path (`quit: closing 1 main
window(s) through their close guards first`, then `quit: exiting with status 0` and `main process exiting with status 0`):
13 of 13 checks PASS on 2026-10-14 under `xvfb-run` on Linux (load average 2.9). The same proof against a build without the
repair FAILS 2 of 13 (`the application's quit after a renderer crash ends the process, exit 0 — held (answered, no exit in
30 s)`).

Not covered: a renderer that is alive but hung (an endless loop) is not gone, so its guard's question is still waited for
without a bound — recorded apart in
[`a-main-window-whose-renderer-hangs-holds-the-applications-quit.md`](../a-main-window-whose-renderer-hangs-holds-the-applications-quit.md).
