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

## Outcome

Repaired 2026-10-13 by fin41 (item N86). The renderer's `open-hook-review` case no longer compares the action's workspace
with its own: it sends `hooks.review { workspace }`, and main's `openHookReview` reaches that workspace through
`MainWindows.reach` — the window holding it surfaced (REQ-STARTUP-163), else a window added for it on PD-SHELL-001's
route, with no REQ-SHELL-021 gate and no window closed, so nothing is asked — and parents the review to that window. The
review payload keeps the workspace id it was opened for, and `hooks.reviewDecide` stores the decision against it rather
than against the active window. Adding a window where none holds the workspace ~~is the build's reading, raised as
[OQ-267](../../architecture/open-questions/57-spikes-and-later-questions-24.md#oq-267) for the consortium~~ was the build's reading, raised as
[OQ-267](../../architecture/open-questions/57-spikes-and-later-questions-24.md#oq-267); *amended in place 2026-10-14:* it is the ruled reading since
2026-10-13, under [R-072](../../product/requests.md#r-072), as [`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001)
revision 2, and nothing in the repair changed with the ruling. The provider-named sign-in branch is unchanged
(dormant: nothing names a provider).

Pinned by `apps/desktop/src/main/main-windows.test.ts` ("reaches a named workspace …", and the refusal with no main window),
by `apps/desktop/src/main/commands/hooks.test.ts` (added at review: `hooks.review` hands the action's workspace and the asking
window to the review flow, and `hooks.reviewDecide` stores the decision against the dialog's workspace id while the command
resolves to a window holding another; both red on the base `hooks.ts`), and by `pnpm notice-proof`'s section 6b, `review-other`: a window on a workspace with no hooks activates a notice naming
another workspace that declares one; main adds window 2 for it, opens its review (1 hook), and records the scripted
refusal for that workspace. Run against the base build (the repair's source reverted, the proof kept) the same section
failed with the renderer's "… which is not the open workspace" and no review; with the repair the whole proof passed.
Section 6 now also asserts that a notice naming the window's own workspace surfaces that window and builds none.
