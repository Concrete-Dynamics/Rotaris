## A notice action that reaches a window still opening its workspace is refused

`MainWindows.reach` (`apps/desktop/src/main/main-windows.ts`) returns the window whose record names the workspace. A record
names its workspace from `build` onward, but its `workspaceId` is set only once the renderer has asked to open it and the
open resolved (`open`). So a window still opening the workspace — the window a first press of "Review hooks" added, met by a
second press while it loads — is returned with no `workspaceId`, and `openHookReview` (`apps/desktop/src/main/index.ts`)
answers "Open a workspace before reviewing its hooks" for a workspace that is about to be open. Awaiting the record's
`workspaceReady` does not close it: that promise is replaced only when the renderer's open request arrives, after the
window's load, so between `build` and that request it reads as ready. The chooser's and the hand-over's surfacing of a holder
have the same shape. Rare: a double activation inside the window's load. A fin41 review finding
(`fin41/notices-and-harness`, Task 1), recorded by fin43 (`fin43-optional-findings`); not repaired there, since the repair is
a readiness signal set at `build` that the notices path, the chooser and the hand-over would share.

## Specs

- `REQ-NOTIFY-044` (as amended under ESC-34): the action acts on the named workspace "without asking the user anything
  further"; a refusal naming no open workspace, while the workspace is opening in a window the same action added, is not
  that.
- `REQ-STARTUP-163`: the window holding a workspace is the one surfaced; it is surfaced, but the action then fails on it.

## Relevant files

- `apps/desktop/src/main/main-windows.ts` — `reach`, `#windowHolding`, `build` (names the workspace, `workspaceId`
  undefined), `open` (sets `workspaceReady` and `workspaceId`), `awaitWorkspace`.
- `apps/desktop/src/main/index.ts` — `openHookReview`, which reads `target.workspaceId`.
- `apps/desktop/src/main/main-windows.test.ts` — the `reach` cases; the harness can defer opens (`deferOpens`).
- `docs/architecture/open-questions.md` OQ-267 — the add route this reach takes for a workspace no window holds.
