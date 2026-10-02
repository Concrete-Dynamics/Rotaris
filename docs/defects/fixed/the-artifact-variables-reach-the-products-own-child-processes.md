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

## Repaired — 2026-09-28 under R-062

**Observed before it was repaired.** The note's inference holds: the built app launched with both variables set, with
the repair's one line reverted, ran a scripted `terminal` call whose shell's environment carried `APPIMAGE` and
`ROTARIS_PORTABLE_ARTIFACT` with the launch's values (`pnpm updater-proof`, stage 2, the one failing check).

**At one seam.** Every child of the product takes its environment from main's: `utilityProcess.fork` gives the run host
and each workspace service main's environment as it stands when they are forked, and the run host hands its own
`process.env` to the confinement service (tools and terminals), the hook runner, the MCP transport and so the
code-intelligence branch; the updater's successor and the installer hand-off are spawned by main with its environment
too. So the one place that reaches all of them is main's own environment, before the first fork. `takeArtifactVariables`
(`packages/platform/src/artifact-environment.ts`) reads the two names and deletes them in one step, and it is the
first statement of main's module body (`const launchArtifact = takeArtifactVariables(process.env)` in
`apps/desktop/src/main/index.ts`); the classification is given what it read (`classifyThisInstallation(launchArtifact)`),
never `process.env`. The two names now live in `@rotaris/platform` beside the helper, and `classify.ts` re-exports them.
Only those two are taken: the AppImage runtime's `APPDIR`, `ARGV0` and `OWD` name nothing the product reads. A Rotaris
started from inside a Rotaris terminal therefore classifies from its own launch alone; the portable's successor is the
launcher stub, which publishes its own variable.

**Pinned by** `packages/platform/src/artifact-environment.test.ts` (the helper strips exactly those two names and
nothing else, case-insensitively on Windows only; a real child spawned after the take carries neither while the values
read before it are intact), `apps/desktop/src/main/launch-artifact.test.ts` (the take is the first statement of main's
body and precedes every fork and spawn main performs; no fork passes an environment of its own; the classification is
given what the take read, and classifies portable from it while a launch from the scrubbed environment does not), and
`pnpm updater-proof`'s stage 2 in the built app (11 checks, all green: the tool's shell carries neither variable and
still carries the launch's others). Not shown here: a packaged build on Windows or an AppImage (IC-3); the hooks' and
MCP servers' environments are the run host's, which the terminal's reading measures, and were not read separately.
REQ-STARTUP-147 lists the variables written for child processes and none removed from them — **OQ-90**.
