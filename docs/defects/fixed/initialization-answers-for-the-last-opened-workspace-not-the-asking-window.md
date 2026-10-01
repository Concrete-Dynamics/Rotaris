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

## Outcome — repaired 2026-10-01

Every `initialization.*` command is now answered for the workspace of the window that sent it
(`apps/desktop/src/main/commands/initialization.ts` reads the sender's window from the command context). The coordinator
holds no "active" root any more: `read`, `resolve`, `start`, `skip` and `cancel` each name the root they are asked for, and
`open` takes the identifier main was handed for the workspace. Channel 12 sends a workspace's state only to the main
windows holding it (`MainWindows.holding`). The setup port's `start`, `cancel` and `status` address the run host with the
run's own workspace identifier, never with `activeWindow()?.workspaceId`. A task's applicability predicate is told which
workspace it is judged for (`ApplicabilityContext` in `packages/config/src/init/registry.ts`), so the code-intelligence
task's status is read against that workspace's configuration. A resolution whose workspace closed while its sets were
being derived writes no silent stamp, because a closed workspace has no configuration left to judge.

**Pinned by** `apps/desktop/src/main/commands/initialization.test.ts`. With two windows open, it checks that the first
window reads its own workspace, that a Skip from the first window is recorded in that workspace only, and that a window
holding no workspace answers the empty state. All three cases failed on the code before the repair: the first read the
second workspace's `lastRun` (null). Also pinned by the new `describe` in `apps/desktop/src/main/initialization.test.ts`,
"two workspaces open at once, one per window", in four cases:

- a Skip on A changes A only and is published for A only;
- B's automatic resolution leaves A's view alone, and A's automatic resolution stays spent;
- each workspace's setup is started, cancelled and judged applicable by its own identifier;
- a root no window holds starts nothing.

`main-windows.test.ts` pins `holding`, and `packages/config/src/init/init.test.ts` pins the predicate's context.

**Shown by** `workspace-proof`'s new scenario 8e (PD-SHELL-001). The first window's setup holds `create`. The second
window opens on another project and its setup queues. That makes the second window the one opened last, and it is
focused. The first window then reads its own state (`lastRun` null, where the second's is `2026-09-01…`). It presses
Cancel, which cancels its own run. Its step ended 2107 ms after the Cancel answered, and the second window's queued setup
then ran to its own recorded outcome. Result: 44 passed, 0 failed, 2 skipped, as root under Xvfb, Node 24,
`--skip-build` after `pnpm build`.

**Left open:** which window shows a workspace's initialization banners, which are application notices shown in every
window. Raised as OQ-170.
