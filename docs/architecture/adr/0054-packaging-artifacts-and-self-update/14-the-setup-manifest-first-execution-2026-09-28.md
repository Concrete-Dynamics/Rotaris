# ADR-0054 — Packaging, the four artifacts, and self-update — The setup manifest — first execution, 2026-09-28 (first-release plan §4.1)

Part 14 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## The setup manifest — first execution, 2026-09-28 (first-release plan §4.1)

*Reported in place under the standing policy; row in `../first-executions.md`.* `REQ-STARTUP-058`'s manifest exists:
`apps/desktop/resources/setup-manifest.json`, schema version 1, **committed rather than generated** — every value in it
is a pin a person chose, and a generator would only have moved the choosing — and carried by `electron-builder.yml`'s
`extraResources` to the root of the artifact's resources beside the two About files, which is where the guard's note
above said it had to land. The pin half of `pnpm release:guard` reads it at the location that note fixed, under the field
name that note fixed (`toolServerPackages`), so neither constant moved.

**What it pins, and how each figure was taken.** Git and ripgrep exactly as `REQ-STARTUP-058` states them, plus the
source URL `REQ-STARTUP-142` wants beside the name, version and licence:

| Tool | Probe | Minimum | Provisioned | Platform key | Archive | SHA-256 |
|---|---|---|---|---|---|---|
| `git` | `git --version` | none | 2.55.0 | `windows-x64` | `…/git-for-windows/git/releases/download/v2.55.0.windows.1/MinGit-2.55.0-64-bit.zip` | `31497e7968196332263459ee319d2524e3ebc5786ab895e2abad34ffdd4f4ebf` |
| `ripgrep` | `rg --version` | 14.1.0 | 15.2.0 | `windows-x64` | `…/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-x86_64-pc-windows-msvc.zip` | `71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5` |
| | | | | `macos-arm64` | `…/ripgrep-15.2.0-aarch64-apple-darwin.tar.gz` | `3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4` |
| | | | | `linux-x86_64` | `…/ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz` | `33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c` |

Each digest was **computed here, from the bytes**: `curl -sS -L -o <file> <url>` through the session's egress proxy
(TLS verified against its bundle), then `sha256sum <file>`; none was copied from a page. ripgrep publishes a `.sha256`
sidecar beside each asset, and all three agree with the computed digests. **Git for Windows publishes no per-asset
sidecar**, so MinGit's digest rests on this one download; a second download on another host before the first release is
cheap corroboration and is owed to whoever runs §5's gate. Git's licence is `GPL-2.0-only` and its capabilities
`worktrees` and `checkpoints`; ripgrep's `Unlicense OR MIT` and `search`, the words the requirement uses. Licences for
the two tools and for `@playwright/mcp` (`Apache-2.0`) were read from what the upstream declares — the registry's
record for `@playwright/mcp@0.0.80` says `Apache-2.0` — not inferred.

**Which Git archive.** `REQ-STARTUP-058` asks for "a Windows-x64-only archive from the upstream Git-for-Windows release
line". That line publishes, per release, an installer (an executable), `PortableGit` (a self-extracting 7-Zip archive)
and `MinGit` (a plain zip, in a full and a busybox variant). `REQ-STARTUP-085` accepts `zip`, `tar.gz` and `tar.xz` and
nothing else, so MinGit is the one form the extraction can take; the full variant is pinned because the busybox one is a
smaller Git nobody asked for. Its entries sit at the archive root (`cmd/git.exe`, `mingw64/bin/git.exe` — both declared
as expected executables); ripgrep's sit under one directory named after the archive (`ripgrep-15.2.0-<triple>/rg`).
`REQ-STARTUP-058` says "archive layout" and says nowhere what a layout is, and `REQ-STARTUP-086` names no base for the
expected executables' paths. Both are **OQ-87** (OQ-76 on its branch, renumbered at the merge), and the manifest is built under the reading it states: `layout` is the
format and the top-level directory (or `null`), and executables are relative to that directory.

**The other two lists.** `toolServerPackages` pins `@playwright/mcp` 0.0.80, the one package the built-in defaults launch
through a runner — counted although the `browser` entry ships `enabled: false`, which is **OQ-69**'s reading, the one the
guard already built — with `source` and `license` beside `name` and `version`, mirroring the language servers' four fields
(a reading; the guard reads two of the four). `languageServers` is `pins.json`'s list **verbatim**: the runtime's pins are
the one source of truth (the bundle step checks them against the runtime's own defaults, IC-7), and
`setup-manifest.test.ts` holds the shipped manifest's list equal to `pins.json` and to `CODE_INTELLIGENCE_LANGUAGE_SERVERS`,
so a change to one file without the other fails `pnpm check`. The file carries no `$comment` on purpose: the fingerprint
of `REQ-STARTUP-061` is over the whole canonical JSON, so an edited comment would set every installation up again.

**Where the schema lives, and why there.** `packages/config/src/setup-manifest.ts`: `SetupManifestSchema` (zod, strict —
a key the schema does not name refuses the file, at any level), the platform keys of `REQ-STARTUP-060`, the three archive
formats of `REQ-STARTUP-085`, the two provisioner families, the complete-version pattern (`REQ-STARTUP-059`'s discipline,
now imported by the guard's `isCompleteVersion` so the two admit the same strings) and `readSetupManifest`, which names
every problem by its JSON path and reports them all at once. **The platform keys are a second copy, bound by a test.**
`REQ-STARTUP-060` has one set of keys shared by artifact naming, updater asset selection and manifest artifact
selection, and `tools/release-naming`'s `PLATFORM_KEYS` is the authority for the first two; `config` has no edge to that
package, so the schema carries its own literal, and `tools/release-guard/src/pins.test.ts` — the guard imports both —
holds the two equal key for key and in order, and every archive the shipped manifest carries under one of them (found by
the independent verification of this item: the first build had the second literal and nothing binding it). The raw
`<os>-<machine>` fallback key of the same requirement is read as a key a host may compute, never one a manifest archive
is written under — the schema refuses it, so a fallback host finds no archive to select; what machine setup then does is
the consumer's, not built. The reading is raised as **OQ-88** (OQ-77 on its branch, renumbered at the merge) rather than settled here. `config` is the one package both readers may import:
the guard (`tools/**`, outside the boundary matrix) already reads `SHIPPED_MCP_SERVERS` and `resolveCommand` there, and
the product's reader — the machine-setup flow, main's by `REQ-STARTUP-089` — has `config` in main's allowed edges; and
`config` already owns both things the manifest is cross-checked against. `zod` is `config`'s first use of it, a dependency
`contracts` already carries. The schema refuses: text that is not JSON; a non-object; a schema version other than 1; a
missing list; a version that is a range, a partial, a floating tag or a prefixed spec; a digest that is not 64 lower-case
hex characters; a URL that is not `https://` (`REQ-STARTUP-082`); an archive format outside the three; a top-level
directory written as a path; an executable path that is absolute (a leading `/`, or a drive letter — `C:/git.exe`, added
after the independent verification found the pattern let it through), has a `..` component or a backslash
(`REQ-STARTUP-085`'s refusals, so the manifest never names one); an archive with no executable; a tool with no platform
key or an unknown one; a provisioner outside `npm` and `uvx`; an empty capability list; a name listed twice in any list.

**What the first execution found.** (1) **The guard passes.** `pnpm release:guard v0.1.0` exits 0 with
`version: tag v0.1.0 is stable version 0.1.0, which apps/desktop/package.json ("version") declares` and
`package pins: @playwright/mcp 0.0.80 (server "browser") — apps/desktop/resources/setup-manifest.json agrees`. With
the pin mutated to `0.0.81` it exits 1 naming both files, and `setup-manifest.test.ts` and `pins.test.ts` go red with it.
(2) **`guard.test.ts` had encoded the manifest's absence twice.** One case accepted exit 0 *or* 1 for the declared
version, and one expected `server "browser" launches …` on stderr — a line only the missing manifest had put there. Both
now require the pass; the second requires exactly one error and no mention of the manifest. (3) **The notices file now
says something false of the tree.** The generator reads `pins.json` as its manifest and writes "The setup manifest of
this build pins no machine tools"; the manifest pins two. `REQ-STARTUP-142` wants that section generated from the setup
manifest and listing Git and ripgrep. Recorded and not repaired — the build was told to leave what the notices file lists
alone while **OQ-73** is open, and OQ-73's gate-review addendum already says the generator's reader follows the shape
machine setup decides (`../../../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`).
*Repaired 2026-09-28 under R-062, OQ-73 still open (deferred 2026-10-06 by
[R-071](../../../product/requests.md#r-071), with the release pipeline's notices and signing):*
the generator now reads this manifest in `SetupManifestSchema`'s
shape (a copy of the field names, held to the schema by `notices.test.ts`, because `tools/notices` imports nothing from
`packages/`) and lists Git 2.55.0 and ripgrep 15.2.0 with their four fields. It states that machine setup, which would
download them, is not yet in the build. It lists `@playwright/mcp` 0.0.80 under a third sub-heading for
`REQ-STARTUP-152`, a placement OQ-92 raises. That first reading of the real manifest found the generator's assumed
shape wrong on one field (`version` where the manifest says `provisionedVersion`), and the runtime's name absent from
the manifest, so the sub-heading still reads it from `pins.json`. `pnpm notices` refuses on the same eleven problems as
before. (4) **Nothing
in the product reads the file.** The machine-setup flow (`REQ-STARTUP-060` onward, `REQ-MCP-112`'s setup half), the
fingerprint (`REQ-STARTUP-061`), the probe, the download and the promotion are not built and are not in the first-release
plan; the manifest is what they will read, and `SETUP_MANIFEST_FILE` is the name main would resolve the way `about.ts`
resolves the two About files. (5) **`afterPack` does not assert the manifest inside `win-unpacked`.** The yml entry is
tested through electron-builder's own `copyFiles` over a fixture (`about-assets.test.ts`), which is the step of a real
pack that places the file; the "assets" rule was left to its two files, and the artifact check is owed to the next
Windows package (IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*), as the two About files' is.

**Measured:** 14 cases in `setup-manifest.test.ts` (6 over the shipped file, 8 over malformed shapes); 4 new cases in
`pins.test.ts` (the shipped manifest against the shipped defaults; the two platform-key lists equal, every shipped archive
under a naming key, a fallback-keyed archive refused — a key renamed in the schema's copy alone turns the first two red) and the guard's constant now equal to the schema's; 2
cases in `guard.test.ts` tightened; 1 new case in `about-assets.test.ts` (the manifest copied byte for byte). Three
mutations of the shipped file were run and each turned the tests red: the browser pin (`0.0.81` — 2 tests and the
guard), a language-server version drifting from `pins.json` (`typescript` 5.9.4 — the equality case), a digest in upper
case (the schema case and four that read through it). **Not done here:** the consumer, the notices reader's move, the
`afterPack` assertion, and any download of a pinned archive by the product.
