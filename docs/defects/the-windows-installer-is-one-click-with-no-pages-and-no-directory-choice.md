## The Windows installer is one-click, with no pages and no directory choice

Noticed during R-079's smoke check of the CI installer (2026-10-21), from the configuration and from an earlier install on
the owner's machine; **this build's installer was not run** (the smoke check extracted its payload instead, to leave that
install untouched).

`apps/desktop/electron-builder.yml` sets `nsis.oneClick: true` and `nsis.perMachine: false`. electron-builder's one-click
NSIS installer shows no Welcome, Directory or Finish page and offers no directory choice: it installs straight into
`%LOCALAPPDATA%\Programs\<name>`. An install of an earlier build on the owner's machine (dated 2026-09-13) sits at
`%LOCALAPPDATA%\Programs\@rotarisdesktop\Rotaris.exe`, the directory named after the workspace package `@rotaris/desktop`
rather than after the product. ADR-0054 reads the same two keys as selecting "the assisted per-user installer", which is
`oneClick: false`.

What this build's installer writes in the registry (REQ-STARTUP-016's `HKCU\Software\Rotaris\InstallDir`, REQ-STARTUP-018's
uninstall entry and Start Menu folder) and whether it honours `/S` and `/D=` as REQ-STARTUP-017 states was not measured;
the installer's own run is REQ-STARTUP-156's gate, on O-6's machine.

## Specs

- REQ-STARTUP-016: "default install location `%LOCALAPPDATA%\Rotaris`, with the chosen directory remembered" under
  `HKCU\Software\Rotaris` — the one-click installer's default is `%LOCALAPPDATA%\Programs\…`, and nothing is chosen.
- REQ-STARTUP-017: "Interactive installation SHALL flow Welcome → Directory → Install → Finish, warn on abort, and offer a
  checked-by-default "Launch Rotaris" checkbox" — a one-click installer has none of those pages.

## Relevant files

- `apps/desktop/electron-builder.yml` — `nsis.oneClick: true`, and no `nsis` key for the directory or the registry value.
- `docs/architecture/adr/0054-packaging-artifacts-and-self-update.md` — "What was checked": the assisted per-user installer.
