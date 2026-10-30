# Seams — what to touch, in what order, to add one of the things this product adds most often — 1. A renderer command

Part 1 of 8 of [the seams](../04-seams.md), which indexes every part.

## 1. A renderer command

The renderer's only outward path. One IPC channel carries every kind; the union discriminates.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/contracts/src/commands.ts` | a member of `CommandRequestSchema` (discriminated on `kind`). The answer is always `CommandOutcomeSchema`: `{ok: true, value?}` or `{ok: false, code, headline, detail?}` |
| 2 | `apps/desktop/src/main/commands/<facet>.ts` | the handler, filed under its kind: main answers it (preferences, theme, providers, windows, dialogs) **or** relays it |
| 3 | `packages/contracts/src/process-protocol.ts` | only if it relays: the request and reply that cross to a child |
| 4 | `apps/desktop/src/run-host/dispatch.ts` or `apps/desktop/src/workspace-service/index.ts` | the child's own dispatch `switch` — in the run host over the `RunHost` it is handed, never over module scope |
| 5 | `apps/desktop/src/renderer/session-actions.ts`, else the window's own root | the send — a surface takes a callback and never the bridge |

**Which side of the renderer.** A surface in `packages/ui/src/` holds no bridge: it takes a callback and returns
a result. The window's root is what sends, and which root depends on what the command is about. A gesture against
**the session this window follows** belongs in `apps/desktop/src/renderer/session-actions.ts` — resolve focus to a
session id, send one command, turn anything that is not a success into a sentence a surface can show — and adding
it there gives it to every window at once, because `shell.ts` makes that set one per window. Anything a window
reads or writes for itself stays in the root that draws it: `main.tsx` for the main window's six views,
`windows.tsx` for the approval, provider, pause, hook-review, persona and terminal windows.

**Which facet.** Nineteen sit beside `commands/context.ts`, one per family: `dialogs`, `providers`, `session`,
`hooks`, `mcp`, `initialization`, `skills`, `shell`, `git`, `checkpoints`, `library`, `improvements`, `config`,
`requirements`, `windows`, `workspace`, `update` (the updater's), `auth-recovery` (REQ-NOTIFY-072's recovery window,
2026-10-02; this line said sixteen until then, `update` uncounted) `reauth` (REQ-NOTIFY-071/078's prompt, 2026-10-02) and `dictation` (OQ-455, 2026-10-30, whose clients sit in `main/dictation/`).
Add the kind to the one whose name it already carries; a family with no
facet yet is a new file and one more spread in the table. Each declares the slice of `CommandContext` it uses
(`Pick<CommandContext, 'runHost' | …>`) — take what you need and nothing more, because that slice is what a
test has to satisfy. A member that does not exist yet is added to `CommandContext` and supplied in `index.ts`.

**There is no `default`.** `CommandHandlers` is total over `CommandRequest['kind']`, so a kind added at stop 1
and to no facet **fails to compile** at the table in `index.ts` rather than answering `command.unimplemented`
at run time. That is the point of stop 2: you cannot forget it, and you do not have to read a thousand-line
`switch` to find where it goes.

**The preload is not a stop.** It exposes one `command` method for every kind; only a *channel* (§2) adds a
method there.

Invariants:

- A command is answered **for the window that raised it** — `MainWindows.forCommand(senderId)`: the sender's main
  window, else the main window owning the persona or terminal window that sent it, else the active window — not for
  "the main window" (`REQ-SHELL-020`, `REQ-STARTUP-163`). With two main windows alive those are different answers.
- A request that does not parse is `command.malformed`. Nothing throws out of `runCommand`: an uncaught
  exception in main raises the platform's native error box and wedges the loop (`ADR-0019`). `runCommand`
  itself is now three moves — resolve the window, read the request, call the handler — and holds no case.
- **A renderer may not name a workspace, a preference key family or a session it was not given.** Main resolves
  the per-workspace key from the window it opened — that is what makes the composer draft and the requirement
  folds safe. Copy that discipline rather than adding a parameter.
- Main never opens the store, never reads `agents.yaml`, never hands a credential to a renderer (W-01).

Evidence: `pnpm app:drive command …` drives `runCommand` itself, so the command is exercised by the same path
the renderer reaches. A facet is also reachable **without a process at all** — satisfy its slice of
`CommandContext` with plain objects and call the handler (`commands/mcp.test.ts` is the worked example).
Update the process view's **renderer → main** list.

---
