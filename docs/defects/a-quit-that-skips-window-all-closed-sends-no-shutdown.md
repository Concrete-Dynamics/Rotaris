## A quit that does not pass through `window-all-closed` sends no `shutdown`

Main sends the two children their `shutdown` from one place: the `window-all-closed` handler at the end of `main()` in
`apps/desktop/src/main/index.ts`. It waits for an in-flight checkpoint operation, asks the run host to shut down
(bounded at 30 s), asks each workspace service to shut down, and only then calls `app.quit()`. No other quit path sends
`shutdown`: `before-quit` only writes `quit: requested`, and the two `will-quit` handlers close the instance claim and
the driver.

Electron's documentation for `window-all-closed` says the event is **not** emitted when the quit comes from the user
pressing Cmd+Q or from the application calling `app.quit()`: Electron closes the windows itself and goes on to
`will-quit`. A quit that starts that way would therefore tear the run host and the workspace services down without
their `shutdown` — no run asked to stop, no terminal-tool process tree ended, no MCP connection closed, no in-flight
checkpoint Git operation waited for, and no store closed by its owner. The platform that reaches it is macOS: the Dock's
"Quit" and, where a menu provides it, Cmd+Q. On Windows and Linux the product's own close control closes the window,
which is the path that sends `shutdown`; the application menu is removed (`removeApplicationMenu`), so no menu
accelerator quits there.

**Established by reading the code and Electron's documentation; not measured.** No macOS host was available, and no
quit that bypasses `window-all-closed` was driven on any platform. macOS is not a release target: `PD-STARTUP-001`
publishes for `windows-x64` only, and IC-3 forbids a macOS or Linux release artifact until the build hosts exist. Noted
2026-09-27 during the review of `PD-MONITOR-002`, while checking which quits log an unanswered `shutdown`: such a quit
sends none, so the new `error` line on that path would not be written either, and the children's exits would read
`exited (0)` at `info`.

## Specs

- `REQ-GIT-101`: application shutdown waits for an in-flight checkpoint Git operation rather than killing it mid-call.
  The wait lives on the `window-all-closed` path only.
- `REQ-TOOLS-111`: application shutdown terminates the owned terminal-tool process trees, background sessions included.
  The run host does this in its `shutdown` handler, which such a quit never reaches.
- `REQ-MCP-066`: the shared MCP connections are torn down at application exit, which the run host's `shutdown` does.
- ADR-0014: quit is main-driven and run-host-executed; a quit Electron completes on its own is neither.

## Relevant files

- `apps/desktop/src/main/index.ts`: the `window-all-closed` handler (the only sender of `shutdown`), `before-quit`, the
  two `will-quit` handlers, and `removeApplicationMenu`'s call.
- `apps/desktop/src/main/main-windows.ts`: `removeApplicationMenu`, which sets the application menu to `null`.
- `apps/desktop/src/run-host/dispatch.ts`: the `shutdown` case — what a bypassed quit skips in the run host.
- `apps/desktop/src/workspace-service/index.ts`: the `shutdown` case — the in-flight checkpoint wait and `closeOwn()`.
