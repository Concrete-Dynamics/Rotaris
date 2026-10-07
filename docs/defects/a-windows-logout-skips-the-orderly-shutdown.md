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

Noticed on 2026-10-07 while building OQ-206's ruling ([`PD-SHELL-009`](../product/directives.md#pd-shell-009)), whose
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
