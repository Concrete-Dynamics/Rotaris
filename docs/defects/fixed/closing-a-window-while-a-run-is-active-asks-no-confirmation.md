## Closing a main window while a run is active asks no confirmation

REQ-STARTUP-046 requires a confirmation before a window is torn down while a run is active: two answers, close anyway
and return to the window, the returning answer the default and Escape's, and a decline that leaves the window, its
state and the run exactly as they were. The build asks none. A main window's close guard (`guardClose` in
`apps/desktop/src/main/main-windows.ts`) asks only the renderer's `window.__rotarisCloseGuard`, which
`apps/desktop/src/renderer/main.tsx` installs for unsaved settings alone (REQ-CONFIG-286/287), and the application's
quit (`closeThroughGuards`, `apps/desktop/src/main/exit.ts`) asks the same guards. With no unsaved settings, a window
closes at once whatever is running in it; a project switch (REQ-STARTUP-047, which "depends on this refusal") has no
active-run confirmation to be refused by either (its REQ-SHELL-021 gate 3 declines a workspace open while a run is
active, which is a different rule).

Noticed on 2026-10-06 while building OQ-86's ruling (plan fin21), which asks REQ-STARTUP-046's confirmation at the
update's own two closes (`UpdaterDeps.confirmClose`). That build asks it from main, through a message box, for the update
actions only; the ordinary close of a window, and the quit, still ask nothing about a run.

What a repair has to weigh: `PD-ORCH-005` (clauses 3 and 9) makes a quit leave every unfinished agent `paused`, resumable
by Continue, where REQ-STARTUP-046's text says closing "ends" the run, so the confirmation's words and the directive's rest
should be read together. Recorded, not repaired.

## Specs

REQ-STARTUP-046 (the confirmation and the decline), REQ-STARTUP-047 (the switch's refusal that depends on it),
REQ-SHELL-055 (Escape and the close control as the returning answer). `PD-ORCH-005` clauses 3 and 9 bear on its wording.

## Relevant files

- `apps/desktop/src/main/main-windows.ts` — `guardClose`, the main window's close guard; asks the renderer's guard only.
- `apps/desktop/src/renderer/main.tsx` — `window.__rotarisCloseGuard`, set only while settings are dirty.
- `apps/desktop/src/main/exit.ts` — `closeThroughGuards`, the quit's pass over the same guards.
- `apps/desktop/src/main/index.ts` — `confirmClose` beside `createUpdater`, the one place the active-run confirmation is asked (OQ-86), and `activeRunCount`, the run host's `runs.active`.

## Outcome

**Repaired 2026-10-07 (fin28, bundle `fin28-window-gate-timeout`), under [OQ-206](../../architecture/open-questions.md)'s
ruling of that day ([R-072](../../product/requests.md#r-072)), recorded as
[`PD-SHELL-009`](../../product/directives.md#pd-shell-009).** Closing a main window ends the active runs of its own project
and asks first. The last main window's close asks REQ-SHELL-119's question over the instance's count, as before. The close of
one of several asks "Close this window while a run is active?" (`windowCloseBox`, `apps/desktop/src/main/close-confirmation.ts`)
while the window's own workspace has a run active — the run host's `runs.active` now keyed by the session row's
`workspace_root` (`Sessions.activeRunCount(workspaceRoot?)`, `packages/engine/src/sessions.ts`) — and its Yes awaits the run
host's `runs.stopWorkspace` (`Sessions.stopActiveIn`: the stop control's graceful stop, so the sessions rest `paused` by
`stop`) before the close guard confirms the close. The stopped sessions are kept in `QuitState.stoppedByClose`
(`apps/desktop/src/main/exit.ts`): the closing window's approval dialog and question dock answer nothing, an approval queued
behind it is not reported unshown, and their notices are held back until their rest is published. A window with no active
run of its own closes without asking; REQ-SHELL-021's gate 3 counts the requesting window's workspace; a quit outside any
window asks nothing, as before. Pinned by `close-confirmation.test.ts`, `exit.test.ts`, `commands/session.test.ts`,
`dispatch.test.ts`, `main-windows.test.ts` (two windows closed in one gesture) and `run.test.ts` (the keyed count and the
workspace stop), fourteen cases red on the source before the change; shown by `pnpm part-j-proof`'s two-window launch
(`pair-app`). The Windows logout claim this note's repair relied on is recorded apart:
[`a-windows-logout-skips-the-orderly-shutdown.md`](../a-windows-logout-skips-the-orderly-shutdown.md).

## Outcome so far (2026-10-06, kept as written)

**Open on [OQ-206](../../architecture/open-questions.md).** The repair below is built, and the note stays open until OQ-206
is ruled: the requirements do not settle which closes ask, and the build asks at the close of the last main window only,
not at the close of one of several, nor at a quit Electron starts on its own account (SIGTERM, logout, `app.quit()`).
When OQ-206 is ruled, the build is made to agree with the ruling (or confirmed as built) and the note moves to
`docs/defects/fixed/`.

Repaired in part 2026-10-06 (fin22, bundle `fin22-window-strip-config`). A person's close of a main window now asks REQ-SHELL-119's
guards in order: the renderer's unsaved-settings guard, then, once that allows, the active-run confirmation
(`confirmActiveRunClose` and `activeRunCloseBox`, `apps/desktop/src/main/close-confirmation.ts`), which `guardClose`
(`apps/desktop/src/main/main-windows.ts`) takes as its third argument and main supplies through the adapter's
`confirmRunsAtClose` (`apps/desktop/src/main/index.ts`), reading the run host's `runs.active` as OQ-86's build does. The box
asks "Quit while a run is active?" ("Quit while {n} runs are active?") with Cancel and Yes, Cancel first, the default and
the `cancelId` that Escape and the box's close control give (REQ-SHELL-055); its detail conveys REQ-STARTUP-046's three
things with REQ-SHELL-119's statement that shutdown is requested and in-flight work may not finish ("ends" read with
`PD-ORCH-005` clause 3: the shutdown stops the run, leaving its unfinished agents `paused`). Only Yes closes; Cancel, or a
box that cannot be shown, leaves the window, its state and the run as they were, and a second close made while the box
is open asks nothing more. A count that cannot be read asks.

Which closes ask is not settled by the requirements, written for one main window: raised as
[OQ-206](../../architecture/open-questions.md), with the reading the build proceeds under — asked only when no other main
window stays open (only that close ends a run, REQ-STARTUP-161), and not on a quit Electron starts on its own account
(`before-quit`, which REQ-SHELL-119's "user-initiated close" does not name), so the application's quit
(`closeThroughGuards`) still asks the renderer's guards alone. The switch's outgoing window closes beside its replacement
and so asks nothing; REQ-SHELL-021's gate 3 declines the switch while a run is active.

Pinned by `apps/desktop/src/main/close-confirmation.test.ts` (the box's words, buttons, default and `cancelId`; no ask with
no run or with another window staying; only Yes closes; an unreadable count asks; a box that cannot be shown keeps the
window) and the "a person's close asks the active-run confirmation" cases in `apps/desktop/src/main/main-windows.test.ts`
(the order of the two guards, a declined close changing nothing, the held second close, the quit asking the renderer's
guard alone), four of which fail on the previous `guardClose`. Shown by `pnpm part-j-proof`: its `quit` launch asserts the
box in these words before the run is stopped for shutdown (answered Yes), and the new `quit-declined` launch answers
Cancel and asserts the run went on to `completed` (`tasks_complete`) with the window still there to photograph.
`mcp-proof`'s `exit-bound` launch answers the box Yes where its run is still active at the close.
