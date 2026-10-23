## The installer names its uninstall entry, its uninstaller and its shortcuts otherwise than REQ-STARTUP-018

Noticed 2026-10-23 while making the installer assisted (the packaging brief of that day), from electron-builder 26.15.3's
NSIS templates and the configuration; no installer was run on Windows. electron-builder writes the per-user uninstall
entry under `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<APP_GUID>` — a GUID derived from `appId` — not
under `...\Uninstall\Rotaris`; it names the uninstaller `Uninstall Rotaris.exe`, not `Uninstall.exe`; with no
`menuCategory` it puts one `Rotaris` shortcut at the Start Menu's top level, with no `Rotaris` folder and no
`Uninstall Rotaris` shortcut; and it writes `Publisher` only from the package's `author`, which `apps/desktop/package.json`
does not declare (electron-builder logs "author is missed"), so the entry carries no `Publisher = Rotaris`. It does write
`DisplayName`, `DisplayVersion`, `DisplayIcon`, `UninstallString`, `NoModify` = 1 and `NoRepair` = 1.

## Specs

- REQ-STARTUP-018: "create a Start Menu folder `Rotaris` containing shortcuts `Rotaris` (to the app) and `Uninstall
  Rotaris`; write a per-user uninstall registry entry under `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Rotaris`
  with `DisplayName`, `DisplayVersion`, `Publisher` = `Rotaris`, …; and write an `Uninstall.exe` into the install
  directory." Four of those differ as described above.

## Relevant files

- `apps/desktop/electron-builder.yml` — `nsis` carries no `guid`, `menuCategory` or uninstaller name; `appId` decides the GUID.
- `apps/desktop/resources/installer.nsh` — the project include, where a `customInstall` could write what electron-builder does not.
- `apps/desktop/package.json` — no `author`, so no `Publisher`.
- `node_modules/app-builder-lib/templates/nsis/include/installer.nsh` — `registryAddInstallInfo`, what electron-builder writes.
