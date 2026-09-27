## The unpacked build reports Electron's version as the product's

`shell.hello` answered the About page's Version row with `app.getVersion()`. Electron answers that from the package
the runtime was started with. The packaged build is started with `app.asar`, whose `package.json` is the desktop
application's, so it was right there — ADR-0054's first execution saw "the product version, not Electron's". But
`electron apps/desktop/out/main/index.js` — the development entry, `pnpm app:drive` and every `*-proof` — is started
with a file, not a package, and Electron then reports its **own** version. `settings-proof`'s launch 1 read the row as
**`v44.1.1`** on unmodified `main` (56801df), and passed, because it asserted only `/^v\d/`.

## Specs

`REQ-STARTUP-007`: the running desktop's version is the one its own installation metadata declares, else the literal
`dev`. `REQ-STARTUP-158`: a release reports at run time the one version it declares. `REQ-SHELL-140`: the About page's
Version row is `v{version}`. Electron's version is none of these under any reading.

## Relevant files

- `apps/desktop/src/main/commands/shell.ts` — `shell.hello`'s `version`.
- `apps/desktop/scripts/settings-proof.mjs` — the Version row check that could not fail.

Noticed 2026-09-27 while building the version guard (first-release plan §4.1), whose task includes making the
reported version the declared one.

## Repaired — 2026-09-27, same day

`apps/desktop/src/main/version.ts` reads the version from `__dirname/../../package.json` — `apps/desktop/package.json`
from `out/main/`, and `app.asar/package.json` from inside the archive — so both entries take one code path and read the
one place `tools/release-guard` checks. A missing, unreadable or version-less file answers `dev` (`REQ-STARTUP-007`) and
never throws (`REQ-STARTUP-159`). `version.test.ts` covers the reader and asserts it reads the guard's declared place.

`settings-proof` now requires the Version row to equal `v` plus that declared version. **Measured both ways:** against
the build from before the repair it fails with `the Version row read "v44.1.1", not the declared v0.1.0`; after
`pnpm build` it passes reading `v0.1.0`.
