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

## Outcome

*Repaired 2026-10-14 by fin44 (`fin44-notice-reach`).* Confirmed first on the branch: a second `reach` of a workspace whose
window the first `reach` had added, met while that window's open was still in flight, answered at once with no workspace id
(`main-windows.test.ts`, "answers a reach of a window still opening its workspace once the open has settled, with the
workspace id, and builds once", red before the repair: the second answer arrived before the open settled, `workspaceId`
undefined). The readiness signal the note asked for is now set at `build`: a window record's `workspaceReady` is pending from
the moment it is built and settles when its first workspace open settles, or when the window is forgotten
(`MainWindows.build`, `open`, `#forget` in `apps/desktop/src/main/main-windows.ts`). `MainWindows.reach`, meeting a holder with
no workspace id, surfaces it and waits for that open (bounded by `awaitWorkspace`'s 30 s); an open that failed has destroyed
the window and reported the failure under REQ-SHELL-019, and the press is answered as a refusal rather than adding a second
window ("answers a reach of a window whose open then failed as a refusal, and adds no second window for it", red before). So
`openHookReview`, and every later caller of `reach` (`focus-session`'s and the project-setup action's, PD-SHELL-001 revision 3
and PD-WORKSPACE-005 revision 3), meets a reached window with its workspace open.

The chooser's and the hand-over's surfacing of a holder (named above as the same shape) only surface the window and act on
nothing in it afterwards, so they cannot be refused this way; they are unchanged. The same pending readiness also makes a
view's start-time read that arrives between a window's load and its open wait for that open (`awaitWorkspace`), as
`06-sequences.md` says it does, where it used to find the readiness already settled. No proof drives a double press inside a
window's load; the unit cases above are the evidence.
