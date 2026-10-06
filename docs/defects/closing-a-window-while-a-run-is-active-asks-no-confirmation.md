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
