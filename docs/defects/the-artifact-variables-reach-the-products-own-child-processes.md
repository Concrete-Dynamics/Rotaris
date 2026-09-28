## The artifact variables reach the product's own child processes

The updater classifies the installation from two environment variables, which classify.ts reads only on a packaged
build: `APPIMAGE`, set by the AppImage runtime, and `ROTARIS_PORTABLE_ARTIFACT`, which the portable's launcher stub
publishes with the artifact's path (ADR-0054, "The updater"). Both stay in main's `process.env` for the whole life of
the process. The run host and the workspace services are forked with Electron's default environment, which is
main's, and `apps/desktop/src/run-host/host.ts` hands `process.env` to the confinement service that starts the tools'
commands. So a terminal or a tool shell inside a portable Rotaris sees
`ROTARIS_PORTABLE_ARTIFACT=<the portable's path>`. A packaged Rotaris started from that shell inherits it. On Windows,
outside `InstallDir`, that launch is then classified portable, and its updater would target the other artifact's path
for rename-aside and replace. The same holds for `APPIMAGE` on a packaged Linux build. This is inferred from the code,
not observed: there is no packaged build on this host (IC-3), and it was not traced whether every spawn path copies
`process.env` unfiltered.

Noticed at the second verification of the updater item (R-062, 2026-09-28). Not repaired: removing the two variables
from the environment handed to child processes touches the run host's and the terminal's spawn paths, which are
outside the item.

## Specs

REQ-STARTUP-106: the flavour is decided from "the artifact the launch started from". A variable inherited from another
artifact's process tree names a different artifact. REQ-STARTUP-147: the variables are "set by the artifact's own
runtime rather than by a user", and an inherited copy is neither. The same requirement says a variable of that kind
"decides which file an update replaces", so an inherited value decides the wrong file.

## Relevant files

- `apps/desktop/src/main/updater/classify.ts`: reads `APPIMAGE` and `ROTARIS_PORTABLE_ARTIFACT` from the environment
  it is given.
- `apps/desktop/src/main/updater/electron.ts`: `classifyThisInstallation` passes `process.env`.
- `apps/desktop/src/run-host/host.ts`: passes `process.env` to the `ConfinementService` that starts the tools' commands.
- `apps/desktop/src/main/index.ts`: forks the run host and the workspace service, and inherits the environment.
