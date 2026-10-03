## A persona window's commands answer for the active main window, not the one that owns it

Main's command router resolves the window a command speaks for with `windowFor(senderId) ?? activeWindow()`
(`apps/desktop/src/main/index.ts`, `runCommand`). `windowFor` is `MainWindows.forSender`, which knows main windows only, so a
command sent from a persona window falls through to the **active** main window rather than to the main window that owns it
(`MainWindows.ownerOfAuxiliary`, which `window.personaPayload` and `window.showWorkspace` already use). With two main windows
on two workspaces (REQ-STARTUP-163), the persona window's mount read of the configuration, `useConfigSnapshot('persona')`'s
`config.read` (`apps/desktop/src/renderer/session-view.ts`), answers with the active window's workspace whenever that is not
its owner, so its model, declared tools (REQ-MONITOR-060) and compression threshold can be another workspace's until the next
`config:changed`, which since 2026-10-03 carries its owner's snapshot (`configFamily`). Every other command a persona window
sends through the same router is exposed the same way; which of them read `w` was not surveyed. Noticed by reading on
2026-10-03 while repairing the `config:changed` audience (fin10, second repair round); not driven and not repaired there.

## Specs

- No requirement names the window a persona window's command speaks for. REQ-SHELL-072 makes a persona window an agent's
  window, opened from the main window whose session it shows, and REQ-STARTUP-163 allows several main windows on several
  workspaces at once; ADR-0048 B makes it part of that main window's family. Answering for another window's workspace
  contradicts that ownership, not a requirement's text.

## Relevant files

- `apps/desktop/src/main/index.ts`: `runCommand`'s `const w = windowFor(senderId) ?? activeWindow()`; `ownerOfAuxiliary`.
- `apps/desktop/src/main/main-windows.ts`: `forSender` (main windows only) and `ownerOfAuxiliary`.
- `apps/desktop/src/renderer/session-view.ts`: `useConfigSnapshot`, the mount read; `apps/desktop/src/renderer/windows.tsx`:
  `PersonaApp`, `useConfigSnapshot('persona')`.
- `apps/desktop/src/main/config-broadcast.ts`: `configFamily`, the push that does reach the owner's persona windows.
