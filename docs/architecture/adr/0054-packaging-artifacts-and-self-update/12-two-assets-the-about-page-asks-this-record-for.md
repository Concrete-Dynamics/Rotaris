# ADR-0054 — Packaging, the four artifacts, and self-update — Two assets the About page asks this record for — 2026-09-08 (Part AG)

Part 12 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Two assets the About page asks this record for — 2026-09-08 (Part AG)

`REQ-SHELL-140` reads the build identifier from **a bundled text asset** and `REQ-SHELL-142` opens **a bundled
third-party notices file**. No build in this tree produces either, so the About page ships each requirement's own
absent branch — an em dash for Build, and the caption "This build does not carry a third-party license bundle." Both
branches are built and exercised (`pnpm settings-proof`, launch 1), so nothing here is a stub: what is owed is the two
assets, not the surface. Main resolves them the way every other bundled resource is resolved — `process.resourcesPath`
for a packaged build, else `apps/desktop/resources/` — in `apps/desktop/src/main/about.ts`, which is where a packaging
change would land them. `shell.openThirdPartyLicenses` answers `licenses.absent` until then. *2026-09-27: the notices
file now has a generator (below), and the reader's name was corrected to `THIRD-PARTY-LICENSES.txt` in the same change —
it had looked for the name in lower case, which only a case-insensitive filesystem forgives
(`../../../defects/fixed/the-about-page-looks-for-the-licence-bundle-under-a-lowercase-name.md`). Carrying the two assets
into the artifact is `first-release-plan.md` §4.4.* *2026-09-27, later: §4.4 is built — see "The two bundled assets"
below. Nothing in this section changes: the readers and both absent branches stand as written, and the proof now
measures the present branch of each.*
