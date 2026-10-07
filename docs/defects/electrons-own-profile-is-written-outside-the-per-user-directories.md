## Electron's own profile is written outside the per-user directories

`resolveUserDirs` (`packages/platform/src/dirs.ts`) is meant to be the only source of the per-user directories, and main never
calls `app.getPath` for data. But main never calls `app.setPath` either, so Chromium's own profile — `Local State`,
`Preferences`, `Cache`, `Code Cache`, `GPUCache`, `Local Storage`, `Session Storage`, `Network Persistent State`, `Crashpad`,
`Dictionaries` and the rest that every launch writes — lands wherever Electron's default `userData` directory is, which the product
does not decide:

- On Linux it is `$XDG_CONFIG_HOME/<application name>`, the variable taken as it stands. With `XDG_CONFIG_HOME=rel-config` a launch
  of the built app from a scratch working directory (Linux, 2026-10-07, fin30) wrote `<working directory>/rel-config/Electron/`
  while every directory of the product's own went to the home's defaults, since fin30 ignores a relative value
  (`docs/defects/fixed/a-relative-xdg-config-home-or-xdg-data-home-is-used-as-it-stands.md`). `pnpm workspace-proof`'s scenario 13c
  reports the same directory under `apps/desktop`.
- On Windows it is `%APPDATA%\<application name>`, the roaming profile REQ-STARTUP-145 excludes. Two spikes measured
  `app.getPath('userData')` there (`docs/architecture/spikes/cached-portable-launch.md`,
  `docs/architecture/spikes/presenter-liveness-and-instance-claim.md`), and the proof harness isolates `APPDATA` for that reason
  (`proofIsolationEnv`). Not measured on Windows for the built product; read from Electron's documented default.

The name is `Electron` in a development launch; a packaged one takes the product's name.

Noticed 2026-10-07 by the builder of fin30's bundle `fin30-platform-paths` while showing the relative-`XDG_*` repair on the built
app; recorded, not repaired.

## Specs

REQ-STARTUP-145: the per-user directories are the platform-conventional ones local to this machine and never replicated, and
conformance is decided by the directories the product actually writes to, not by the location the platform would have chosen
unasked (`docs/architecture/README.md`, A1). Chromium's profile is written by the product's process on every launch.

## Relevant files

- `apps/desktop/src/main/index.ts` — composes `resolveUserDirs` and never places Electron's `userData` or `sessionData`.
- `packages/platform/src/dirs.ts` — the per-user directories the product means to use.
- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv` sets `APPDATA` to the scratch profile's `roaming` so a driven
  Windows launch's Chromium profile stays in the scratch profile.
- `apps/desktop/scripts/workspace-proof.mjs` — scenario 13c, which reports the directory without failing on it.
