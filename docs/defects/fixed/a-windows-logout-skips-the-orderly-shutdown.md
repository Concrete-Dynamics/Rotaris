## A Windows logout or shutdown skips the orderly shutdown

REQ-SHELL-121 requires shutdown to be clean and complete: active runs asked to stop before the process ends, no run left
consuming a provider, no auxiliary window left, no error. The application's orderly shutdown hangs on `before-quit`
(`apps/desktop/src/main/index.ts`: the quit is turned into the main windows' guarded close, `closeThroughGuards`, and the
last close reaches `window-all-closed`, which shuts the children down — the run host's `shutdown` resting every run under
`PD-ORCH-005` clause 3). Electron's own typings say that on Windows "this event will not be emitted if the app is closed
due to a shutdown/restart of the system or a user logout" (`before-quit`, and the same of `will-quit`, in
`node_modules/electron/electron.d.ts`). The record said the opposite: the comments in `close-confirmation.ts`, `exit.ts`
and `index.ts`, and `docs/architecture/views/02-process-view.md`, named "the desktop's logout" among the quits that reach
`before-quit`. On Windows — the only release platform (`PD-STARTUP-001`) — a logout or a system shutdown with a run active
therefore ends the process without the run host's `shutdown`: the run is left as a crash leaves it, recovered as a crash at
the next launch (`PD-ORCH-005` clause 23), and no window's guard is asked. Electron offers `query-session-end` on a
`BrowserWindow` (Windows only), which can only delay a session end the person may force.

Noticed on 2026-10-07 while building OQ-206's ruling ([`PD-SHELL-009`](../../product/directives.md#pd-shell-009)), whose
consortium checked the typings (advocate B's finding, kept by the ruling). The comments and the view now state the Windows
case; the behaviour is recorded, not repaired, and not classified: this ruling neither builds nor classifies the repair.
Not observed on a Windows host (IC-3 bounds none here, but this host is Linux).

## Specs

REQ-SHELL-121 (shutdown is clean and complete; active runs are asked to stop before the process ends), REQ-MONITOR-131
(the ordered shutdown effects), `PD-ORCH-005` clause 3 (a quit rests unfinished agents `paused` by `quit`, where a crash
leaves them for the next repair).

## Relevant files

- `apps/desktop/src/main/index.ts` — the `before-quit` handler and `window-all-closed`, the only route to the run host's `shutdown`.
- `apps/desktop/src/main/exit.ts` — `QuitState` and `closeThroughGuards`, whose comments now state the Windows case.
- `apps/desktop/src/main/close-confirmation.ts` — the header naming which quits are asked.
- `docs/architecture/views/02-process-view.md` — the shutdown's description.

## Repaired — 2026-10-07, fin29 (REQ-SHELL-121); the Windows run that shows it is owed

Electron's documented hook for this end is a window's `session-end` (Windows only; `node_modules/electron/electron.d.ts`,
Electron 44.1.1: "Emitted when a session is about to end due to a shutdown, machine restart, or user log-off. Once this event
fires, there is no way to prevent the session from ending."; its `WindowSessionEndEvent.reasons` are `shutdown`, `close-app`,
`critical` or `logoff`). `query-session-end` was not taken: it fires before the session's end is certain (another
application can still veto it), and resting every run on a logout that does not happen would stop work for nothing.

Each main window now listens for `session-end` (`createWindow` in `apps/desktop/src/main/index.ts`). The first one marks the
quit as the process's own exit (`QuitState.exiting`: a dialog or a dock that closes answers nothing, PD-ORCH-005 clause 9),
starts the orderly shutdown `window-all-closed` runs — the update quiesce, the in-flight checkpoint, the run host's
`shutdown` that rests every run `paused` by `quit` (PD-ORCH-005 clause 3), each workspace service's `shutdown`, and the
run host's end before main's — and exits when it is done (`exitCleanly`). The shutdown is one memoized function now
(`orderlyShutdown`), so a `window-all-closed` that follows during the session's end waits on the same run rather than
starting a second. No guard is asked and no box is shown: the end cannot be refused (`SessionEndShutdown`,
`apps/desktop/src/main/exit.ts`). Pinned by `exit.test.ts`'s two REQ-SHELL-121 cases (the first event marks the quit, runs
the shutdown once and exits after it, later windows' events waiting on the same promise; a failed shutdown is said at
`error` and the process still exits), red without `SessionEndShutdown`.

**Not observed.** This host is Linux, where Electron never emits `session-end`; whether Windows leaves the process the time
the shutdown takes (it bounds a `WM_ENDSESSION` handler; the run host's `shutdown` is asked with a 30 s bound) is unmeasured.
**Owed: a Windows run** — a logout with a run active, then the next launch: the session must read `paused`,
`application_shutdown`, its iteration open by `quit`, and not be recovered as a crash (PD-ORCH-005 clause 23). The release
platform is Windows (`PD-STARTUP-001`); no Windows host exists here (IC-3 bounds Linux and macOS artifacts, not this run).

**Stage A, SIMULATED — 2026-10-20** (the Windows ARM64 session's C5; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, at `51d85dd7`). A scratch driver (never committed) launched the built app on a scratch workspace outside the checkout with part-j's `agents.yaml` keys and `ROTARIS_APP_LOG_LEVEL=debug`, typed a task, and sent the application's own top-level windows `WM_QUERYENDSESSION` (lParam `ENDSESSION_LOGOFF`) and then `WM_ENDSESSION` (wParam 1) with `SendMessageTimeout`. **(1) `read,write,answer` under `ask`, with the approval dialog open:** each window answered the query 1, the main window returned from `WM_ENDSESSION` in 15 ms (the dialog was already gone), main logged "quit: the desktop session is ending (logoff); the orderly shutdown runs now, asking nothing (REQ-SHELL-121)", and the process exited 0 1,863 ms after the first message, with no "did not complete its shutdown" line. Read before relaunch (`node:sqlite`, `readOnly`): `paused`, `application_shutdown`, iteration 1 `open` with interruption `quit`, timeline `run_start, approval_withdrawn, run_end`, no lock. **(2) `read,wait:600000,answer` under `autonomous`:** the same line, exit 0 in 918 ms, the same store without the approval. In both, a relaunch without `--fresh` opened the session, its Continue was pressed and the run completed (`tasks_complete`). This is not a logout: the messages reached only this application, from a process of the same desktop session, and nothing else of a logout happened.

**Stage B, the owed run — not run.** A real sign-out (`shutdown /l`, stage B), which needs the owner and ends this session: not run, still owed. Windows' allowance after `WM_ENDSESSION` against the shutdown's 30 s bounds is [OQ-402](../../architecture/open-questions.md#oq-402).
