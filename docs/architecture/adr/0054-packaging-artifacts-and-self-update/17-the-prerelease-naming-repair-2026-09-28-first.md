# ADR-0054 — Packaging, the four artifacts, and self-update — The prerelease naming repair — 2026-09-28, first execution (R-062; first-release plan §4.1/§4.2/§4.5)

Part 17 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The prerelease naming repair — 2026-09-28, first execution (R-062; first-release plan §4.1/§4.2/§4.5)

*Reported in place under the standing policy; row in `../first-executions.md`. The note is
`../../../defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`.* The decision above says the artifact names
are one module shared by the build configuration and the updater, "with per-target `artifactName` templates producing their
exact names". The templates were `Rotaris-${version}-windows-x64-setup.${ext}`, and `${version}` is not the declared text:
electron-builder normalises the manifest's version through loose SemVer when it reads it, and renders the normalised value
(`0.1.0rc1` → `0.1.0-rc1`). **The decision stands; how it is carried out changes.** The names are still the naming module's,
but they reach electron-builder as **literals**, rendered from the declared text, and never through its macro:

- `pnpm package` (`scripts/package.mjs`) reads the declared text from `apps/desktop/package.json` — the one place §4.1
  decided — through `scripts/lib/artifact-names.mjs` (`declaredProductVersion`, validated by REQ-STARTUP-029's grammar; a
  text outside it renders no REQ-STARTUP-031 name and stops the package), renders `artifactName(declared, 'setup')`, and
  **writes the yml it would have run with, `win.artifactName` and `nsis.artifactName` set to that literal**, as
  `release/electron-builder.package.yml`, which is what `electron-builder --win --config …` then loads. `electron-builder.yml`
  carries no `artifactName` at all any more, and `configurationWithNames` refuses to overwrite one that reappears there.
- **A `-c.win.artifactName=…` command-line override was measured and refused.** Beside `--config <file>` electron-builder
  turns the two into `{ extends: <file>, win: {…} }` and, with no path left to load, also reads the project's default
  `electron-builder.yml`: the yml is merged twice (`files` and `extraResources` doubled), and the keep-prebuild
  counterfactual's variant (`package.mjs`, IC-6) is merged *over* the base rather than in place of it, so the base's
  prebuild exclusions stay in force and the counterfactual stops being one. The written configuration keeps a single load,
  measured through app-builder-lib's own `getConfig` (`artifact-names.test.ts`).
- `build-hooks.cjs`'s `checkNaming` (afterPack) takes the declared text and **the names electron-builder is configured to
  produce**, each configured pattern expanded by electron-builder's own `expandMacro` with the values it will use — so the
  old template renders `Rotaris-0.1.0-rc1-…` and is refused with a line saying the version reached electron-builder
  hyphenated, and a configuration with no name is refused too (a bare `electron-builder --win` would fall back to
  electron-builder's own `${productName} Setup ${version}.exe`). A new **`artifactBuildCompleted`** hook refuses any produced
  file whose name is not the declared version's installer or its block map, so the rule holds after the fact as well as
  before it. afterPack's report now records both `declared` and electron-builder's `normalised`.
- The block map is accepted because electron-builder emits it for an NSIS target whatever `publish` says, as the first
  execution of 2026-09-04 above already recorded against this decision's "no … block-map files are emitted". It is named
  after the installer, so it carries the declared text; whether the pipeline publishes it is §4.7's and REQ-STARTUP-152's
  business, not the build's.

**What stays normalised, and the question it raises (OQ-80).** The installer's own Windows metadata is still written from
electron-builder's `appInfo.version`: the NSIS `VERSION` define, which becomes REQ-STARTUP-018's `DisplayVersion` and the
uninstall display name `Rotaris 0.1.0-rc1`; the `ProductVersion` version key; and `VIProductVersion`, four numbers by
Windows' own rule (`0.1.0.0`), which no spelling could carry a suffix in. `extraMetadata.version` would have forced the
declared text through — electron-builder deep-assigns it *after* normalising — and was not used, because §4.1 decided that
either it or `buildVersion` is a second place a version is declared. Whether REQ-STARTUP-158 reaches that metadata is
**OQ-80**; the build proceeds with it as electron-builder writes it, said in `electron-builder.yml`'s header.

**Measured.** 26 new unit cases: `apps/desktop/scripts/lib/artifact-names.test.ts` (15 — the names for `0.1.0`, `0.1.0rc1`,
`0.1.0a2`, `0.1.0b3`; `0.1.0-rc1` and `0.1.0dev1` refused by the grammar; the manifest read raw for all four and refused
without a version or outside the grammar; the produced-name rule over the declared installer, its block map, the hyphenated
installer and electron-builder's own pattern; the written configuration loaded by app-builder-lib's `getConfig` with both
keys literal, the three hooks and the targets kept, `extraResources` and `files` once; the bare yml loading with no name;
a template already in the configuration refused; the keep-prebuild variant named with its own files list),
`apps/desktop/scripts/build-hooks.test.ts` (10 — `checkNaming` passing the declared name and refusing the hyphenated one,
one wrong key among right ones, no name, and a declared text outside the grammar; `configuredArtifactNames` through
electron-builder's real `expandMacro` over a normalised `0.1.0-rc1` rendering the defect's exact name and being refused, the
literal surviving, the stable case identical either way; `artifactBuildCompleted` over this tree's declared version) and
one more in `tools/release-naming/src/naming.test.ts` (the hook's plain-Node load refusing the hyphenated name, beside the
passing case rewritten to the new signature); counted from `pnpm vitest run … --reporter=verbose` over the three files,
30 cases in all, 4 of them `naming.test.ts`'s older ones. *Corrected 2026-09-28 by the review round: the first report
said 16, 11 and 32 new, which no run shows.* `pnpm check` and `pnpm build` green under Node 24.

**Not shown here — IC-3** (*corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*). No Windows package can run on this host, so the repaired path has produced no installer. The
**next Windows `pnpm package`** must show, with the manifest temporarily declaring `0.1.0rc1`: the line
a line beginning `[package] declared 0.1.0rc1 → Rotaris-0.1.0rc1-windows-x64-setup.exe, written into release` (the
separator Windows prints, then `electron-builder.package.yml (from electron-builder.yml)`);
afterPack's `[ic6] naming: declared 0.1.0rc1, electron-builder's normalised 0.1.0-rc1; configured to produce
Rotaris-0.1.0rc1-windows-x64-setup.exe, Rotaris-0.1.0rc1-windows-x64-setup.exe`; `[ic6] naming: produced
Rotaris-0.1.0rc1-windows-x64-setup.exe` and the same for its `.blockmap`; the file by that name under `release/`; and the
installer's `DisplayVersion` read back from `HKCU\…\Uninstall\Rotaris` after a scratch install, for OQ-80's record. With
`0.1.0` declared it must package exactly as the 2026-09-04 execution did. The "assets" rule's first real run, owed above,
happens at the same package.
