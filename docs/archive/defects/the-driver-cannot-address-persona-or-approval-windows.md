## The driver cannot address persona or approval windows

`pnpm app:drive` reaches main windows only: `windows` lists them, and `eval`, `probe`, `inspect` and `shot` act on the
active main window's web contents. A persona window's DOM (`[data-testid=persona-agent-state]`, the state dot's
computed style) and an approval dialog cannot be probed or captured. The built-app drive of the merged revision 4 build
(R-065) read the persona windows' `paused` state from raw X11 captures, so that evidence is visual only; approvals are
answered through `session.control`'s `answerApproval` command rather than in their dialog.

## Specs

None: the driver is a verification tool (AGENTS.md, "Driving the built app"). It limits what built-app evidence can
show for `PD-ORCH-005` clause 13's "a persona window" and REQ-TOOLS-063's dialog.

## Relevant files

- `apps/desktop/src/main/driver.ts` — the driver's commands, `windowOrThrow()` resolving to a main window.
- `apps/desktop/scripts/drive.mjs` — the command line.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. Confirmed first on the branch's code: the driver resolved every selector through
`DriverDeps.window`, and that function answered for main windows alone. A persona window could not be named. The new
cases in `driver.test.ts` fail against that code.

- A window can now be named by its role, as well as by index or workspace suffix: `persona:<persona>` for that
  persona's window (REQ-SHELL-072), `approval` for the approval dialog a main window holds open (REQ-TOOLS-063), and
  `terminal` for its terminal window. `useWindow` takes any of these, and so does any op's own `window`.
- `apps/desktop/src/main/driver.ts` holds the resolution: `AuxiliaryWindow`, `namesAuxiliary`, `resolve`. A role
  names the first such window, main window by main window in `windows`' order. A main window whose workspace path ends
  in a role word is named with its separator (`/terminal`).
- `main/index.ts` supplies each main window's persona windows, open approval dialog and terminal window as
  `DriverDeps.auxiliary`.
- `windows` lists them under `auxiliary`: selector, role, owner, wcId, visible.
- A selector that names no open window is still refused. The refusal lists the main and the auxiliary windows that are
  open, and the selection stays as it was. `deferProjectOffer` refuses a window that is not a main window.
- The per-request `window` override that the driver's comment had claimed since A4 was read by no op. Every op now
  resolves `request.window ?? selected`. That falsified claim is kept in `driver.ts` beside its repair.
- `scripts/drive.mjs` gains `useWindow <name>` and `--window=<name>` on every command, and its header documents the
  names. While driving the repair, `shot` joined an absolute path onto the working directory; it now resolves the path.
  AGENTS.md says the same under "Driving the built app".

Pinned by `driver.test.ts` (six cases): roles are read as roles; `windows` lists the auxiliary windows; `useWindow`
reaches a persona window and back; a request's own `window` reaches the approval dialog for one op; an unmatched role is
refused with what is open; `deferProjectOffer` refuses an auxiliary window.

`driver-proof`'s second launch (`permission_mode: ask`) exercises it on the built app:
- It answers both approvals the run raises (`Allow orchestrator to run delegate?`, `Allow alpha to run write_file?`) with
  the dialog's own Approve once, through `window: 'approval'`, and photographs the first one. The child's `NOTES.md` is
  written.
- It opens the child's persona window with the Mission view's Pop out, reaches it through
  `useWindow('persona:coding-agent')`, and probes `persona-agent-name` (`alpha`) and `persona-agent-state` (`running`).
- It refuses `persona:nobody`.
