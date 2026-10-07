## An empty LOCALAPPDATA puts the per-user directories at a relative path

On Windows, `resolveUserDirs` (`packages/platform/src/dirs.ts`) takes `LOCALAPPDATA` with `??`, so a variable that is set but
empty (`set LOCALAPPDATA=`) is used as it stands: the configuration directory becomes `rotaris\rotaris` and the data
directory `rotaris\data`, both relative to whatever the process's working directory is. `resolvePreferenceRoot`
(`packages/platform/src/preferences.ts`) reads it the same way, so the preference store lands at a relative
`Rotaris\Rotaris` too; the three agree, but none is a per-user location. The fallback both already carry
(`<home>\AppData\Local`) is what an empty value should take, as the Linux branch now does for an empty
`XDG_CONFIG_HOME` and `XDG_DATA_HOME` (`xdgBaseDirectory`).

Windows sets `LOCALAPPDATA` for every interactive session, so an empty one needs an environment a launcher or a user emptied.
Not measured on Windows; read from the code.

Noticed 2026-10-07 by the builder of finacc3's bundle `finacc3-accept1-12` while repairing the Linux case
(`docs/defects/fixed/an-empty-xdg-config-home-puts-the-configuration-directory-at-a-relative-path.md`); recorded, not repaired.

## Outcome

Repaired 2026-10-07 (fin30, branch `fin30-platform-paths`; finacc3 round 2 finding A2-07). `localAppDataDirectory`
(`packages/platform/src/dirs.ts`) is now the one reading of `LOCALAPPDATA`: a value that is unset, empty or not absolute by
`win32.isAbsolute` (`rel`, or the drive-relative `C:rel`) takes the `<home>\AppData\Local` fallback both functions already
carried. `resolveUserDirs`'s `win32` branch and `resolvePreferenceRoot` (`packages/platform/src/preferences.ts`) both read through
it, so the configuration directory, the data directory and the preference store keep agreeing and none can be relative to the
working directory. The relative value goes beyond the finding, which named the empty one; it was taken with it because it does
the same harm and the same one-line rule covers it.

Pinned by `packages/platform/src/platform.test.ts` ("on Windows an empty or relative LOCALAPPDATA takes <home>\AppData\Local"),
which parameterises the platform and fails on the old reading with `expected { config: 'rotaris\rotaris', …(1) } to deeply equal
{ …(2) }`. **Not measured on Windows**: this host is Linux and no Windows host is available to this bundle, so no built-app launch
drove the path; the platform-switch case is the evidence. A Windows run with `set LOCALAPPDATA=` before the launch should show the
store under `%USERPROFILE%\AppData\Local\rotaris\data` and nothing under the working directory.

## Specs

REQ-STARTUP-145 (the per-user directories are the platform-conventional ones, the location local to this machine) and
REQ-CONFIG-001 (the global scope on Windows is `%LOCALAPPDATA%\rotaris\rotaris\`): a path relative to the working
directory is neither.

## Relevant files

- `packages/platform/src/dirs.ts` — `resolveUserDirs`'s `win32` branch, `??` on `LOCALAPPDATA`.
- `packages/platform/src/preferences.ts` — `resolvePreferenceRoot`'s `win32` branch, `??` on `LOCALAPPDATA`.
- `packages/platform/src/platform.test.ts` — the Windows cases cover a set and an unset `LOCALAPPDATA`, not an empty one.
