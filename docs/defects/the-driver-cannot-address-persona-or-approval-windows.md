## The driver cannot address persona or approval windows

`pnpm app:drive` reaches main windows only: `windows` lists them, and `eval`, `probe`, `inspect` and `shot` act on the
active main window's web contents. A persona window's DOM (`[data-testid=persona-agent-state]`, the state dot's
computed style) and an approval dialog cannot be probed or captured. The built-app drive of the merged revision 4 build
(R-064) read the persona windows' `paused` state from raw X11 captures, so that evidence is visual only; approvals are
answered through `session.control`'s `answerApproval` command rather than in their dialog.

## Specs

None: the driver is a verification tool (AGENTS.md, "Driving the built app"). It limits what built-app evidence can
show for `PD-ORCH-005` clause 13's "a persona window" and REQ-TOOLS-063's dialog.

## Relevant files

- `apps/desktop/src/main/driver.ts` — the driver's commands, `windowOrThrow()` resolving to a main window.
- `apps/desktop/scripts/drive.mjs` — the command line.
