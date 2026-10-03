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

**Wider than first noted (the seventh triage, 2026-10-03).** The survey this note did not take: the terminal window's
`session.list` (`commands/library.ts`, keyed on `w.workspaceId`; `TerminalApp`'s list in `renderer/windows.tsx`) and the
persona window's `artifacts.body` and `artifacts.save` (`commands/library.ts`; the persona window's artifact links) answer
for the active main window the same way. And the defect breaks a requirement's text, not only ADR-0048 B's ownership:
REQ-MONITOR-069 requires the persona window's tools card to show "the same resolved set the inspector shows", and the
owner window's inspector draws from its own workspace. Handlers that key on `senderId` itself (`session.subscribe`'s relay
and follow) were never exposed.

## Outcome (fixed 2026-10-03, fin11)

One rule, `MainWindows.forCommand(senderId)` (`apps/desktop/src/main/main-windows.ts`): the sender's main window, else the
main window owning the persona or terminal window that sent it (`ownerOfAuxiliary`), else the active window. `runCommand`
(`apps/desktop/src/main/index.ts`) resolves `w` through it; its comment keeps the falsified reason ("while the capacity is
one is the same object either way") beside the replacement. Pinned by `main-windows.test.ts` ("answers a command for the
sender's main window, else the main window owning the persona or terminal window that sent it, else the active window"),
which fails without the method, and shown by `pnpm driver-proof` scenario 13c: two main windows on two workspaces, the
persona and terminal windows owned by the first while the second is active; the persona window's `config.read` answers
`workspaceRoot` …/family-a and the terminal window's `session.list` lists the owner's one session. On the unrepaired build
the same scenario read …/family-b and 0 sessions (two FAILs); on the repaired build 26 passed, 0 failed. Recorded in the
process view (main's row) and seams §1.

## Specs

- No requirement names the window a persona window's command speaks for. REQ-SHELL-072 makes a persona window an agent's
  window, opened from the main window whose session it shows, and REQ-STARTUP-163 allows several main windows on several
  workspaces at once; ADR-0048 B makes it part of that main window's family. Answering for another window's workspace
  contradicts that ownership, not a requirement's text. *(Corrected by the seventh triage: it also contradicts
  REQ-MONITOR-069's "the same resolved set the inspector shows" — the owner window's inspector reads its own workspace.)*

## Relevant files

- `apps/desktop/src/main/index.ts`: `runCommand`'s `const w = windowFor(senderId) ?? activeWindow()`; `ownerOfAuxiliary`.
- `apps/desktop/src/main/main-windows.ts`: `forSender` (main windows only) and `ownerOfAuxiliary`.
- `apps/desktop/src/renderer/session-view.ts`: `useConfigSnapshot`, the mount read; `apps/desktop/src/renderer/windows.tsx`:
  `PersonaApp`, `useConfigSnapshot('persona')`.
- `apps/desktop/src/main/config-broadcast.ts`: `configFamily`, the push that does reach the owner's persona windows.
