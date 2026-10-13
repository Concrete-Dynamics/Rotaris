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

## Outcome

Repaired by fin34 (2026-10-13). Main places Chromium's own profile below the machine-local data directory as its first act,
synchronously and before `app` is ready: `placeChromiumProfile` (`apps/desktop/src/main/chromium-profile.ts`) makes and sets
`userData` and `sessionData` to `dataLayout(dirs).chromiumProfile` (`<data>/chromium`: `~/.local/share/rotaris/chromium` on
Linux, `%LOCALAPPDATA%\rotaris\data\chromium` on Windows, `~/Library/Application Support/rotaris/data/chromium` on macOS) and
`crashDumps` to its `Crashpad` below it. It is synchronous because Chromium reads these paths while it starts, and main's code
after its first `await` (the instance claim) runs once it already has.

**A profile an earlier launch left at the old path** (`$XDG_CONFIG_HOME/Electron` or `~/.config/Electron` for a development
launch, `~/.config/<product name>` or `%APPDATA%\<product name>` for a packaged one) is neither read, moved nor deleted. Nothing
in it is the product's own state — caches, local storage the renderer keeps nothing durable in, Chromium's preferences — so
nothing is lost, and REQ-STARTUP-145 has the product adopt no directory it did not create in its own place; a development
launch's `Electron` directory is, besides, shared by every unpackaged Electron application on the machine. It stays until the
person removes it.

Pinned by `apps/desktop/src/main/chromium-profile.test.ts` (Linux with relative `XDG_*` values, and by platform switch Windows
and macOS: every path below the data directory, never `Roaming`; each directory made before it is set) and
`packages/platform/src/platform.test.ts` (the Windows spelling of `chromiumProfile`); both fail before the repair, which had no
`chromiumProfile`. Shown on Linux by `pnpm workspace-proof --skip-build` (2026-10-13, 59 passed, 0 failed, 2 skipped; load about
4 to 7): scenario 13c, which reported the stray profile without failing until now, asserts nothing is written at `rel-config`
and the profile, its `Local State` and `Preferences` included, is below the data directory. **Owed:** the built product on
Windows and macOS (no such host here, IC-3); there the placement is pinned by the platform-switch tests alone.
