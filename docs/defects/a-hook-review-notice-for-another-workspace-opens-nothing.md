## A hook-review notice for another workspace opens nothing

`REQ-NOTIFY-224`'s unreviewed-hooks notice carries `open-hook-review` naming the workspace whose hooks it concerns
(ESC-34). Notices are application-wide: main broadcasts the one notice slot to every main window
(`relay.broadcast(CHANNEL.noticeCurrent, …)`). So the action can be activated in a window whose workspace is not the one
it names: when a second main window holds another workspace (`PD-SHELL-001`'s add route, `REQ-STARTUP-163`), or after the
window that raised it switched workspace (`workspace.choose`). The renderer's dispatcher then compares the action's
workspace with the one it has open, finds them different, logs
`notice action "open-hook-review" names <A>, which is not the open workspace`, and opens nothing. The user pressed
"Review hooks" and nothing happened.

Two smaller faults sit on the same path. `hooks.review` carries no workspace, and main's `openHookReview` reviews
**whichever main window is active**, with the dialog parented to the first window `getAllWindows()` lists rather than the
window holding the workspace; and `hooks.reviewDecide` stores the decision for the workspace of the window the dialog's
command resolves to (`forCommand` of a dialog is the active main window), not for the workspace the dialog was opened for.
Both are right only while the reviewed workspace's window stays the active one.

Recorded 2026-10-13 by fin41 (item N86) before its repair. ESC-34's consequences call the navigation "owed", not
deferred; no ruling under R-051 or R-071 defers it.

Out of this defect, said so for whoever reads the dispatcher next: the provider-named `open-provider-sign-in` branch
also only logs, but no notice in the product names a provider (the only emitter, main's `recoveryFor`, sends
`{ kind: 'open-provider-sign-in' }` with none), so no user can reach it; `REQ-WORKSPACE-152` (1) reaches re-authentication
from Settings. It is a dormant branch, kept as it is.

## Specs

- `REQ-NOTIFY-044` (amended under ESC-34) — the action vocabulary includes "open the hook review for a named workspace",
  and "an action concerning a particular object … carries that object's identity, and activating it acts on that object
  without asking the user anything further". Activating it here acts on nothing.
- `REQ-NOTIFY-224` — the notice "offers an action opening the review".
- ESC-34's consequences (`docs/architecture/owner-decisions.md`): "navigating between workspaces from a notice is owed";
  ADR-0049 repeats it.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — `dispatchNoticeAction`'s `open-hook-review` case and the module-level
  `openWorkspace` it compares against.
- `apps/desktop/src/main/index.ts` — `openHookReview` (the active window's workspace; the dialog's parent), `recoveryFor`
  (the emitter).
- `apps/desktop/src/main/commands/hooks.ts` — `hooks.review` and `hooks.reviewDecide`.
- `apps/desktop/src/main/main-windows.ts` — `holding`, `handOver` and `#addWindow`: the routes that surface a window
  holding a workspace or add one for it without asking anything.
- `packages/contracts/src/commands.ts` — `hooks.review` carries no workspace.
- `apps/desktop/scripts/notice-proof.mjs` — section 6 drives the action only in the window that raised it.
