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

## Outcome so far

**Open on [OQ-205](../architecture/open-questions.md).** The repair below is built, and the note stays open until OQ-205
is ruled: the requirements do not settle which closes ask, and the build asks at the close of the last main window only,
not at the close of one of several, nor at a quit Electron starts on its own account (SIGTERM, logout, `app.quit()`).
When OQ-205 is ruled, the build is made to agree with the ruling (or confirmed as built) and the note moves to
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
[OQ-205](../architecture/open-questions.md), with the reading the build proceeds under — asked only when no other main
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
