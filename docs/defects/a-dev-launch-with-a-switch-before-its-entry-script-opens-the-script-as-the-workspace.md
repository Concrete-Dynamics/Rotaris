## A dev launch with a switch before its entry script opens the script as the workspace

Launching the built tree as `electron --ozone-platform=headless --no-sandbox apps/desktop/out/main/index.js /tmp/ws` (Chromium
switches before the entry script) opens `apps/desktop/out/main/index.js` as the workspace, not `/tmp/ws`.
`workspaceFromArgv` (`apps/desktop/src/main/index.ts`) drops the first two entries of `process.argv` on an unpackaged launch,
assuming they are the executable and the entry script, and takes the first remaining entry that does not begin with `-`. Electron
keeps the switches where they were typed, so with one before the script the slice drops the executable and that switch, and the
first non-switch is the script.

Seen 2026-10-31 on the Linux host: the open read `…/out/main/index.js/.rotaris/workspace-id`, failed with `ENOTDIR`, and was
refused as an unreadable identifier (see the sibling note on non-directories). The proofs and `pnpm app:drive` put the entry script
first (`apps/desktop/scripts/lib/driver.mjs`) and do not meet it; a person reproducing by hand does. A packaged launch drops only
the executable, so it is not affected.

## Specs

None directly: REQ-STARTUP-163 governs the directory a launch is handed, and the product defines no argument vocabulary (P-13);
an unpackaged launch is a development path. It misled one reproduction.

## Relevant files

- `apps/desktop/src/main/index.ts`: `workspaceFromArgv`, the fixed `slice(2)`.
- `apps/desktop/scripts/lib/driver.mjs`: the launch order the proofs use, which avoids it.
