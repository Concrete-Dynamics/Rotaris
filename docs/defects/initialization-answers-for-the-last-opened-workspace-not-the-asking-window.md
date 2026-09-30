## Initialization answers for the last-opened workspace, not for the window that asks

`InitializationCoordinator` holds one `active` root, set by `open` each time any main window opens a workspace, and every
`initialization.*` command (`read`, `resolve`, `start`, `skip`, `cancel`) acts on that root whichever window sent it.
Channel 12 publishes every state to every live main window. The setup port (`start`, `cancel`, `status` in
`apps/desktop/src/main/index.ts`) addresses the run host with `activeWindow()?.workspaceId` — the most recently focused
window — rather than the workspace the run belongs to. With two main windows open (PD-SHELL-001), window A's Settings ›
Project and setup dialog show window B's workspace once B has opened, a Skip or Initialize pressed in A acts on B, the
800 ms automatic resolution of the window opened second is the only one either window's surfaces can read, and a
background run for one workspace can have its setup started against the other workspace's configuration and root when
the other window holds focus. Pre-existing; noticed while repairing the switch-time cancellation under R-067, which made
`close` fall back to the workspace most recently opened among those still open and changed nothing else about it. Not
repaired here.

## Specs

- REQ-WORKSPACE-013: the replacement window resolves initialization for its own workspace, independently of another.
- REQ-WORKSPACE-102: exactly one automatic resolution per workspace open — per window's workspace, not per process.
- REQ-WORKSPACE-105: the state a window's interface works from is its own workspace's nine values.
- PD-SHELL-001: two main windows, one per project, alive at once.

## Relevant files

- `apps/desktop/src/main/initialization.ts` — `active`, `current()`, `open`, `close`, and every public method reading `current()`.
- `apps/desktop/src/main/commands/initialization.ts` — the five commands, none of which passes the sender's window.
- `apps/desktop/src/main/index.ts` — the setup port's `activeWindow()?.workspaceId`, and `publish` to every window.
