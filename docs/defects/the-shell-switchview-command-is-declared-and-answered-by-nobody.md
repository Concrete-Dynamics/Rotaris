## The shell.switchView command is declared and answered by nobody

The command contract declares `shell.switchView { view }` and main answers it with `command.unimplemented`
("shell.switchView is not built yet"). Nothing sends it: view switching is the renderer's own business
(`useShellState`'s `switchView`, REQ-SHELL-025), and main has never had a part in it. The kind is dead contract surface
that reads as a missing feature, and the process view lists it among main's commands.

Recorded 2026-10-13 by fin41 (item N86, part b). No user lacks anything because of it.

## Specs

- None contradicted. `REQ-SHELL-023`/`REQ-SHELL-025` fix the views and their switching, which the renderer does.

## Relevant files

- `packages/contracts/src/commands.ts` — the `shell.switchView` member of the command union.
- `apps/desktop/src/main/commands/shell.ts` — the stub answering it.
- `docs/architecture/views/02-process-view.md` — names it among main's commands.
