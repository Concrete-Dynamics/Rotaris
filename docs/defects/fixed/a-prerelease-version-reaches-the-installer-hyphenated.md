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

## Repaired 2026-09-28 under R-062

**What changed.** The two `${version}` templates are gone from `apps/desktop/electron-builder.yml`, which now carries no
`artifactName` at all. `pnpm package` (`scripts/package.mjs`) reads the DECLARED text from `apps/desktop/package.json`
(`scripts/lib/artifact-names.mjs`, `declaredProductVersion`, validated through REQ-STARTUP-029's grammar), renders the
installer's name through `tools/release-naming`'s `artifactName` (`packagingArtifactNames`) and writes the yml with
`win.artifactName` and `nsis.artifactName` set to that literal as `release/electron-builder.package.yml`, the configuration
electron-builder is then run with; a literal survives its macro expander unchanged. A `-c.win.artifactName=…` override was
tried first and refused: beside `--config <file>` it makes electron-builder load the default yml a second time under the
override, doubling `files`/`extraResources` and merging the keep-prebuild counterfactual's variant over the base instead
of in place of it (measured, 26.15.3). `build-hooks.cjs`'s `checkNaming` now takes the declared text and the names
electron-builder is configured to produce — each configured pattern expanded by electron-builder's own expander, so a
`${version}` template renders hyphenated and is refused, and no configured name is refused too — and a new
`artifactBuildCompleted` hook refuses any produced file whose name is not the declared version's installer or its block
map. The declared `0.1.0rc1` renders `Rotaris-0.1.0rc1-windows-x64-setup.exe`; `0.1.0a2` and `0.1.0b3` likewise.

**Which tests pin it.** `apps/desktop/scripts/lib/artifact-names.test.ts` (the four versions' names, the grammar's
refusal of `0.1.0-rc1`, the raw read of the manifest, the produced-name rule, and the written configuration loaded by
app-builder-lib's own `getConfig` with both keys literal and the yml loaded once), `apps/desktop/scripts/build-hooks.test.ts`
(`checkNaming` refusing the hyphenated name and passing the declared one, the defect's own `${version}` template
rendered by electron-builder's `expandMacro` over a normalised `0.1.0-rc1` and refused, `artifactBuildCompleted`) and
`tools/release-naming/src/naming.test.ts` (the hook's plain-Node load of the naming module, passing and refusing).

**What stays normalised, and the question it raises.** The installer's OWN version metadata is still electron-builder's
normalised `appInfo.version`: the NSIS `VERSION` define, which becomes the uninstall registry entry's `DisplayVersion`
(REQ-STARTUP-018) and the uninstall display name `Rotaris 0.1.0-rc1`; the `ProductVersion` version key; and
`VIProductVersion`, which Windows fixes as four numbers (`0.1.0.0`) and could never carry a suffix. The running
application reports `0.1.0rc1` from the packed manifest, and every published filename is the declared text. Whether
REQ-STARTUP-158's "every artifact … SHALL declare … that same version" reaches the installer's Windows metadata, and if
it does whether a custom NSIS `WriteRegStr` over `DisplayVersion` is wanted, is **OQ-80**; the build proceeds with the
metadata as electron-builder writes it, stated in `electron-builder.yml`'s header and in ADR-0054.

**Not shown here.** No Windows package can run on this host (IC-3). The next Windows `pnpm package` with the manifest
declaring `0.1.0rc1` must show `[package] declared 0.1.0rc1 → Rotaris-0.1.0rc1-windows-x64-setup.exe`, an afterPack line
`[ic6] naming: declared 0.1.0rc1, electron-builder's normalised 0.1.0-rc1`, `release/Rotaris-0.1.0rc1-windows-x64-setup.exe`
on disk with `artifactBuildCompleted`'s acceptance line, and the installer's `DisplayVersion` as OQ-80 records it. A stable
`0.1.0` must package exactly as before.
