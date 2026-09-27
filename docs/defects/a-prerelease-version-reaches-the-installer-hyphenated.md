## A prerelease version reaches the installer's name and metadata hyphenated

A prerelease release version is written the way `REQ-STARTUP-027`'s grammar writes it, with no separator: tag
`v0.1.0rc1`, version `0.1.0rc1`. The version guard requires `apps/desktop/package.json` to declare exactly that text
before a prerelease tag may build (`REQ-STARTUP-028`), and pnpm accepts it there. electron-builder does not keep it:
its package-metadata normalisation (`app-builder-lib/out/util/normalizePackageData.js`, `fixVersionField`) runs
`semver.clean(version, loose)`, and loose SemVer rewrites the suffix with a hyphen. Measured on electron-builder
26.15.3, the version this repository pins: `0.1.0rc1 → 0.1.0-rc1`, `0.1.0a2 → 0.1.0-a2`, `0.1.0b3 → 0.1.0-b3`; `0.1.0`
is unchanged.

So for any prerelease, `electron-builder.yml`'s `artifactName: "Rotaris-${version}-windows-x64-setup.${ext}"` would
produce `Rotaris-0.1.0-rc1-windows-x64-setup.exe`, the installer's own version metadata would carry `0.1.0-rc1`, and
the naming check in `build-hooks.cjs` (`checkNaming(ctx.packager.appInfo.version)`) would not notice. It compares
against the normalised version, so both sides are equally wrong. The running application would still report
`0.1.0rc1`, because it reads the packed `package.json` as written (`main/version.ts`). Stable versions are not
affected, so `v0.1.0` is not either. The first prerelease the plan runs is its step 5 (`v0.1.0rc1`).

## Specs

`REQ-STARTUP-031`: artifact names are `Rotaris-{v}-…` from the single naming authority, with `{v}` the release
version. `REQ-STARTUP-027`: `v1.2.3-rc1` is not a release tag, so `0.1.0-rc1` is not a release's version.
`REQ-STARTUP-158`: every artifact declares the release's one version. `REQ-STARTUP-152`: the published names, the
checksum manifest's names and the name the updater asks for agree.

## Relevant files

- `apps/desktop/electron-builder.yml` — the two `artifactName` templates rendered from `${version}`.
- `apps/desktop/scripts/build-hooks.cjs` — `checkNaming`, fed the normalised `appInfo.version`.
- `tools/release-naming/src/index.ts` — `artifactName`, the authority the name should come from, given the tag's version.
- `tools/release-guard/src/versions.ts` — the guard that requires the unhyphenated declaration.

Noticed 2026-09-27 while building the version guard (first-release plan §4.1). The repair belongs to the tag workflow
and packaging steps (§4.2, §4.5). The name has to be rendered from the tag's version through `tools/release-naming`,
not from electron-builder's `${version}`, and the naming check has to compare against the declared text, not the
normalised one.
