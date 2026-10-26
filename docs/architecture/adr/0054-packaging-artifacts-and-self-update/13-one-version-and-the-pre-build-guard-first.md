# ADR-0054 — Packaging, the four artifacts, and self-update — One version and the pre-build guard — first execution, 2026-09-27 (first-release plan §4.1)

Part 13 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## One version and the pre-build guard — first execution, 2026-09-27 (first-release plan §4.1)

*Reported in place under the standing policy; row in `../first-executions.md`.* `pnpm release:guard <tag>`
(`tools/release-guard`) is `REQ-STARTUP-028`'s guard. It is one stage with two halves, which report together and
share one exit code (`REQ-STARTUP-149`: 0, or 1 with `error: …` on stderr, or 2 for usage). The **version half**
compares the tag's version with every place the build declares one (`REQ-STARTUP-158`). The **package-pin half**
compares the setup manifest with the packages the built-in default configuration launches through `npx`/`uvx`
(`REQ-STARTUP-059`). The tag is parsed by `REQ-STARTUP-027`'s grammar, which now lives in `tools/release-naming` beside
the names it renders (`parseReleaseTag`, with `REQ-STARTUP-029`'s channel), so the updater's comparison
(`REQ-STARTUP-109`) can read the same one.

**Which places declare the product version — decided here: one, `apps/desktop/package.json`.** electron-builder
renders it into each artifact's name and into the installer's metadata and packs the file into `app.asar`, and
everything the running product reports as its version is **read back** from that packed copy through one reader,
`@rotaris/platform`'s `installedProductVersion`: main's About surface, and the run host's MCP client, which sends it as
`clientInfo.version` in every handshake. The other three values the plan listed are not product versions:

- The **workspace root** (`0.0.0`) belongs to a private manifest that no build reads for a version, so its `version`
  field is **removed**. It looked like a second declaration and disagreed with the first.
- **`tools/release-naming`** (`0.0.0`) and every other `@rotaris/*` package are private workspace packages. They are the
  desktop's devDependencies, compiled into its bundles from source and never packed as packages, so their `0.0.0` is
  package-manager bookkeeping. They are left as they are and not checked. A place that ever comes to carry the version
  into an artifact joins `PRODUCT_VERSION_PLACES`: the portable stub's identity token (§4.5) is the obvious candidate.
  electron-builder's `extraMetadata.version` and `buildVersion` are deliberately unset; either one would be a second
  place.

`0.1.0` already agrees with the planned `v0.1.0`. A prerelease tag needs the declaration to be the tag's text
**exactly**, for example `0.1.0rc1`. Equality is exact text because that text is what every artifact name renders.

*The falsified reason, kept beside its replacement.* This note first said the manifest was "the only version an
artifact carries", and that every other `version` in the workspace belonged to a package no artifact carries. The gate
round that reviewed the guard found that false: `@rotaris/mcp`, compiled into the run host, declared
`CLIENT_INFO = { name: 'rotaris', version: '0.1.0' }` as a literal and told every MCP server that version during
`initialize`, so declaring `0.2.0` and tagging `v0.2.0` would have passed the guard and still reported `0.1.0` to every
tool server — against `REQ-STARTUP-158`'s "SHALL report at run time, that same version". It was not made a second place
for the guard to check; it was made a reader. `OpenOptions.clientVersion`, and the `clientVersion` of `ToolDiscovery`,
`HealthProbe` and `SessionConnections`, are required and have no default; `McpHost` is handed the product version by the
run host's composition root, which reads it from `import.meta.dirname` — `out/main/`, the directory main's bundle sits
in too — so one file answers both processes. Measured on the built app: with the manifest temporarily declaring
`0.2.0rc1`, both of alpha's handshakes in `mcp-proof`'s discovery launch named `rotaris 0.2.0rc1`; the old literal
would have said `0.1.0`. The note is `../../../defects/fixed/the-mcp-client-reports-a-literal-product-version.md`.

**What the version half found: the running app did not report the declared version.** `shell.hello` answered with
`app.getVersion()`, and Electron answers that with **its own** version for a runtime started with a file. That is the
development entry and every proof: `settings-proof` read `v44.1.1` and passed on a `/^v\d/` check. The packaged build
was right only because `app.asar` is a package. Repaired in the same change: main reads
`out/main/../../package.json`, which is the same place the guard reads in both entries, and answers `dev` when that
file declares nothing. `REQ-STARTUP-007` says `dev` there and `REQ-STARTUP-004` says `0+unknown`; the two disagree,
and `dev` is **OQ-71**'s reading. `settings-proof` now requires the exact `v0.1.0`, and it was measured failing on the
old build. The note is `../../../defects/fixed/the-unpacked-build-reports-electrons-version-as-the-products.md`.

**What it found about prereleases, not repaired here.** electron-builder 26.15.3 rewrites `0.1.0rc1` to `0.1.0-rc1`
when it normalises the package metadata (loose SemVer, measured). So a prerelease built from this configuration would
be named `Rotaris-0.1.0-rc1-…`, which is not `REQ-STARTUP-031`'s name, and `build-hooks.cjs`'s naming check compares
against the normalised value and cannot see the difference. The repair belongs to §4.2/§4.5, where the name must be
rendered from the tag's version through `tools/release-naming`:
`../../../defects/a-prerelease-version-reaches-the-installer-hyphenated.md` — *repaired 2026-09-28, the note now under <!-- historical-path: ../../../defects/a-prerelease-version-reaches-the-installer-hyphenated.md -->
`../../defects/fixed/`; the report is "The prerelease naming repair" below.*

**What the pin half found: the manifest it checks does not exist.** No setup manifest of `REQ-STARTUP-058` is in the
tree. The one `npx`/`uvx` launch among the defaults is `browser`'s `npx -y @playwright/mcp@0.0.80 --headless`. It is
resolved through the product's own `resolveCommand`, so shorthands count. It is counted although it ships
`enabled: false`: `REQ-MCP-095` requires its pin whatever the switch says, and `REQ-STARTUP-064`'s "nothing will ever
launch it" pulls the other way. That is **OQ-69**. So on this tree `pnpm release:guard v0.1.0` **exits 1 on the pin half
alone**, naming `@playwright/mcp`, `0.0.80`, both files and the missing manifest. That is the requirement working. It
also means **no release is publishable until the manifest exists**, and no step of the plan builds it (the plan's §4.1
now says so). The guard reads it at `apps/desktop/resources/setup-manifest.json` (`SETUP_MANIFEST_LOCATION`, one
constant) and needs two fields: `schemaVersion: 1` and `toolServerPackages: [{ name, version }]`. It enforces the
manifest's own discipline: complete version strings and one entry per package. The rest of `REQ-STARTUP-058`'s schema
is left to whoever builds the manifest, and so is the choice of location if they want another. **That builder inherits
two constraints.** `toolServerPackages` is the guard's reading — `REQ-STARTUP-058` says only "exact MCP package pins" —
so a different field name moves `TOOL_SERVER_PACKAGES_FIELD` with it. And `apps/desktop/resources/` is
electron-builder's `buildResources` directory, which is not packed (`extraResources` carries only
`resources/code-intelligence`), so a file there is not yet "the machine-tool manifest a build ships" (`REQ-STARTUP-059`):
the step that writes it must also add it to `extraResources`, where `REQ-STARTUP-143` and `about.ts`'s pattern would
read it.

**How it runs, and why that way.** The guard is TypeScript and imports `SHIPPED_MCP_SERVERS` and `resolveCommand`
from `@rotaris/config`, so it reads the configuration the build ships rather than a copy of it. `@rotaris/config`'s
import graph uses parameter properties, which Node's type stripping refuses (measured on `kernel/src/time.ts`). So
`cli.mjs` loads the guard through Vite's `runnerImport`, the compiler the desktop build already runs on. Vite marks that
API experimental, and the lockfile pins it. `guard.test.ts` spawns the script, so a change in that API fails
`pnpm check` before it can fail a release. `@rotaris/config` imports `@rotaris/kernel`, whose index re-exports the
generated (gitignored) requirement symbols, so **the tag workflow must run `pnpm symbols` before the guard** (§4.2); a
checkout that skips it fails closed, `error: the release guard could not run`, exit 1. One reading was taken in the
grammar: numbers are canonical decimals, so `v01.2.3` is refused (**OQ-70**).

The grammar lives in `tools/release-naming/src/index.ts` itself, not a second module. The packaging hook's naming check
(`build-hooks.cjs`, `checkNaming`, inside `afterPack`) imports that file with plain Node, whose type stripping neither
resolves a `./tag.js` specifier to `tag.ts` nor accepts parameter properties. The grammar first arrived as `tag.ts`,
re-exported with both, and the gate round measured `checkNaming('0.1.0')` failing with `ERR_MODULE_NOT_FOUND` — which
`afterPack` turns into `[ic6] BUILD REFUSED` for every installer — while `pnpm check` stayed green. It is one file of
erasable syntax now, and `naming.test.ts` calls the hook's own `checkNaming` in a child `node`, so either shape fails
the tests (both mutations measured).

**Measured:** at the first build, 36 new unit cases in the two tools (31 in `tools/release-guard`, 5 for the tag
grammar) and 3 for main's reader. After the gate round: 35 in `tools/release-guard` (the reader pinned to the guard's
place from the tool side, an empty place list failing, a leading `--`, a linear-time pin check), 6 for the grammar and
the hook's plain-Node load, 3 for the reader in `@rotaris/platform` and 1 in main, and 1 for the handshake identity on
all three MCP paths.
The two comparisons were mutated and the tests failed each time. The real script ran against this tree: `v0.1.0` gave
exit 1 on the pin half only; `v0.2.0rc1` and `vlatest` gave exit 1; no argument gave exit 2. With a scratch manifest
pinning `0.0.80`, `v0.1.0` passed with exit 0. **Not done here:** `.github/workflows/release.yml` (§4.2), the setup
manifest, and the prerelease naming repair.
