## The live run cannot launch the app as root

`pnpm live-run --confirm` spawned Electron with the main entry and the workspace alone. Run as root, as a Linux
container or a CI runner does, Chromium refuses to start without `--no-sandbox` ("Running as root without --no-sandbox
is not supported") and exits by SIGTRAP, so the first scenario, `sign-in`, failed before the app painted and no scenario
after it ran. The driver's launch has passed the switch for exactly this since it was written (`hostSwitches` in
`apps/desktop/scripts/lib/harness.mjs`); the live run's launcher never took it.

Found 2026-09-29 by the first live run of the merged revision 4 build of `PD-ORCH-005` (R-064), against the owner's
self-hosted endpoint, in the Linux container the build ran in.

## Specs

None: the live run is a verification tool (AGENTS.md, "The live run"). It left the product's only real-model check
unable to run on Linux as root.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `launch`, which builds the Electron arguments.
- `apps/desktop/scripts/lib/harness.mjs` — `hostSwitches`, `['--no-sandbox']` when the process runs as root.

## Repaired — 2026-09-29

`launch` passes `hostSwitches` after the main entry, as `lib/driver.mjs` does, under the owner's permission (R-065).
The next live run in the same container reached every scenario and passed. It then showed the application's own
code-intelligence child failing the same way
([`the-code-intelligence-server-cannot-start-as-root.md`](the-code-intelligence-server-cannot-start-as-root.md)).
