## A run's unreviewed-hooks notice names the active window's workspace, not the run's

Recorded 2026-10-14 by fin44 (`fin44-notice-reach`) while building PD-SHELL-001 revision 3 (OQ-292), which asked whether the
same active-window guess it removed from `focus-session` also stands for `hooks.review` raised through `notice.publish`. It does.
Confirmed by reading the path; not repaired: outside the task that found it.

A run whose workspace declares hooks the user has not reviewed publishes "Workspace hooks need review" from the engine
(`Run.start` in `packages/engine/src/run/run.ts`, `action: 'hooks.review'`, keyed by the run's own workspace,
`hooks.review:<workspace>:<fingerprint>`). The run host forwards it as `notice.publish` with the action identifier and no
workspace, and main maps it to REQ-NOTIFY-044's member with `recoveryFor(e.action, activeWindow()?.workspace, e.sessionId)`
(`apps/desktop/src/main/index.ts`): the `open-hook-review` action names the workspace of whichever main window was focused
when the event arrived. With two main windows on two workspaces (PD-SHELL-001), a run started in window A whose hooks need
review, while window B is focused, raises a notice whose "Review hooks" reaches B's workspace — it opens B's review (or answers
"This workspace declares no hooks") instead of A's. The notice's key names A, so the store's suppression and its action
disagree too.

Since 2026-10-14 `notice.publish` carries the run host's `workspaceRoot` for the session (from `sessionRoots`, PD-SHELL-001
revision 3); the repair is to name that root here, and to raise no action where it is absent, on the terms revision 3 fixes for
`focus-session`.

## Specs

REQ-NOTIFY-044 as amended under ESC-34 (an action concerning an object carries THAT object's identity: "open the hook review
for a named workspace"); REQ-NOTIFY-224 (the notice is about the workspace declaring the hooks); PD-SHELL-001 revisions 2 and 3
(the reach acts on the named workspace, so a wrong name reaches the wrong project).

## Relevant files

- `apps/desktop/src/main/index.ts` — the `notice.publish` branch of `runHost.onEvent`: `recoveryFor(e.action, activeWindow()?.workspace, e.sessionId)`.
- `packages/engine/src/run/run.ts` — the run's `hooks.review` notice, keyed by `trust.workspace`.
- `apps/desktop/src/run-host/host.ts` — the `notice` port that sends `notice.publish`, now with `workspaceRoot`.
- `packages/contracts/src/process-protocol.ts` — `notice.publish`'s optional `workspaceRoot`.
